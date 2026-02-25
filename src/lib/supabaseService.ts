/**
 * Supabase Service — Cloud storage layer
 * Mirrors storageService API so hooks need minimal changes.
 * Conversations + messages stored in Supabase PostgreSQL.
 * Config + API keys stored in user_config / user_api_keys tables.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import type { Conversation, Message, APIConfig, LLMProvider } from '@/types/chat';

// ─── Helpers ────────────────────────────────────────────────

function rowToConversation(row: Record<string, unknown>, messages: Message[] = []): Conversation {
  return {
    id: row.id as string,
    title: row.title as string,
    messages,
    summary: (row.summary as string) ?? undefined,
    summarizedUpTo: (row.summarized_up_to as number) ?? 0,
    folderId: (row.folder_id as string) ?? undefined,
    tags: (row.tags as string[]) ?? [],
    tokenUsage: (row.token_usage as Conversation['tokenUsage']) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    role: row.role as Message['role'],
    content: row.content as string,
    images: (row.images as string[]) ?? undefined,
    tokenCount: (row.token_count as number) ?? undefined,
    parentId: (row.parent_id as string) ?? undefined,
    siblingIndex: (row.sibling_index as number) ?? undefined,
    totalSiblings: (row.total_siblings as number) ?? undefined,
    timestamp: new Date(row.created_at as string),
  };
}

// ─── Conversations ───────────────────────────────────────────

export async function listConversations(): Promise<string[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .order('updated_at', { ascending: false });

  if (error) { logger.error('listConversations error', error); return []; }
  return (data ?? []).map((r: { id: string }) => r.id);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const [convResult, msgResult] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', id).single(),
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
  ]);

  if (convResult.error || !convResult.data) return null;

  const messages = (msgResult.data ?? []).map((r) => rowToMessage(r as Record<string, unknown>));
  return rowToConversation(convResult.data as Record<string, unknown>, messages);
}

export async function saveConversation(conv: Conversation, userId: string): Promise<void> {
  // Upsert conversation row
  const { error: convErr } = await supabase.from('conversations').upsert({
    id: conv.id,
    user_id: userId,
    folder_id: conv.folderId ?? null,
    title: conv.title,
    summary: conv.summary ?? null,
    summarized_up_to: conv.summarizedUpTo ?? 0,
    tags: conv.tags ?? [],
    token_usage: conv.tokenUsage ?? {},
    updated_at: new Date(conv.updatedAt).toISOString(),
    created_at: new Date(conv.createdAt).toISOString(),
  }, { onConflict: 'id' });

  if (convErr) { logger.error('saveConversation upsert error', convErr); return; }

  // Upsert messages
  if (conv.messages.length > 0) {
    const messageRows = conv.messages.map((m) => ({
      id: m.id,
      conversation_id: conv.id,
      user_id: userId,
      role: m.role,
      content: m.content,
      images: m.images ?? [],
      token_count: m.tokenCount ?? null,
      parent_id: m.parentId ?? null,
      sibling_index: m.siblingIndex ?? null,
      total_siblings: m.totalSiblings ?? null,
      created_at: new Date(m.timestamp).toISOString(),
    }));

    const { error: msgErr } = await supabase
      .from('messages')
      .upsert(messageRows, { onConflict: 'id' });

    if (msgErr) logger.error('saveConversation messages upsert error', msgErr);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  // Messages cascade on delete via FK
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) logger.error('deleteConversation error', error);
}

// ─── Folders ─────────────────────────────────────────────────

export async function listFolders() {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) { logger.error('listFolders error', error); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    createdAt: new Date(r.created_at as string),
  }));
}

export async function saveFolder(folder: { id: string; name: string; color: string; createdAt: Date }, userId: string) {
  const { error } = await supabase.from('folders').upsert({
    id: folder.id,
    user_id: userId,
    name: folder.name,
    color: folder.color,
    created_at: folder.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) logger.error('saveFolder error', error);
}

export async function deleteFolder(id: string) {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) logger.error('deleteFolder error', error);
}

// ─── User Config ─────────────────────────────────────────────

export async function getConfig(userId: string): Promise<Partial<APIConfig> | null> {
  const { data, error } = await supabase
    .from('user_config')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    activeProviderId: (row.active_provider_id as string) ?? null,
    activeModelId: (row.active_model_id as string) ?? null,
    temperature: (row.temperature as number) ?? 0.7,
    maxTokens: (row.max_tokens as number) ?? 4096,
    topP: (row.top_p as number) ?? 1,
    frequencyPenalty: (row.frequency_penalty as number) ?? 0,
    presencePenalty: (row.presence_penalty as number) ?? 0,
    systemPrompt: (row.system_prompt as string) ?? 'You are a helpful AI assistant.',
  };
}

export async function saveConfig(userId: string, config: APIConfig): Promise<void> {
  const { error } = await supabase.from('user_config').upsert({
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
  }, { onConflict: 'user_id' });
  if (error) logger.error('saveConfig error', error);
}

// ─── API Keys (encrypted blobs) ──────────────────────────────

export async function getApiKeys(userId: string): Promise<LLMProvider[]> {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.provider_id as string,
    name: r.provider_name as string,
    baseUrl: r.base_url as string,
    // Return encrypted key with IV prefix for crypto.ts to decrypt
    apiKey: `${r.iv as string}:${r.encrypted_key as string}`,
    models: (r.models as LLMProvider['models']) ?? [],
    providerType: (r.provider_type as LLMProvider['providerType']) ?? undefined,
  }));
}

export async function saveApiKey(
  userId: string,
  provider: LLMProvider,
  encryptedKey: string,
  iv: string,
): Promise<void> {
  const { error } = await supabase.from('user_api_keys').upsert({
    user_id: userId,
    provider_id: provider.id,
    provider_name: provider.name,
    base_url: provider.baseUrl,
    encrypted_key: encryptedKey,
    iv,
    models: provider.models,
    provider_type: provider.providerType ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider_id' });
  if (error) logger.error('saveApiKey error', error);
}

export async function deleteApiKey(userId: string, providerId: string): Promise<void> {
  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', userId)
    .eq('provider_id', providerId);
  if (error) logger.error('deleteApiKey error', error);
}

export async function deleteAllUserData(userId: string): Promise<void> {
  // Cascades handle conversations → messages, profiles, folders, api_keys
  await Promise.all([
    supabase.from('conversations').delete().eq('user_id', userId),
    supabase.from('folders').delete().eq('user_id', userId),
    supabase.from('user_config').delete().eq('user_id', userId),
    supabase.from('user_api_keys').delete().eq('user_id', userId),
  ]);
}
