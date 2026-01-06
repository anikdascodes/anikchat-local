import { describe, it, expect } from 'vitest';
import { isEncrypted } from '@/lib/crypto';

describe('crypto', () => {
  describe('isEncrypted', () => {
    it('returns true for encrypted keys', () => {
      expect(isEncrypted('enc:abc123')).toBe(true);
    });

    it('returns false for plain keys', () => {
      expect(isEncrypted('sk-plain-key')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });
  });

  // Note: Full encryption tests require browser environment with IndexedDB
  // The encrypt/decrypt functions gracefully fallback to plaintext in Node.js
});
