/**
 * Memory Manager - Lightweight version
 * 
 * Embedding/RAG is OPTIONAL and only loaded when:
 * 1. User explicitly enables it in settings
 * 2. Conversation exceeds threshold
 * 
 * Default: Simple summarization (no heavy ML models)
 */

import { Message } from '@/types/chat';
import { estimateTokens } from './tokenizer';
import { storageService } from './storageService';
import { logger } from './logger';

interface StoredEmbedding {
  messageId: string;
  conversationId: string;
  embedding: number[];
  content: string;
  timestamp: number;
}

interface ConversationSummary {
  conversationId: string;
  summary: string;
  summarizedUpToTimestamp: number;
  tokenCount: number;
  updatedAt: number;
}

interface ConversationEmbeddings {
  conversationId: string;
  embeddings: StoredEmbedding[];
}

interface EmbeddingModel {
  getEmbedding: (text: string) => Promise<number[]>;
}

// Lazy-loaded embedding model (only when needed)
let embeddingModel: EmbeddingModel | null = null;
let isModelLoading = false;
let modelLoadFailed = false;

// Check if RAG is enabled (user preference)
function isRAGEnabled(): boolean {
  try {
    return localStorage.getItem('anikchat-rag-enabled') === 'true';
  } catch (error) {
    logger.debug('localStorage get failed:', error);
    return false;
  }
}

export function setRAGEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('anikchat-rag-enabled', enabled ? 'true' : 'false');
  } catch (error) {
    logger.debug('localStorage set failed:', error);
  }
  if (!enabled) {
    // Unload model to free memory
    embeddingModel = null;
  }
}

/**
 * Lazy load embedding model - ONLY when RAG is enabled
 */
async function getEmbeddingModel(): Promise<EmbeddingModel | null> {
  if (!isRAGEnabled()) return null;
  if (modelLoadFailed) return null;
  if (embeddingModel) return embeddingModel;
  
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
    logger.warn('Embedding model unavailable, using basic context', e);
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
  } catch (error) {
    logger.debug('Embedding generation failed:', error);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store message embedding (only if RAG enabled)
 */
export async function storeMessage(conversationId: string, message: Message): Promise<void> {
  if (!isRAGEnabled()) return;
  if (message.role === 'system' || message.content.length <= 10) return;

  const embedding = await generateEmbedding(message.content);
  if (!embedding) return;

  const storedEmb: StoredEmbedding = {
    messageId: message.id,
    conversationId,
    embedding,
    content: message.content.slice(0, 500),
    timestamp: new Date(message.timestamp).getTime(),
  };

  try {
    const existing = await storageService.getEmbedding<ConversationEmbeddings>(conversationId);
    const embeddings = existing?.embeddings || [];
    
    if (!embeddings.find(e => e.messageId === message.id)) {
      embeddings.push(storedEmb);
      await storageService.saveEmbedding(conversationId, { conversationId, embeddings });
    }
  } catch (e) {
    logger.debug('Failed to store embedding:', e);
  }
}

/**
 * Retrieve relevant messages (only if RAG enabled and embeddings exist)
 */
export async function retrieveRelevantMessages(
  conversationId: string,
  query: string,
  topK: number = 5,
  excludeMessageIds: string[] = []
): Promise<StoredEmbedding[]> {
  if (!isRAGEnabled()) return [];
  
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const data = await storageService.getEmbedding<ConversationEmbeddings>(conversationId);
  if (!data?.embeddings?.length) return [];

  return data.embeddings
    .filter(e => !excludeMessageIds.includes(e.messageId))
    .map(e => ({ ...e, score: cosineSimilarity(queryEmbedding, e.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Get conversation summary (lightweight, always available)
 */
export async function getConversationSummary(conversationId: string): Promise<ConversationSummary | null> {
  return storageService.getSummary<ConversationSummary>(conversationId);
}

/**
 * Save conversation summary
 */
export async function saveConversationSummary(
  conversationId: string,
  summary: string,
  summarizedUpToTimestamp: number
): Promise<void> {
  const summaryObj: ConversationSummary = {
    conversationId,
    summary,
    summarizedUpToTimestamp,
    tokenCount: estimateTokens(summary),
    updatedAt: Date.now(),
  };
  await storageService.saveSummary(conversationId, summaryObj);
}

/**
 * Delete conversation memory
 */
export async function deleteConversationMemory(conversationId: string): Promise<void> {
  await storageService.deleteEmbedding(conversationId);
}

/**
 * Preload embedding model (only if RAG enabled)
 */
export async function preloadEmbeddingModel(): Promise<boolean> {
  if (!isRAGEnabled()) return false;
  try {
    await getEmbeddingModel();
    return embeddingModel !== null;
  } catch (error) {
    logger.debug('Embedding model preload failed:', error);
    return false;
  }
}

export function isEmbeddingModelLoaded(): boolean {
  return embeddingModel !== null;
}

export function isRAGAvailable(): boolean {
  return isRAGEnabled() && !modelLoadFailed;
}
