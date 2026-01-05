/**
 * Simple token estimator
 * Rough estimate: ~4 characters = 1 token (works for most models)
 * For production, use tiktoken or model-specific tokenizers
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  for (const msg of messages) {
    // Add overhead for role and message structure (~4 tokens per message)
    total += 4;
    total += estimateTokens(msg.content);
  }
  return total;
}

export const TOKEN_LIMITS: Record<string, number> = {
  // Large context models (reserve space for response)
  'gemini-2.5-pro': 1900000,      // 2M context
  'gemini-1.5-pro': 900000,       // 1M context
  'gemini-1.5-flash': 900000,     // 1M context
  'claude-3.5-sonnet': 180000,    // 200K context
  'claude-3-opus': 180000,        // 200K context
  'claude-3-sonnet': 180000,      // 200K context
  'claude-3-haiku': 180000,       // 200K context
  'gpt-4-turbo': 115000,          // 128K context
  'gpt-4o': 115000,               // 128K context
  'gpt-4o-mini': 115000,          // 128K context
  'gpt-4-1106': 115000,           // 128K context
  'deepseek-chat': 60000,         // 64K context
  'deepseek-coder': 60000,        // 64K context
  'llama-3.1-405b': 115000,       // 128K context
  'llama-3.1-70b': 115000,        // 128K context
  'llama-3.2': 115000,            // 128K context
  'mistral-large': 115000,        // 128K context
  'qwen': 28000,                  // 32K context
  'default': 28000,               // Safe default
};

export function getTokenLimit(modelId: string): number {
  const model = modelId.toLowerCase();
  
  // Check for exact or partial matches
  for (const [key, limit] of Object.entries(TOKEN_LIMITS)) {
    if (key !== 'default' && model.includes(key)) {
      return limit;
    }
  }
  
  // Fallback checks for common patterns
  if (model.includes('gemini-2')) return TOKEN_LIMITS['gemini-2.5-pro'];
  if (model.includes('gemini-1.5')) return TOKEN_LIMITS['gemini-1.5-pro'];
  if (model.includes('claude-3')) return TOKEN_LIMITS['claude-3.5-sonnet'];
  if (model.includes('gpt-4')) return TOKEN_LIMITS['gpt-4-turbo'];
  if (model.includes('llama-3')) return TOKEN_LIMITS['llama-3.1-70b'];
  if (model.includes('deepseek')) return TOKEN_LIMITS['deepseek-chat'];
  
  return TOKEN_LIMITS['default'];
}
