/**
 * Rate Limiter - Prevents API abuse
 * 
 * Implements token bucket algorithm per provider
 */

interface RateLimitConfig {
  maxRequests: number;    // Max requests per window
  windowMs: number;       // Time window in ms
  minIntervalMs: number;  // Min time between requests
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
  lastRequest: number;
}

// Default limits per provider type
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  openai: { maxRequests: 60, windowMs: 60000, minIntervalMs: 500 },
  anthropic: { maxRequests: 60, windowMs: 60000, minIntervalMs: 500 },
  google: { maxRequests: 60, windowMs: 60000, minIntervalMs: 500 },
  groq: { maxRequests: 30, windowMs: 60000, minIntervalMs: 1000 },
  ollama: { maxRequests: 100, windowMs: 60000, minIntervalMs: 100 }, // Local, more lenient
  default: { maxRequests: 30, windowMs: 60000, minIntervalMs: 1000 },
};

// In-memory state per provider
const rateLimitState = new Map<string, RateLimitState>();

/**
 * Get rate limit config for a provider
 */
function getConfig(providerKey: string): RateLimitConfig {
  return DEFAULT_LIMITS[providerKey] || DEFAULT_LIMITS.default;
}

/**
 * Get or create state for a provider
 */
function getState(providerId: string, config: RateLimitConfig): RateLimitState {
  let state = rateLimitState.get(providerId);
  if (!state) {
    state = {
      tokens: config.maxRequests,
      lastRefill: Date.now(),
      lastRequest: 0,
    };
    rateLimitState.set(providerId, state);
  }
  return state;
}

/**
 * Refill tokens based on elapsed time
 */
function refillTokens(state: RateLimitState, config: RateLimitConfig): void {
  const now = Date.now();
  const elapsed = now - state.lastRefill;
  const tokensToAdd = Math.floor(elapsed / config.windowMs) * config.maxRequests;
  
  if (tokensToAdd > 0) {
    state.tokens = Math.min(config.maxRequests, state.tokens + tokensToAdd);
    state.lastRefill = now;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remainingRequests: number;
}

/**
 * Check if request is allowed and consume a token
 */
export function checkRateLimit(providerId: string, providerKey: string): RateLimitResult {
  const config = getConfig(providerKey);
  const state = getState(providerId, config);
  const now = Date.now();

  // Refill tokens
  refillTokens(state, config);

  // Check minimum interval
  const timeSinceLastRequest = now - state.lastRequest;
  if (timeSinceLastRequest < config.minIntervalMs) {
    return {
      allowed: false,
      retryAfterMs: config.minIntervalMs - timeSinceLastRequest,
      remainingRequests: state.tokens,
    };
  }

  // Check token availability
  if (state.tokens <= 0) {
    const timeUntilRefill = config.windowMs - (now - state.lastRefill);
    return {
      allowed: false,
      retryAfterMs: Math.max(timeUntilRefill, config.minIntervalMs),
      remainingRequests: 0,
    };
  }

  // Consume token
  state.tokens--;
  state.lastRequest = now;

  return {
    allowed: true,
    remainingRequests: state.tokens,
  };
}

/**
 * Wait for rate limit to allow request
 */
export async function waitForRateLimit(providerId: string, providerKey: string): Promise<void> {
  const result = checkRateLimit(providerId, providerKey);
  
  if (!result.allowed && result.retryAfterMs) {
    await new Promise(resolve => setTimeout(resolve, result.retryAfterMs));
    // Re-check after waiting
    return waitForRateLimit(providerId, providerKey);
  }
}

/**
 * Get remaining requests for a provider
 */
export function getRemainingRequests(providerId: string, providerKey: string): number {
  const config = getConfig(providerKey);
  const state = getState(providerId, config);
  refillTokens(state, config);
  return state.tokens;
}

/**
 * Reset rate limit for a provider (e.g., after error)
 */
export function resetRateLimit(providerId: string): void {
  rateLimitState.delete(providerId);
}

/**
 * Clear all rate limit state
 */
export function clearAllRateLimits(): void {
  rateLimitState.clear();
}
