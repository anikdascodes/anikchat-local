/**
 * Local Storage Service — Client-side storage layer
 * Replaces Supabase with IndexedDB + localStorage
 * Conversations + messages stored in browser IndexedDB
 * 
 * API mirrors supabaseService for easy migration
 */

import { logger } from './logger';
import type { Conversation, Message, APIConfig, LLMProvider } from '@/types/chat';
import {
  getData,
  getAllData,
  saveData,
  deleteData,
  queryData,
  clearStore,
} from './indexedDB';

// ─── Type Conversions ────────────────────────────────────────

interface StoredConversation {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  summarized_up_to: number;
  folder_id?: string;
  tags: string[];
  token_usage?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

interface StoredMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: Message['role'];
  content: string;
  images?: string[];
  token_count?: number;
  parent_id?: string;
  sibling_index?: number;
  total_siblings?: number;
  created_at: string;
}

function rowToConversation(row: StoredConversation, messages: Message[] = []): Conversation {
  return {
    id: row.id,
    title: row.title,
    messages,
    summary: row.summary,
    summarizedUpTo: row.summarized_up_to,
    folderId: row.folder_id,
    tags: row.tags,
    tokenUsage: row.token_usage,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToMessage(row: StoredMessage): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    images: row.images,
    tokenCount: row.token_count,
    parentId: row.parent_id,
    siblingIndex: row.sibling_index,
    totalSiblings: row.total_siblings,
    timestamp: new Date(row.created_at),
  };
}

// ─── Conversations ──────────────────────────────────────────

export async function listConversations(userId?: string): Promise<string[]> {
  try {
    const all = await getAllData<StoredConversation>('conversations');
    
    // Filter by user if provided
    const filtered = userId
      ? all.filter(c => c.user_id === userId)
      : all;
    
    // Sort by updated_at descending
    return filtered
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .map(c => c.id);
  } catch (err) {
    logger.error('listConversations error', err);
    return [];
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const conv = await getData<StoredConversation>('conversations', id);
    if (!conv) return null;

    const messages = await queryData<StoredMessage>('messages', 'conversation_id', id);
    const sortedMessages = messages
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(rowToMessage);

    return rowToConversation(conv, sortedMessages);
  } catch (err) {
    logger.error('getConversation error', err);
    return null;
  }
}

export async function saveConversation(conv: Conversation, userId: string): Promise<void> {
  try {
    // Save conversation
    const storedConv: StoredConversation = {
      id: conv.id,
      user_id: userId,
      title: conv.title,
      summary: conv.summary,
      summarized_up_to: conv.summarizedUpTo ?? 0,
      folder_id: conv.folderId,
      tags: conv.tags ?? [],
      token_usage: conv.tokenUsage,
      created_at: conv.createdAt.toISOString(),
      updated_at: conv.updatedAt.toISOString(),
    };

    await saveData('conversations', storedConv);

    // Save messages
    if (conv.messages.length > 0) {
      for (const msg of conv.messages) {
        const storedMsg: StoredMessage = {
          id: msg.id,
          conversation_id: conv.id,
          user_id: userId,
          role: msg.role,
          content: msg.content,
          images: msg.images,
          token_count: msg.tokenCount,
          parent_id: msg.parentId,
          sibling_index: msg.siblingIndex,
          total_siblings: msg.totalSiblings,
          created_at: msg.timestamp.toISOString(),
        };
        await saveData('messages', storedMsg);
      }
    }
  } catch (err) {
    logger.error('saveConversation error', err);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    // Delete conversation
    await deleteData('conversations', id);
    
    // Delete all messages for this conversation
    const messages = await queryData<StoredMessage>('messages', 'conversation_id', id);
    for (const msg of messages) {
      await deleteData('messages', msg.id);
    }
  } catch (err) {
    logger.error('deleteConversation error', err);
  }
}

// ─── Folders ────────────────────────────────────────────────

interface StoredFolder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export async function listFolders(userId?: string) {
  try {
    const all = await getAllData<StoredFolder>('folders');
    
    const filtered = userId
      ? all.filter(f => f.user_id === userId)
      : all;
    
    return filtered
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        createdAt: new Date(f.created_at),
      }));
  } catch (err) {
    logger.error('listFolders error', err);
    return [];
  }
}

export async function saveFolder(
  folder: { id: string; name: string; color: string; createdAt: Date },
  userId: string
) {
  try {
    const stored: StoredFolder = {
      id: folder.id,
      user_id: userId,
      name: folder.name,
      color: folder.color,
      created_at: folder.createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveData('folders', stored);
  } catch (err) {
    logger.error('saveFolder error', err);
  }
}

export async function deleteFolder(id: string) {
  try {
    await deleteData('folders', id);
  } catch (err) {
    logger.error('deleteFolder error', err);
  }
}

// ─── User Config ────────────────────────────────────────────

interface StoredConfig {
  id: string; // Use userId as id
  user_id: string;
  active_provider_id?: string;
  active_model_id?: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  system_prompt: string;
  updated_at: string;
}

export async function getConfig(userId: string): Promise<Partial<APIConfig> | null> {
  try {
    const config = await getData<StoredConfig>('user_config', userId);
    if (!config) return null;

    return {
      activeProviderId: config.active_provider_id ?? null,
      activeModelId: config.active_model_id ?? null,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.max_tokens ?? 4096,
      topP: config.top_p ?? 1,
      frequencyPenalty: config.frequency_penalty ?? 0,
      presencePenalty: config.presence_penalty ?? 0,
      systemPrompt: config.system_prompt ?? 'You are a helpful AI assistant.',
    };
  } catch (err) {
    logger.error('getConfig error', err);
    return null;
  }
}

export async function saveConfig(userId: string, config: APIConfig): Promise<void> {
  try {
    const stored: StoredConfig = {
      id: userId,
      user_id: userId,
      active_provider_id: config.activeProviderId,
      active_model_id: config.activeModelId,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
      system_prompt: config.systemPrompt,
      updated_at: new Date().toISOString(),
    };
    await saveData('user_config', stored);
  } catch (err) {
    logger.error('saveConfig error', err);
  }
}

// ─── API Keys ────────────────────────────────────────────

interface StoredApiKey {
  id: string; // Use `${userId}:${providerId}` as id
  user_id: string;
  provider_id: string;
  provider_name: string;
  base_url: string;
  encrypted_key: string; // IV:encrypted_key format
  iv: string;
  models: LLMProvider['models'];
  provider_type?: LLMProvider['providerType'];
  updated_at: string;
}

export async function getApiKeys(userId: string): Promise<LLMProvider[]> {
  try {
    const all = await getAllData<StoredApiKey>('user_api_keys');
    const userKeys = all.filter(k => k.user_id === userId);

    return userKeys.map(k => ({
      id: k.provider_id,
      name: k.provider_name,
      baseUrl: k.base_url,
      apiKey: `${k.iv}:${k.encrypted_key}`,
      models: k.models,
      providerType: k.provider_type,
    }));
  } catch (err) {
    logger.error('getApiKeys error', err);
    return [];
  }
}

export async function saveApiKey(
  userId: string,
  provider: LLMProvider,
  encryptedKey: string,
  iv: string
): Promise<void> {
  try {
    const id = `${userId}:${provider.id}`;
    const stored: StoredApiKey = {
      id,
      user_id: userId,
      provider_id: provider.id,
      provider_name: provider.name,
      base_url: provider.baseUrl,
      encrypted_key: encryptedKey,
      iv,
      models: provider.models,
      provider_type: provider.providerType,
      updated_at: new Date().toISOString(),
    };
    await saveData('user_api_keys', stored);
  } catch (err) {
    logger.error('saveApiKey error', err);
  }
}

export async function deleteApiKey(userId: string, providerId: string): Promise<void> {
  try {
    const id = `${userId}:${providerId}`;
    await deleteData('user_api_keys', id);
  } catch (err) {
    logger.error('deleteApiKey error', err);
  }
}

// ─── User Data Management ────────────────────────────────────

export async function deleteAllUserData(userId: string): Promise<void> {
  try {
    // Delete conversations and associated messages
    const conversations = await queryData<StoredConversation>('conversations', 'user_id', userId);
    for (const conv of conversations) {
      await deleteConversation(conv.id);
    }

    // Delete folders
    const folders = await queryData<StoredFolder>('folders', 'user_id', userId);
    for (const folder of folders) {
      await deleteFolder(folder.id);
    }

    // Delete config
    await deleteData('user_config', userId);

    // Delete API keys
    const apiKeys = await queryData<StoredApiKey>('user_api_keys', 'user_id', userId);
    for (const key of apiKeys) {
      await deleteData('user_api_keys', key.id);
    }
  } catch (err) {
    logger.error('deleteAllUserData error', err);
  }
}
