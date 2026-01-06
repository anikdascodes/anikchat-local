import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText, sanitizeInput, sanitizeUrl } from '@/lib/sanitize';

describe('sanitize', () => {
  describe('sanitizeHtml', () => {
    it('allows safe HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('removes script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      expect(sanitizeHtml(input)).toBe('<p>Hello</p>');
    });

    it('removes onclick handlers', () => {
      const input = '<button onclick="alert(1)">Click</button>';
      expect(sanitizeHtml(input)).not.toContain('onclick');
    });

    it('removes javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('adds target="_blank" to links', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });
  });

  describe('sanitizeText', () => {
    it('escapes HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeText(input);
      expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    });

    it('handles normal text', () => {
      const input = 'Hello world';
      expect(sanitizeText(input)).toBe('Hello world');
    });
  });

  describe('sanitizeInput', () => {
    it('trims whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });

    it('removes null bytes', () => {
      expect(sanitizeInput('hello\x00world')).toBe('helloworld');
    });

    it('removes control characters', () => {
      expect(sanitizeInput('hello\x08world')).toBe('helloworld');
    });

    it('preserves newlines', () => {
      expect(sanitizeInput('hello\nworld')).toBe('hello\nworld');
    });
  });

  describe('sanitizeUrl', () => {
    it('allows https URLs', () => {
      const url = 'https://example.com/path';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('allows http URLs', () => {
      const url = 'http://example.com/path';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('rejects javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('rejects data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('rejects invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBeNull();
    });
  });
});
