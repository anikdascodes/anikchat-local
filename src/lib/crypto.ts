/**
 * API Key Encryption
 *
 * Uses PBKDF2 to derive a deterministic AES-GCM encryption key from the user's
 * unique account ID. This means the SAME key is produced on every device —
 * enabling true cross-device access with no key sync needed.
 *
 * Security model:
 *   In transit    — HTTPS / TLS
 *   At rest       — Supabase infrastructure AES-256 + our own AES-GCM layer
 *   Key material  — stored NOWHERE; re-derived on each page load from userId
 *   Extractable   — false; raw key bytes are never accessible to any JS code
 *
 * Format: "enc:v2:<iv_base64>:<ciphertext_base64>"
 * Legacy "enc:<combined>" format → returns '' (user must re-enter key).
 */

import { logger } from './logger';

// In-memory cache for the current session. Cleared on sign-out.
const keyCache = new Map<string, CryptoKey>();

// ─── Key derivation ──────────────────────────────────────────

/**
 * Derive an AES-GCM CryptoKey from the user's account ID.
 * PBKDF2 with 200 000 iterations ensures brute-force resistance.
 * Cached in memory for the session.
 */
export async function deriveUserKey(userId: string): Promise<CryptoKey> {
  const cached = keyCache.get(userId);
  if (cached) return cached;

  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('anikchat-api-keys-v2'),
      iterations: 200_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );

  keyCache.set(userId, key);
  return key;
}

/** Clear the session key cache on sign-out. */
export function clearKeyCache(): void {
  keyCache.clear();
}

// ─── Encrypt / Decrypt ───────────────────────────────────────

/**
 * Encrypt an API key for a given user.
 * Returns "enc:v2:<iv_b64>:<ciphertext_b64>", or '' on failure.
 * NEVER falls back to returning plaintext.
 */
export async function encryptApiKey(apiKey: string, userId: string): Promise<string> {
  if (!apiKey || !userId) return '';

  try {
    const key = await deriveUserKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(apiKey);

    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    const ivB64   = btoa(String.fromCharCode(...iv));
    const dataB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

    return `enc:v2:${ivB64}:${dataB64}`;
  } catch (error) {
    logger.error('encryptApiKey failed — key not stored:', error);
    return '';
  }
}

/**
 * Decrypt an API key.
 *  "enc:v2:..."  — new cross-device PBKDF2 format
 *  "enc:..."     — legacy device-local format → '' (cannot decrypt cross-device)
 *  anything else — treated as plaintext (e.g. Ollama with no key)
 */
export async function decryptApiKey(encryptedKey: string, userId: string): Promise<string> {
  if (!encryptedKey || !userId) return '';
  if (!encryptedKey.startsWith('enc:')) return encryptedKey;

  try {
    if (encryptedKey.startsWith('enc:v2:')) {
      const rest  = encryptedKey.slice(7);
      const colon = rest.indexOf(':');
      if (colon === -1) return '';

      const ivB64   = rest.slice(0, colon);
      const dataB64 = rest.slice(colon + 1);

      const iv   = Uint8Array.from(atob(ivB64),   c => c.charCodeAt(0));
      const data = Uint8Array.from(atob(dataB64),  c => c.charCodeAt(0));

      const key = await deriveUserKey(userId);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(decrypted);
    }

    // Legacy device-local format — unable to decrypt cross-device
    logger.warn('Legacy encrypted key detected — user should re-enter API key.');
    return '';
  } catch (error) {
    logger.error('decryptApiKey failed:', error);
    return '';
  }
}

/** Returns true if the string has an encryption marker. */
export function isEncrypted(key: string): boolean {
  return key.startsWith('enc:');
}
