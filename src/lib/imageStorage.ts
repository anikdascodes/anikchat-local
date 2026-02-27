/**
 * Image Storage — Thin wrapper over mediaStore
 *
 * Images are stored in a separate IndexedDB database (anikchat_media),
 * completely independent from chat text data (anikchat_db).
 *
 * Messages store lightweight "media:<hash>" references.
 * Users can clear all media at any time from Settings → Data
 * to free storage without losing chat text history.
 */

import { logger } from './logger';
import {
  storeMedia,
  loadMedia,
  processImages,
  loadImages,
  isMediaRef,
} from './mediaStore';

// ─── Image reference format ──────────────────────────────────

const LEGACY_PREFIX = 'img::';  // Old format (no longer used)

export function isImageRef(str: string): boolean {
  return str.startsWith('data:') || str.startsWith(LEGACY_PREFIX) || isMediaRef(str);
}

export function getImagePath(ref: string): string {
  if (ref.startsWith(LEGACY_PREFIX)) return ref.slice(LEGACY_PREFIX.length);
  return ref;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Store an image into the separate media database.
 * Returns a lightweight "media:<hash>" reference.
 */
export async function storeImage(dataUrl: string): Promise<string> {
  return storeMedia(dataUrl);
}

/**
 * Load an image by reference.
 * Returns the data URL, or null if the media has been cleared.
 */
export async function loadImage(ref: string): Promise<string | null> {
  // Legacy IndexedDB reference — no longer supported
  if (ref.startsWith('img::')) {
    logger.warn('loadImage: legacy img:: reference — image no longer available');
    return null;
  }

  return loadMedia(ref);
}

/**
 * Process outgoing message images: store each in media DB, return refs.
 */
export async function processMessageImages(images: string[]): Promise<string[]> {
  return processImages(images);
}

/**
 * Resolve all image refs in a message to displayable URLs.
 * Missing images (user cleared media) return null and are filtered out.
 */
export async function loadMessageImages(images: string[]): Promise<(string | null)[]> {
  return loadImages(images);
}
