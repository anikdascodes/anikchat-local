/**
 * Image Storage — Client-side storage
 *
 * Images are stored as base64 data URLs directly in messages.
 * This approach is simpler and works entirely client-side without external storage.
 *
 * Future: Can add external image hosting (Cloudinary, ImgBB) if needed
 */

import { logger } from './logger';

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Image reference format ──────────────────────────────────

const LEGACY_PREFIX = 'img::';  // Old IndexedDB (no longer used)

export function isImageRef(str: string): boolean {
  return str.startsWith('data:') || str.startsWith(LEGACY_PREFIX);
}

export function getImagePath(ref: string): string {
  if (ref.startsWith(LEGACY_PREFIX)) return ref.slice(LEGACY_PREFIX.length);
  return ref;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Store image as base64 data URL in message.
 * This is the simplest approach that requires no external storage.
 */
export async function storeImage(dataUrl: string): Promise<string> {
  // Already a proper data URL or reference
  if (dataUrl.startsWith('data:') || dataUrl.startsWith('http')) return dataUrl;
  
  try {
    // For any other format, try to convert to data URL
    if (typeof dataUrl === 'string' && dataUrl.length > 0) {
      return dataUrl;
    }
  } catch (err) {
    logger.error('storeImage error:', err);
  }
  
  return dataUrl;
}

/**
 * Load image - just returns the data URL as-is since we store them directly.
 */
export async function loadImage(ref: string): Promise<string | null> {
  // Already a proper URL or data URL
  if (ref.startsWith('data:') || ref.startsWith('http')) return ref;

  // Legacy IndexedDB reference — no longer supported
  if (ref.startsWith('img::')) {
    logger.warn('loadImage: legacy img:: reference — image no longer available');
    return null;
  }

  return ref || null;
}

/**
 * Process outgoing message images: return as-is since we store base64 directly.
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
