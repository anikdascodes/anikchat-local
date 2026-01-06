export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
  timestamp: Date;
  tokenCount?: number;
  // Branching support
  parentId?: string;
  siblingIndex?: number;
  totalSiblings?: number;
}

export interface MessageBranch {
  parentMessageId: string;
  branchIndex: number;
  messages: Message[];
}

export interface ConversationFolder {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  branches?: MessageBranch[];
  activeBranchId?: string;
  summary?: string;
  summarizedUpTo?: number;
  folderId?: string;
  tags?: string[];
  tokenUsage?: TokenUsage;
  createdAt: Date;
  updatedAt: Date;
}

export interface LLMModel {
  id: string;
  modelId: string;
  displayName: string;
  isVisionModel: boolean;
}

// Provider types for API-specific handling
export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'google-native' | 'custom';

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: LLMModel[];
  providerType?: ProviderType; // Auto-detected or manually set
}

export interface APIConfig {
  providers: LLMProvider[];
  activeProviderId: string | null;
  activeModelId: string | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  systemPrompt: string;
}

export const defaultConfig: APIConfig = {
  providers: [],
  activeProviderId: null,
  activeModelId: null,
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  systemPrompt: 'You are a helpful AI assistant.',
};

// Utility functions
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

export const generateTitle = (message: string): string => {
  const cleaned = message.replace(/\n/g, ' ').trim();
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}...` : cleaned;
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const getActiveProviderAndModel = (config: APIConfig): { provider: LLMProvider | null; model: LLMModel | null } => {
  if (!config?.providers || !config.activeProviderId || !config.activeModelId) {
    return { provider: null, model: null };
  }
  const provider = config.providers.find(p => p.id === config.activeProviderId) || null;
  const model = provider?.models.find(m => m.id === config.activeModelId) || null;
  return { provider, model };
};

export const hasActiveModel = (config: APIConfig): boolean => {
  if (!config?.providers) return false;
  const { provider, model } = getActiveProviderAndModel(config);
  if (!provider || !model) return false;
  // Local providers don't require API keys
  const isLocal = provider.baseUrl.includes('localhost') || provider.baseUrl.includes('127.0.0.1');
  return !!(isLocal || provider.apiKey);
};
