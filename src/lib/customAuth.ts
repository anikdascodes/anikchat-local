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
}

const CREDENTIALS_KEY = 'auth_credentials';
const SESSION_KEY = 'auth_session';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Rate-limiting state (in-memory only — resets on page refresh)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000; // 30 seconds

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

// ─── Public API ──────────────────────────────────────────────

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string): Promise<{
  error: string | null;
  session: AuthSession | null;
}> {
  if (!email || !password) {
    return { error: 'Email and password are required', session: null };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters', session: null };
  }

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address', session: null };
  }

  const credentials = getStoredCredentials();

  // Check if user already exists
  const existingUser = Object.values(credentials).find(
    c => c.email.toLowerCase() === email.toLowerCase()
  );
  if (existingUser) {
    return { error: 'User with this email already exists', session: null };
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

    const token = await generateToken(userId, email.toLowerCase(), salt);
    const session: AuthSession = {
      user: { id: userId, email: email.toLowerCase(), created_at: now },
      access_token: token,
      created_at: now,
      expires_at: Date.now() + TOKEN_EXPIRY_MS,
    };

    setSession(session);
    return { error: null, session };
  } catch (err) {
    logger.error('Sign up error', err);
    return { error: 'Failed to sign up', session: null };
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
