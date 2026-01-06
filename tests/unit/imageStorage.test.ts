import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Mock localStorage
const localStorageData = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageData.set(key, value),
  removeItem: (key: string) => localStorageData.delete(key),
  clear: () => localStorageData.clear(),
});

// Mock crypto.subtle for hashing
vi.stubGlobal('crypto', {
  subtle: {
    digest: vi.fn(async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
  },
});

import {
  isImageRef,
  getImageId,
  storeImage,
  loadImage,
  processMessageImages,
  loadMessageImages,
} from '@/lib/imageStorage';

describe('imageStorage', () => {
  beforeEach(() => {
    localStorageData.clear();
    vi.clearAllMocks();
  });

  describe('isImageRef', () => {
    it('returns true for image references', () => {
      expect(isImageRef('img::abc123.jpg')).toBe(true);
      expect(isImageRef('img::hash.png')).toBe(true);
    });

    it('returns false for data URLs', () => {
      expect(isImageRef('data:image/png;base64,abc')).toBe(false);
    });

    it('returns false for regular URLs', () => {
      expect(isImageRef('https://example.com/image.jpg')).toBe(false);
    });
  });

  describe('getImageId', () => {
    it('extracts image ID from reference', () => {
      expect(getImageId('img::abc123.jpg')).toBe('abc123.jpg');
      expect(getImageId('img::hash-123.png')).toBe('hash-123.png');
    });
  });

  describe('storeImage', () => {
    it('returns reference for data URL', async () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const ref = await storeImage(dataUrl);
      
      expect(ref).toMatch(/^img::/);
      expect(ref).toContain('.jpeg');
    });

    it('returns input unchanged if not data URL', async () => {
      const url = 'https://example.com/image.jpg';
      const result = await storeImage(url);
      expect(result).toBe(url);
    });

    it('returns existing reference unchanged', async () => {
      const ref = 'img::existing.jpg';
      const result = await storeImage(ref);
      expect(result).toBe(ref);
    });
  });

  describe('loadImage', () => {
    it('returns input unchanged if not a reference', async () => {
      const dataUrl = 'data:image/png;base64,abc';
      const result = await loadImage(dataUrl);
      expect(result).toBe(dataUrl);
    });

    it('returns null for non-existent image', async () => {
      const result = await loadImage('img::nonexistent.jpg');
      expect(result).toBeNull();
    });
  });

  describe('processMessageImages', () => {
    it('converts data URLs to references', async () => {
      const images = [
        'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        'data:image/png;base64,iVBORw0KGgo=',
      ];
      
      const refs = await processMessageImages(images);
      
      expect(refs).toHaveLength(2);
      expect(refs[0]).toMatch(/^img::/);
      expect(refs[1]).toMatch(/^img::/);
    });

    it('handles empty array', async () => {
      const refs = await processMessageImages([]);
      expect(refs).toEqual([]);
    });

    it('preserves non-data URLs', async () => {
      const images = ['https://example.com/image.jpg'];
      const refs = await processMessageImages(images);
      expect(refs[0]).toBe('https://example.com/image.jpg');
    });
  });

  describe('loadMessageImages', () => {
    it('handles empty array', async () => {
      const loaded = await loadMessageImages([]);
      expect(loaded).toEqual([]);
    });

    it('passes through data URLs', async () => {
      const images = ['data:image/png;base64,abc'];
      const loaded = await loadMessageImages(images);
      expect(loaded[0]).toBe('data:image/png;base64,abc');
    });
  });

  describe('round-trip', () => {
    it('stores image and creates valid reference', async () => {
      const originalDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      
      // Store
      const ref = await storeImage(originalDataUrl);
      expect(isImageRef(ref)).toBe(true);
      
      // Verify reference format
      const imageId = getImageId(ref);
      expect(imageId).toMatch(/\.jpeg$/);
    });
  });
});
