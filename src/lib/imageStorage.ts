/**
 * Image Storage — Supabase Storage
 *
 * Images are uploaded to the "chat-images" bucket under the path:
 *   {userId}/{sha256_hash}.{ext}
 *
 * File hashing deduplicates identical uploads.
 * Loading returns a 1-hour signed URL (cached in memory to avoid re-requesting).
 *
 * Reference format stored in messages:  "simg::{userId}/{hash}.{ext}"
 * Legacy format (IndexedDB):            "img::{hash}.{ext}"  → falls back to null
 */

import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'chat-images';

// ─── Helpers ─────────────────────────────────────────────────

/** Compute a 16-byte hex hash (SHA-256 truncated) for deduplication. */
async function hashBlob(blob: Blob): Promise<string> {
  const buf =
    typeof (blob as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((res, rej) => {
          const r = new FileReader();
          r.onload  = () => res(r.result as ArrayBuffer);
          r.onerror = () => rej(r.error);
          r.readAsArrayBuffer(blob);
        });

  const hash  = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime   = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(b64);
  const arr    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ─── Image reference format ──────────────────────────────────

const NEW_PREFIX    = 'simg::'; // Supabase Storage
const LEGACY_PREFIX = 'img::';  // Old IndexedDB (no longer readable)

export function isImageRef(str: string): boolean {
  return str.startsWith(NEW_PREFIX) || str.startsWith(LEGACY_PREFIX);
}

export function getImagePath(ref: string): string {
  if (ref.startsWith(NEW_PREFIX))    return ref.slice(NEW_PREFIX.length);
  if (ref.startsWith(LEGACY_PREFIX)) return ref.slice(LEGACY_PREFIX.length);
  return ref;
}

// ─── Signed URL cache (in-memory, per session) ───────────────

interface CachedUrl { url: string; expiresAt: number }
const urlCache = new Map<string, CachedUrl>();

// ─── Public API ──────────────────────────────────────────────

/**
 * Upload a data-URL image to Supabase Storage.
 * Returns a "simg::{path}" reference to be stored in the message.
 * Falls back to the original data URL on any failure so the message still sends.
 */
export async function storeImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a ref or URL

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    logger.error('storeImage: user not authenticated — image stored inline');
    return dataUrl;
  }

  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext  = (blob.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const hash = await hashBlob(blob);
    const path = `${userId}/${hash}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: blob.type,
        cacheControl: '3600',
        upsert: true, // idempotent — same hash always overwrites same file
      });

    if (error) {
      logger.error('storeImage upload failed:', error);
      return dataUrl; // fall back to inline data URL
    }

    return `${NEW_PREFIX}${path}`;
  } catch (err) {
    logger.error('storeImage unexpected error:', err);
    return dataUrl;
  }
}

/**
 * Resolve an image reference to a signed URL (valid 1 hour).
 * Returns null for legacy IndexedDB refs (data no longer accessible).
 */
export async function loadImage(ref: string): Promise<string | null> {
  // Not a reference — already a data URL or external URL
  if (!isImageRef(ref)) return ref;

  // Legacy IndexedDB reference — no longer readable from cloud
  if (ref.startsWith(LEGACY_PREFIX)) {
    logger.warn('loadImage: legacy img:: reference — image not available in cloud storage');
    return null;
  }

  const path = getImagePath(ref);

  // Check in-memory signed-URL cache
  const cached = urlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600); // 1-hour expiry

  if (error || !data?.signedUrl) {
    logger.error('loadImage: failed to get signed URL:', error);
    return null;
  }

  urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 3_600_000 });
  return data.signedUrl;
}

/**
 * Process outgoing message images: upload each one and return storage refs.
 */
export async function processMessageImages(images: string[]): Promise<string[]> {
  return Promise.all(images.map(img => storeImage(img)));
}

/**
 * Resolve all image refs in a message to displayable URLs.
 */
export async function loadMessageImages(images: string[]): Promise<string[]> {
  const results = await Promise.all(images.map(img => loadImage(img)));
  return results.filter((url): url is string => url !== null);
}
