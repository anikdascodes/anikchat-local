// Context window configuration
export const CONTEXT_CONFIG = {
  SYSTEM_PROMPT_BUDGET: 500,
  SUMMARY_BUDGET: 1500,
  RAG_BUDGET: 4000,
  RECENT_MESSAGES_BUDGET: 4000,
  RESPONSE_RESERVE: 4000,
  RECENT_MESSAGES_COUNT: 6,
  RAG_TOP_K: 5,
} as const;

// UI configuration
export const UI_CONFIG = {
  VIRTUALIZATION_THRESHOLD: 50,
  TOAST_DURATION: 5000,
  TOAST_DURATION_LONG: 10000,
  DEBOUNCE_MS: 300,
  CHUNK_TIMEOUT_MS: 30000,
  REQUEST_TIMEOUT_MS: 60000,
} as const;

// Storage keys
export const STORAGE_KEYS = {
  CONVERSATIONS: 'openchat-conversations',
  CONFIG: 'openchat-config',
  STORAGE_TYPE: 'anikchat-storage-type',
  SIDEBAR_COLLAPSED: 'openchat-sidebar-collapsed',
} as const;

// Token limits by model
export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-3': 200000,
  'claude-2': 100000,
  default: 8192,
} as const;
