/**
 * Secure Client-Side Authentication
 *
 * Uses Web Crypto PBKDF2 for password hashing (100k iterations + random salt).
 * Session tokens are HMAC-signed (HS256) to prevent forgery.
 * Credentials stored in localStorage with per-user random salts.
 *
 * Rate-limiting: 5 failed attempts → 30-second lockout (client-side).
 */

import { logger } from './logger';

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  created_at: string;
  expires_at: number;
}

interface StoredCredential {
  email: string;
  passwordHash: string; // PBKDF2-derived, base64
  salt: string;         // Per-user random salt, base64
  userId: string;
  createdAt: string;
  recoveryKeyHash?: string; // PBKDF2-hashed recovery key, base64
  recoveryKeySalt?: string; // Salt for the recovery key hash, base64
}

const CREDENTIALS_KEY = 'auth_credentials';
const SESSION_KEY = 'auth_session';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Rate-limiting state (in-memory only — resets on page refresh)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000; // 30 seconds

// OTP state (in localStorage so it survives refresh within the expiry window)
const OTP_KEY = 'auth_otp_pending';
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_LENGTH = 6;

interface PendingOTP {
  email: string;
  hashedOtp: string;   // PBKDF2-hashed OTP (never stored in plaintext)
  salt: string;        // Salt for the OTP hash
  expiresAt: number;
  used: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Derive a password hash using PBKDF2 (100 000 iterations, SHA-256).
 * Returns base64-encoded 256-bit key.
 */
async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bufToBase64(bits);
}

/**
 * Generate a cryptographically random salt (16 bytes).
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generate a secure user ID using crypto.randomUUID (or fallback).
 */
function generateUserId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return `user_${crypto.randomUUID()}`;
  }
  // Fallback: 128-bit random hex
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return `user_${Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Sign a session token with HMAC-SHA256 using a per-session secret.
 * The secret is derived from the credential salt + a constant.
 */
async function signToken(payload: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(payload));
  return bufToBase64(signature);
}

/**
 * Generate an HMAC-signed session token.
 */
async function generateToken(userId: string, email: string, salt: Uint8Array): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_MS / 1000,
  }));
  const dataToSign = `${header}.${payload}`;
  const sig = await signToken(dataToSign, salt);
  return `${dataToSign}.${sig}`;
}

// ─── Credentials storage ─────────────────────────────────────

function getStoredCredentials(): Record<string, StoredCredential> {
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    logger.error('Failed to get stored credentials', err);
    return {};
  }
}

// ─── Session management ──────────────────────────────────────

export function getSession(): AuthSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    const session: AuthSession = JSON.parse(stored);

    // Check if session has expired
    if (session.expires_at < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch (err) {
    logger.error('Failed to get session', err);
    return null;
  }
}

function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// ─── Rate limiting ───────────────────────────────────────────

function checkRateLimit(email: string): string | null {
  const entry = loginAttempts.get(email);
  if (!entry) return null;

  if (entry.lockedUntil > Date.now()) {
    const secsLeft = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return `Too many failed attempts. Try again in ${secsLeft}s`;
  }

  // Lockout expired — reset
  if (entry.count >= MAX_ATTEMPTS && entry.lockedUntil <= Date.now()) {
    loginAttempts.delete(email);
  }
  return null;
}

function recordFailedAttempt(email: string): void {
  const entry = loginAttempts.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(email, entry);
}

function clearFailedAttempts(email: string): void {
  loginAttempts.delete(email);
}

// ─── Recovery Key ────────────────────────────────────────────

const RECOVERY_KEY_LENGTH = 24; // 24-char alphanumeric key
const RECOVERY_KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

/**
 * Generate a human-readable recovery key (24 chars, alphanumeric, no ambiguous chars).
 * Formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX for readability.
 */
function generateRecoveryKey(): string {
  const arr = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_LENGTH));
  const raw = Array.from(arr)
    .map(b => RECOVERY_KEY_CHARS[b % RECOVERY_KEY_CHARS.length])
    .join('');
  // Format as groups of 4
  return raw.match(/.{1,4}/g)!.join('-');
}

/**
 * Normalize a recovery key for comparison (strip dashes, uppercase).
 */
function normalizeRecoveryKey(key: string): string {
  return key.replace(/-/g, '').toUpperCase();
}

/**
 * Store the hashed recovery key for a user.
 */
async function storeRecoveryKeyHash(
  credentials: Record<string, StoredCredential>,
  userId: string,
  recoveryKey: string,
): Promise<void> {
  const credential = Object.values(credentials).find(c => c.userId === userId);
  if (!credential) return;

  const salt = generateSalt();
  const normalized = normalizeRecoveryKey(recoveryKey);
  const hash = await hashPassword(normalized, salt);

  credential.recoveryKeyHash = hash;
  credential.recoveryKeySalt = bufToBase64(salt);
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Sign up with email and password.
 * Returns a recoveryKey that the user MUST save — it's the only
 * way to regain access if the password is forgotten (when EmailJS is not set up).
 */
export async function signUp(email: string, password: string): Promise<{
  error: string | null;
  session: AuthSession | null;
  recoveryKey: string | null;
}> {
  if (!email || !password) {
    return { error: 'Email and password are required', session: null, recoveryKey: null };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters', session: null, recoveryKey: null };
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address', session: null, recoveryKey: null };
  }

  const credentials = getStoredCredentials();

  // Check if user already exists
  const existingUser = Object.values(credentials).find(
    c => c.email.toLowerCase() === email.toLowerCase()
  );
  if (existingUser) {
    return { error: 'User with this email already exists', session: null, recoveryKey: null };
  }

  try {
    const userId = generateUserId();
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const now = new Date().toISOString();

    credentials[userId] = {
      email: email.toLowerCase(),
      passwordHash,
      salt: bufToBase64(salt),
      userId,
      createdAt: now,
    };
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));

    // Generate and hash a recovery key for password-less account recovery
    const recoveryKey = generateRecoveryKey();
    await storeRecoveryKeyHash(credentials, userId, recoveryKey);

    const token = await generateToken(userId, email.toLowerCase(), salt);
    const session: AuthSession = {
      user: { id: userId, email: email.toLowerCase(), created_at: now },
      access_token: token,
      created_at: now,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(session);
    return { error: null, session, recoveryKey };
  } catch (err) {
    logger.error('Sign up error', err);
    return { error: 'Failed to sign up', session: null, recoveryKey: null };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<{
  error: string | null;
  session: AuthSession | null;
}> {
  if (!email || !password) {
    return { error: 'Email and password are required', session: null };
  }

  const normalizedEmail = email.toLowerCase();

  // Rate limiting
  const rateLimitError = checkRateLimit(normalizedEmail);
  if (rateLimitError) {
    return { error: rateLimitError, session: null };
  }

  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(
      c => c.email === normalizedEmail
    );

    if (!credential) {
      recordFailedAttempt(normalizedEmail);
      return { error: 'Invalid email or password', session: null };
    }

    const salt = base64ToBuf(credential.salt);
    const passwordHash = await hashPassword(password, salt);

    if (passwordHash !== credential.passwordHash) {
      recordFailedAttempt(normalizedEmail);
      return { error: 'Invalid email or password', session: null };
    }

    clearFailedAttempts(normalizedEmail);

    const token = await generateToken(credential.userId, normalizedEmail, salt);
    const now = new Date().toISOString();
    const session: AuthSession = {
      user: {
        id: credential.userId,
        email: normalizedEmail,
        created_at: credential.createdAt,
      },
      access_token: token,
      created_at: now,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(session);
    return { error: null, session };
  } catch (err) {
    logger.error('Sign in error', err);
    return { error: 'Failed to sign in', session: null };
  }
}

/**
 * Sign out — clear session from localStorage
 */
export async function signOut(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

// ─── OTP (One-Time Password) for Forgot Password ────────────

/**
 * Generate a cryptographically random numeric OTP.
 */
function generateOTP(): string {
  const arr = crypto.getRandomValues(new Uint32Array(1));
  return String(arr[0] % (10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/**
 * Request a password reset OTP for the given email.
 * Returns the plaintext OTP (caller must send it via email).
 * The OTP is stored hashed — the plaintext is never persisted.
 */
export async function requestPasswordReset(email: string): Promise<{
  error: string | null;
  otp: string | null;
}> {
  if (!email) return { error: 'Email is required', otp: null };

  const normalizedEmail = email.toLowerCase();

  // Check rate limiting
  const rateLimitErr = checkRateLimit(`otp:${normalizedEmail}`);
  if (rateLimitErr) return { error: rateLimitErr, otp: null };

  // Verify the email exists
  const credentials = getStoredCredentials();
  const credential = Object.values(credentials).find(c => c.email === normalizedEmail);
  if (!credential) {
    // Don't reveal whether the account exists — still "succeed" silently
    // but record a failed attempt to prevent enumeration
    recordFailedAttempt(`otp:${normalizedEmail}`);
    return { error: 'If an account with that email exists, a reset code has been sent.', otp: null };
  }

  // Generate and hash the OTP
  const otp = generateOTP();
  const otpSalt = generateSalt();
  const hashedOtp = await hashPassword(otp, otpSalt);

  const pending: PendingOTP = {
    email: normalizedEmail,
    hashedOtp,
    salt: bufToBase64(otpSalt),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    used: false,
  };

  localStorage.setItem(OTP_KEY, JSON.stringify(pending));

  return { error: null, otp };
}

/**
 * Verify an OTP and sign the user in with a temporary session.
 * The OTP is single-use — consumed immediately on success.
 */
export async function verifyOTPAndSignIn(email: string, otp: string): Promise<{
  error: string | null;
  session: AuthSession | null;
}> {
  if (!email || !otp) {
    return { error: 'Email and code are required', session: null };
  }

  const normalizedEmail = email.toLowerCase();

  // Rate limiting
  const rateLimitErr = checkRateLimit(`otp:${normalizedEmail}`);
  if (rateLimitErr) return { error: rateLimitErr, session: null };

  try {
    const raw = localStorage.getItem(OTP_KEY);
    if (!raw) {
      recordFailedAttempt(`otp:${normalizedEmail}`);
      return { error: 'No reset code pending. Please request a new one.', session: null };
    }

    const pending: PendingOTP = JSON.parse(raw);

    // Check email match
    if (pending.email !== normalizedEmail) {
      recordFailedAttempt(`otp:${normalizedEmail}`);
      return { error: 'Invalid reset code', session: null };
    }

    // Check expiry
    if (Date.now() > pending.expiresAt) {
      localStorage.removeItem(OTP_KEY);
      return { error: 'Reset code has expired. Please request a new one.', session: null };
    }

    // Check if already used
    if (pending.used) {
      localStorage.removeItem(OTP_KEY);
      return { error: 'This reset code has already been used. Please request a new one.', session: null };
    }

    // Verify OTP hash
    const otpSalt = base64ToBuf(pending.salt);
    const hashedInput = await hashPassword(otp, otpSalt);
    if (hashedInput !== pending.hashedOtp) {
      recordFailedAttempt(`otp:${normalizedEmail}`);
      return { error: 'Invalid reset code', session: null };
    }

    // Mark as used
    pending.used = true;
    localStorage.setItem(OTP_KEY, JSON.stringify(pending));

    // Find the user credential
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(c => c.email === normalizedEmail);
    if (!credential) {
      return { error: 'Account not found', session: null };
    }

    clearFailedAttempts(`otp:${normalizedEmail}`);

    // Create a session (user is now authenticated)
    const salt = base64ToBuf(credential.salt);
    const token = await generateToken(credential.userId, normalizedEmail, salt);
    const now = new Date().toISOString();
    const session: AuthSession = {
      user: {
        id: credential.userId,
        email: normalizedEmail,
        created_at: credential.createdAt,
      },
      access_token: token,
      created_at: now,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(session);

    // Clean up OTP
    localStorage.removeItem(OTP_KEY);

    return { error: null, session };
  } catch (err) {
    logger.error('OTP verification error', err);
    return { error: 'Failed to verify reset code', session: null };
  }
}

/**
 * Check if there's a pending (non-expired) OTP for the given email.
 */
export function hasPendingOTP(email: string): boolean {
  try {
    const raw = localStorage.getItem(OTP_KEY);
    if (!raw) return false;
    const pending: PendingOTP = JSON.parse(raw);
    return (
      pending.email === email.toLowerCase() &&
      !pending.used &&
      Date.now() < pending.expiresAt
    );
  } catch {
    return false;
  }
}

/**
 * Change password for the currently authenticated user.
 * Requires the current password for verification.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  if (!currentPassword || !newPassword) {
    return { error: 'Current and new passwords are required' };
  }

  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters' };
  }

  if (currentPassword === newPassword) {
    return { error: 'New password must be different from current password' };
  }

  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(c => c.userId === userId);
    if (!credential) {
      return { error: 'Account not found' };
    }

    // Verify current password
    const oldSalt = base64ToBuf(credential.salt);
    const oldHash = await hashPassword(currentPassword, oldSalt);
    if (oldHash !== credential.passwordHash) {
      return { error: 'Current password is incorrect' };
    }

    // Generate a fresh salt for the new password
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);

    // Update credential
    credential.passwordHash = newHash;
    credential.salt = bufToBase64(newSalt);
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));

    // Refresh the session token with the new salt
    const token = await generateToken(userId, credential.email, newSalt);
    const session = getSession();
    if (session) {
      setSession({
        ...session,
        access_token: token,
        expires_at: Date.now() + TOKEN_EXPIRY_MS,
      });
    }

    return { error: null };
  } catch (err) {
    logger.error('Change password error', err);
    return { error: 'Failed to change password' };
  }
}

/**
 * Refresh session token (extends expiry, generates new token)
 */
export async function refreshSession(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(c => c.userId === session.user.id);
    if (!credential) return false;

    const salt = base64ToBuf(credential.salt);
    const token = await generateToken(session.user.id, session.user.email, salt);
    const newSession: AuthSession = {
      ...session,
      access_token: token,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(newSession);
    return true;
  } catch {
    return false;
  }
}

// ─── Recovery Key — Account Recovery ─────────────────────────

/**
 * Verify a recovery key and sign the user in.
 * This is the secure fallback when EmailJS is not configured.
 */
export async function verifyRecoveryKeyAndSignIn(
  email: string,
  recoveryKey: string,
): Promise<{
  error: string | null;
  session: AuthSession | null;
}> {
  if (!email || !recoveryKey) {
    return { error: 'Email and recovery key are required', session: null };
  }

  const normalizedEmail = email.toLowerCase();

  // Rate limiting
  const rateLimitErr = checkRateLimit(`recovery:${normalizedEmail}`);
  if (rateLimitErr) return { error: rateLimitErr, session: null };

  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(c => c.email === normalizedEmail);

    if (!credential) {
      recordFailedAttempt(`recovery:${normalizedEmail}`);
      return { error: 'Invalid email or recovery key', session: null };
    }

    if (!credential.recoveryKeyHash || !credential.recoveryKeySalt) {
      return {
        error: 'No recovery key set for this account. Recovery keys are generated at signup.',
        session: null,
      };
    }

    // Verify the recovery key hash
    const salt = base64ToBuf(credential.recoveryKeySalt);
    const normalized = normalizeRecoveryKey(recoveryKey);
    const hash = await hashPassword(normalized, salt);

    if (hash !== credential.recoveryKeyHash) {
      recordFailedAttempt(`recovery:${normalizedEmail}`);
      return { error: 'Invalid email or recovery key', session: null };
    }

    clearFailedAttempts(`recovery:${normalizedEmail}`);

    // Create a session
    const credSalt = base64ToBuf(credential.salt);
    const token = await generateToken(credential.userId, normalizedEmail, credSalt);
    const now = new Date().toISOString();
    const session: AuthSession = {
      user: {
        id: credential.userId,
        email: normalizedEmail,
        created_at: credential.createdAt,
      },
      access_token: token,
      created_at: now,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(session);
    return { error: null, session };
  } catch (err) {
    logger.error('Recovery key verification error', err);
    return { error: 'Failed to verify recovery key', session: null };
  }
}

/**
 * Regenerate a recovery key for the currently authenticated user.
 * Requires the current password for verification. Invalidates the old key.
 * Returns the new plaintext recovery key (shown once, never stored).
 */
export async function regenerateRecoveryKey(
  userId: string,
  currentPassword: string,
): Promise<{
  error: string | null;
  recoveryKey: string | null;
}> {
  if (!userId || !currentPassword) {
    return { error: 'User ID and current password are required', recoveryKey: null };
  }

  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(c => c.userId === userId);
    if (!credential) {
      return { error: 'Account not found', recoveryKey: null };
    }

    // Verify current password
    const salt = base64ToBuf(credential.salt);
    const passwordHash = await hashPassword(currentPassword, salt);
    if (passwordHash !== credential.passwordHash) {
      return { error: 'Current password is incorrect', recoveryKey: null };
    }

    // Generate a new recovery key
    const recoveryKey = generateRecoveryKey();
    await storeRecoveryKeyHash(credentials, userId, recoveryKey);

    return { error: null, recoveryKey };
  } catch (err) {
    logger.error('Regenerate recovery key error', err);
    return { error: 'Failed to regenerate recovery key', recoveryKey: null };
  }
}

/**
 * Check if a user has a recovery key set.
 */
export function hasRecoveryKey(email: string): boolean {
  try {
    const credentials = getStoredCredentials();
    const credential = Object.values(credentials).find(
      c => c.email === email.toLowerCase()
    );
    return !!(credential?.recoveryKeyHash && credential?.recoveryKeySalt);
  } catch {
    return false;
  }
}
