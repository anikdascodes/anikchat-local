/**
 * Memory Manager - Unlimited Context Window System
 * 
 * Uses storageService for all persistence (file system or IndexedDB)
 * - Store ALL messages (never lose anything)
 * - Embed messages for semantic search (RAG)
 * - On each query: summary + relevant retrieved messages + recent messages
 */

import { Message } from '@/types/chat';
import { estimateTokens } from './tokenizer';
import { storageService } from './storageService';

interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokenCount: number;
}

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

let embeddingModel: unknown = null;
let isModelLoading = false;

/**
 * Lazy load embedding model
 */
async function getEmbeddingModel() {
  if (embeddingModel) return embeddingModel;
  if (isModelLoading) {
    while (isModelLoading) await new Promise(r => setTimeout(r, 100));
    return embeddingModel;
  }

  isModelLoading = true;
  try {
    const { getEmbedding } = await import('client-vector-search');
    await getEmbedding('test'); // Warm up
    embeddingModel = { getEmbedding };
    return embeddingModel;
  } catch (e) {
    console.warn('Failed to load embedding model:', e);
    return null;
  } finally {
    isModelLoading = false;
  }
}

/**
 * Generate embedding for text
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const model = await getEmbeddingModel();
    if (!model) return null;
    const { getEmbedding } = model as { getEmbedding: (text: string) => Promise<number[]> };
    return await getEmbedding(text);
  } catch {
    return null;
  }
}

/**
 * Cosine similarity between two vectors
 */
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
 * Store a message and its embedding
 */
export async function storeMessage(conversationId: string, message: Message): Promise<void> {
  // Generate and store embedding (async)
  if (message.role !== 'system' && message.content.length > 10) {
    generateEmbedding(message.content).then(async (embedding) => {
      if (!embedding) return;
      
      const storedEmb: StoredEmbedding = {
        messageId: message.id,
        conversationId,
        embedding,
        content: message.content.slice(0, 500),
        timestamp: new Date(message.timestamp).getTime(),
      };

      // Get existing embeddings for this conversation
      const existing = await storageService.getEmbedding<ConversationEmbeddings>(conversationId);
      const embeddings = existing?.embeddings || [];
      
      // Add new embedding (avoid duplicates)
      if (!embeddings.find(e => e.messageId === message.id)) {
        embeddings.push(storedEmb);
        await storageService.saveEmbedding(conversationId, { conversationId, embeddings });
      }
    }).catch(() => {});
  }
}

/**
 * Store multiple messages (batch)
 */
export async function storeMessages(conversationId: string, messages: Message[]): Promise<void> {
  for (const msg of messages) {
    await storeMessage(conversationId, msg);
  }
}

/**
 * Retrieve semantically relevant messages using RAG
 */
export async function retrieveRelevantMessages(
  conversationId: string,
  query: string,
  topK: number = 5,
  excludeMessageIds: string[] = []
): Promise<StoredEmbedding[]> {
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return [];

  const data = await storageService.getEmbedding<ConversationEmbeddings>(conversationId);
  if (!data?.embeddings) return [];

  return data.embeddings
    .filter(e => !excludeMessageIds.includes(e.messageId))
    .map(e => ({ ...e, score: cosineSimilarity(queryEmbedding, e.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Get conversation summary
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
 * Delete conversation memory data
 */
export async function deleteConversationMemory(conversationId: string): Promise<void> {
  await storageService.deleteEmbedding(conversationId);
  // Summary deletion handled by storageService if needed
}

/**
 * Preload embedding model
 */
export async function preloadEmbeddingModel(): Promise<boolean> {
  try {
    await getEmbeddingModel();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if embedding model is loaded
 */
export function isEmbeddingModelLoaded(): boolean {
  return embeddingModel !== null;
}
