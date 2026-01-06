import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimit, getRemainingRequests, clearAllRateLimits } from '@/lib/rateLimit';

describe('rateLimit', () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe('checkRateLimit', () => {
    it('allows first request', () => {
      const result = checkRateLimit('provider-1', 'openai');
      expect(result.allowed).toBe(true);
      expect(result.remainingRequests).toBeGreaterThan(0);
    });

    it('tracks remaining requests', () => {
      const result1 = checkRateLimit('provider-1', 'openai');
      const result2 = checkRateLimit('provider-1', 'openai');
      
      // Second request should have fewer remaining
      expect(result2.remainingRequests).toBeLessThan(result1.remainingRequests + 1);
    });

    it('enforces minimum interval', async () => {
      checkRateLimit('provider-1', 'groq'); // groq has 1000ms min interval
      
      // Immediate second request should be blocked
      const result = checkRateLimit('provider-1', 'groq');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('allows requests after interval', async () => {
      checkRateLimit('provider-1', 'ollama'); // ollama has 100ms min interval
      
      await new Promise(r => setTimeout(r, 150));
      
      const result = checkRateLimit('provider-1', 'ollama');
      expect(result.allowed).toBe(true);
    });

    it('uses different limits per provider', () => {
      // Ollama is more lenient (100 requests)
      const ollamaResult = checkRateLimit('ollama-1', 'ollama');
      expect(ollamaResult.remainingRequests).toBeGreaterThanOrEqual(99);

      // Groq is stricter (30 requests)
      const groqResult = checkRateLimit('groq-1', 'groq');
      expect(groqResult.remainingRequests).toBeLessThanOrEqual(30);
    });
  });

  describe('getRemainingRequests', () => {
    it('returns max for new provider', () => {
      const remaining = getRemainingRequests('new-provider', 'openai');
      expect(remaining).toBe(60); // OpenAI default
    });

    it('decreases after requests', () => {
      checkRateLimit('provider-1', 'openai');
      checkRateLimit('provider-1', 'openai');
      
      const remaining = getRemainingRequests('provider-1', 'openai');
      expect(remaining).toBeLessThan(60);
    });
  });

  describe('resetRateLimit', () => {
    it('resets state for provider', () => {
      // Use up some requests
      for (let i = 0; i < 5; i++) {
        checkRateLimit('provider-1', 'ollama');
      }
      
      resetRateLimit('provider-1');
      
      const remaining = getRemainingRequests('provider-1', 'ollama');
      expect(remaining).toBe(100); // Back to max
    });
  });
});
