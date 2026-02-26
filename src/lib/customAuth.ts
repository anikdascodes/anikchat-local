/**
 * Custom JWT-based authentication
 * Works entirely client-side (no backend required)
 * Stores sessions in localStorage
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
  passwordHash: string; // Simple hash - NOT for production
  userId: string;
  createdAt: string;
}

const CREDENTIALS_KEY = 'auth_credentials';
const SESSION_KEY = 'auth_session';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Simple password hashing (NOT cryptographically secure for production)
 * For production, use proper password hashing on the server
 */
function simpleHash(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a simple JWT token (NOT for production)
 * For production, use jsonwebtoken library with RS256/HS256
 */
function generateToken(userId: string, email: string): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_MS / 1000,
  }));
  return `${header}.${payload}.signature`;
}

/**
 * Get stored credentials from localStorage
 */
function getStoredCredentials(): Record<string, StoredCredential> {
  try {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (err) {
    logger.error('Failed to get stored credentials', err);
    return {};
  }
}

/**
 * Get current session from localStorage
 */
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

/**
 * Store session in localStorage
 */
function setSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

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

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters', session: null };
  }

  const credentials = getStoredCredentials();

  // Check if user already exists
  const existingUser = Object.values(credentials).find(c => c.email === email);
  if (existingUser) {
    return { error: 'User with this email already exists', session: null };
  }

  try {
    // Generate user ID
    const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = simpleHash(password);
    const now = new Date().toISOString();

    // Store credentials
    credentials[userId] = {
      email,
      passwordHash,
      userId,
      createdAt: now,
    };
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));

    // Create session
    const token = generateToken(userId, email);
    const session: AuthSession = {
      user: {
        id: userId,
        email,
        created_at: now,
      },
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

  try {
    const credentials = getStoredCredentials();
    const passwordHash = simpleHash(password);

    // Find user by email
    const credential = Object.values(credentials).find(c => c.email === email);
    if (!credential || credential.passwordHash !== passwordHash) {
      return { error: 'Invalid email or password', session: null };
    }

    // Create session
    const token = generateToken(credential.userId, email);
    const now = new Date().toISOString();
    const session: AuthSession = {
      user: {
        id: credential.userId,
        email,
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
 * Sign out - clear session
 */
export async function signOut(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Refresh session token
 */
export function refreshSession(): boolean {
  const session = getSession();
  if (!session) return false;

  const token = generateToken(session.user.id, session.user.email);
  const newSession: AuthSession = {
    ...session,
    access_token: token,
    expires_at: Date.now() + TOKEN_EXPIRY_MS,
  };

  setSession(newSession);
  return true;
}

/**
 * Export user credentials for backup
 */
export function exportCredentials(): string {
  try {
    const credentials = getStoredCredentials();
    return JSON.stringify(credentials, null, 2);
  } catch (err) {
    logger.error('Failed to export credentials', err);
    return '';
  }
}

/**
 * Import user credentials from backup
 */
export function importCredentials(jsonData: string): { error: string | null } {
  try {
    const credentials = JSON.parse(jsonData) as Record<string, StoredCredential>;
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
    return { error: null };
  } catch (err) {
    logger.error('Failed to import credentials', err);
    return { error: 'Invalid credentials format' };
  }
}
