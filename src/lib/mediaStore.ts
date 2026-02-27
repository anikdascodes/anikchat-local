/**
 * Media Store — Separate IndexedDB database for images/media
 *
 * Architecture:
 *   Chat data (text)  →  anikchat_db  (IndexedDB, permanent)
 *   Media (images)    →  anikchat_media (IndexedDB, clearable)
 *
 * Messages store lightweight "media:<hash>" references.
 * Users can clear ALL media at any time to free storage
 * without losing their chat text history.
 *
 * When an image ref can't be resolved (cleared), a placeholder is shown.
 */

import { logger } from './logger';

// ─── Constants ───────────────────────────────────────────────

const MEDIA_DB_NAME = 'anikchat_media';
const MEDIA_DB_VERSION = 1;
const MEDIA_STORE = 'media';
const MEDIA_PREFIX = 'media:';

let mediaDb: IDBDatabase | null = null;

// ─── Types ───────────────────────────────────────────────────

interface StoredMedia {
  id: string;           // SHA-256 hash of the blob content
  data: string;         // base64 data URL
  mime: string;         // e.g. "image/jpeg"
  size: number;         // byte size of original blob
  createdAt: string;    // ISO timestamp
}

export interface MediaStats {
  count: number;
  totalBytes: number;
}

// ─── Database init ───────────────────────────────────────────

async function initMediaDB(): Promise<IDBDatabase> {
  if (mediaDb) return mediaDb;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);

    request.onerror = () => {
      logger.error('Failed to open media database', request.error);
      reject(request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      mediaDb = request.result;
      resolve(mediaDb);
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────────

async function hashData(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function dataUrlToArrayBuffer(dataUrl: string): { buffer: ArrayBuffer; mime: string } {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return { buffer, mime };
}

// ─── Reference format ────────────────────────────────────────

/** Check if a string is a media reference (not raw data) */
export function isMediaRef(str: string): boolean {
  return str.startsWith(MEDIA_PREFIX);
}

/** Extract the hash from a media reference */
export function getMediaHash(ref: string): string {
  return ref.slice(MEDIA_PREFIX.length);
}

/** Build a media reference from a hash */
function makeMediaRef(hash: string): string {
  return `${MEDIA_PREFIX}${hash}`;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Store an image (as base64 data URL) into the media database.
 * Returns a lightweight "media:<hash>" reference to store in the message.
 * Deduplicates by content hash — same image = same ref.
 */
export async function storeMedia(dataUrl: string): Promise<string> {
  // Already a media ref — no-op
  if (isMediaRef(dataUrl)) return dataUrl;

  // External URLs stay as-is (not stored locally)
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) return dataUrl;

  try {
    const { buffer, mime } = dataUrlToArrayBuffer(dataUrl);
    const hash = await hashData(buffer);

    const db = await initMediaDB();

    // Check if already stored (dedup)
    const existing = await new Promise<StoredMedia | undefined>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(hash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (existing) return makeMediaRef(hash);

    // Store new media
    const stored: StoredMedia = {
      id: hash,
      data: dataUrl,
      mime,
      size: buffer.byteLength,
      createdAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const req = tx.objectStore(MEDIA_STORE).put(stored);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    return makeMediaRef(hash);
  } catch (err) {
    logger.error('storeMedia failed:', err);
    // Fallback: return the raw data URL so the image isn't lost
    return dataUrl;
  }
}

/**
 * Load a media item by reference.
 * Returns the base64 data URL, or null if the media has been cleared.
 */
export async function loadMedia(ref: string): Promise<string | null> {
  // Already a displayable URL
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;

  // Legacy formats
  if (ref.startsWith('img::')) return null;

  if (!isMediaRef(ref)) return ref || null;

  try {
    const hash = getMediaHash(ref);
    const db = await initMediaDB();

    const stored = await new Promise<StoredMedia | undefined>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(hash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return stored?.data ?? null;
  } catch (err) {
    logger.error('loadMedia failed:', err);
    return null;
  }
}

/**
 * Process outgoing message images: store each in media DB, return refs.
 */
export async function processImages(images: string[]): Promise<string[]> {
  return Promise.all(images.map(img => storeMedia(img)));
}

/**
 * Resolve message image refs to displayable URLs.
 * Missing images (cleared) are returned as null and filtered out.
 */
export async function loadImages(images: string[]): Promise<(string | null)[]> {
  return Promise.all(images.map(img => loadMedia(img)));
}

// ─── Media management (for Settings UI) ─────────────────────

/**
 * Get stats about stored media (count + total size in bytes).
 */
export async function getMediaStats(): Promise<MediaStats> {
  try {
    const db = await initMediaDB();

    const all = await new Promise<StoredMedia[]>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return {
      count: all.length,
      totalBytes: all.reduce((sum, item) => sum + item.size, 0),
    };
  } catch (err) {
    logger.error('getMediaStats failed:', err);
    return { count: 0, totalBytes: 0 };
  }
}

/**
 * Clear ALL stored media. Chat text history is unaffected.
 * Images in chat will show a "media cleared" placeholder.
 */
export async function clearAllMedia(): Promise<void> {
  try {
    const db = await initMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const req = tx.objectStore(MEDIA_STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    logger.info('All media cleared');
  } catch (err) {
    logger.error('clearAllMedia failed:', err);
    throw err;
  }
}

/**
 * Delete a single media item by reference or hash.
 */
export async function deleteMedia(refOrHash: string): Promise<void> {
  const hash = isMediaRef(refOrHash) ? getMediaHash(refOrHash) : refOrHash;
  try {
    const db = await initMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const req = tx.objectStore(MEDIA_STORE).delete(hash);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    logger.error('deleteMedia failed:', err);
  }
}
