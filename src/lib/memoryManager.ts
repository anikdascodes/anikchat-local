/**
 * Memory Manager — in-session only
 *
 * Embeddings and summaries live in memory for the current page session.
 * Conversation summaries persist durably via the `summary` field on the
 * Conversation object, which is saved to IndexedDB by useConversations.ts.
 *
 * Nothing is written to localStorage or any external store.
 */

import { Message } from '@/types/chat';
import { estimateTokens } from './tokenizer';
import { logger } from './logger';

// ─── Types ───────────────────────────────────────────────────

interface StoredEmbedding {
  messageId: string;
  conversationId: string;
  embedding: number[];
  content: string;
  timestamp: number;
  score?: number;
}

interface ConversationSummary {
  conversationId: string;
  summary: string;
  summarizedUpToTimestamp: number;
  tokenCount: number;
  updatedAt: number;
}

interface EmbeddingModel {
  getEmbedding: (text: string) => Promise<number[]>;
}

// ─── In-memory stores ────────────────────────────────────────

const embeddingStore  = new Map<string, StoredEmbedding[]>();   // conversationId → embeddings
const summaryStore    = new Map<string, ConversationSummary>(); // conversationId → summary

// ─── RAG feature flag ────────────────────────────────────────

// Default to false; toggled from AdvancedSettings. Not persisted
// (users who need RAG can re-enable after page load — it's an opt-in power feature).
let ragEnabled = false;

export function isRAGEnabled(): boolean { return ragEnabled; }

export function setRAGEnabled(enabled: boolean): void {
  ragEnabled = enabled;
  if (!enabled) {
    embeddingModel = null; // unload model to free memory
  }
}

// ─── Embedding model (lazy-loaded) ───────────────────────────

let embeddingModel: EmbeddingModel | null = null;
let isModelLoading  = false;
let modelLoadFailed = false;

async function getEmbeddingModel(): Promise<EmbeddingModel | null> {
  if (!ragEnabled)        return null;
  if (modelLoadFailed)    return null;
  if (embeddingModel)     return embeddingModel;

  if (isModelLoading) {
    while (isModelLoading) await new Promise(r => setTimeout(r, 100));
    return embeddingModel;
  }

  isModelLoading = true;
  try {
    logger.info('Loading embedding model for RAG...');
    const { getEmbedding } = await import('client-vector-search');
    await getEmbedding('warmup');
    embeddingModel = { getEmbedding };
    logger.info('Embedding model loaded');
    return embeddingModel;
  } catch (e) {
    logger.warn('Embedding model unavailable — RAG disabled', e);
    modelLoadFailed = true;
    return null;
  } finally {
    isModelLoading = false;
  }
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const model = await getEmbeddingModel();
  if (!model) return null;
  try {
    return await model.getEmbedding(text);
  } catch (e) {
    logger.debug('Embedding generation failed:', e);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Store a message embedding in memory (only when RAG is enabled).
 */
export async function storeMessage(conversationId: string, message: Message): Promise<void> {
  if (!ragEnabled) return;
  if (message.role === 'system' || message.content.length <= 10) return;

  const embedding = await generateEmbedding(message.content);
  if (!embedding) return;

  const bucket = embeddingStore.get(conversationId) ?? [];
  if (!bucket.find(e => e.messageId === message.id)) {
    bucket.push({
      messageId: message.id,
      conversationId,
      embedding,
      content: message.content.slice(0, 500),
      timestamp: new Date(message.timestamp).getTime(),
    });
    embeddingStore.set(conversationId, bucket);
  }
}

/**
 * Retrieve the most relevant older messages for the current query.
 */
export async function retrieveRelevantMessages(
  conversationId: string,
  query: string,
  topK = 5,
  excludeMessageIds: string[] = [],
): Promise<StoredEmbedding[]> {
  if (!ragEnabled) return [];

  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const bucket = embeddingStore.get(conversationId) ?? [];
  return bucket
    .filter(e => !excludeMessageIds.includes(e.messageId))
    .map(e   => ({ ...e, score: cosineSimilarity(queryEmbedding, e.embedding) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topK);
}

/**
 * Get the in-session conversation summary (populated by saveConversationSummary).
 * Returns null on page load — the caller must fall back to conv.summary from IndexedDB.
 */
export async function getConversationSummary(conversationId: string): Promise<ConversationSummary | null> {
  return summaryStore.get(conversationId) ?? null;
}

/**
 * Save a conversation summary to the in-session cache.
 * The durable copy is persisted automatically through the conversation object
 * (conv.summary) which is saved to IndexedDB by useConversations.ts.
 */
export async function saveConversationSummary(
  conversationId: string,
  summary: string,
  summarizedUpToTimestamp: number,
): Promise<void> {
  summaryStore.set(conversationId, {
    conversationId,
    summary,
    summarizedUpToTimestamp,
    tokenCount: estimateTokens(summary),
    updatedAt: Date.now(),
  });
}

/**
 * Remove a conversation's in-memory data when the conversation is deleted.
 */
export async function deleteConversationMemory(conversationId: string): Promise<void> {
  embeddingStore.delete(conversationId);
  summaryStore.delete(conversationId);
}

export async function preloadEmbeddingModel(): Promise<boolean> {
  if (!ragEnabled) return false;
  try {
    await getEmbeddingModel();
    return embeddingModel !== null;
  } catch {
    return false;
  }
}

export function isEmbeddingModelLoaded(): boolean {
  return embeddingModel !== null;
}

export function isRAGAvailable(): boolean {
  return ragEnabled && !modelLoadFailed;
}
