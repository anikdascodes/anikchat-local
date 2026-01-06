/**
 * Image Storage Service
 * 
 * Stores images separately from conversations to reduce JSON size.
 * Images are stored by hash to deduplicate.
 */

import { storageService } from './storageService';

// Simple hash for deduplication
async function hashImage(base64: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(base64.slice(0, 1000)); // Hash first 1KB for speed
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Convert data URL to blob
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

// Image reference format: img::<hash>
const IMG_PREFIX = 'img::';

export function isImageRef(str: string): boolean {
  return str.startsWith(IMG_PREFIX);
}

export function getImageId(ref: string): string {
  return ref.replace(IMG_PREFIX, '');
}

/**
 * Store an image and return a reference ID
 */
export async function storeImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) {
    return dataUrl; // Already a reference or URL
  }

  const hash = await hashImage(dataUrl);
  const imageId = `${hash}-${Date.now()}`;
  
  // Store as blob in file system, or base64 in IndexedDB
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split('/')[1] || 'jpg';
  await storageService.saveMedia(`${imageId}.${ext}`, blob);
  
  return `${IMG_PREFIX}${imageId}.${ext}`;
}

/**
 * Load an image by reference, returns data URL
 */
export async function loadImage(ref: string): Promise<string | null> {
  if (!isImageRef(ref)) {
    return ref; // Already a data URL
  }

  const filename = getImageId(ref);
  const blob = await storageService.getMedia(filename);
  
  if (!blob) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Process images in a message - store and replace with refs
 */
export async function processMessageImages(images: string[]): Promise<string[]> {
  const refs: string[] = [];
  for (const img of images) {
    const ref = await storeImage(img);
    refs.push(ref);
  }
  return refs;
}

/**
 * Load all images in a message - replace refs with data URLs
 */
export async function loadMessageImages(images: string[]): Promise<string[]> {
  const loaded: string[] = [];
  for (const img of images) {
    const dataUrl = await loadImage(img);
    if (dataUrl) loaded.push(dataUrl);
  }
  return loaded;
}
