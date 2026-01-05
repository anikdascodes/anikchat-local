/**
 * Memory Manager - Unlimited Context Window System
 * 
 * Hybrid approach:
 * 1. Store ALL messages in IndexedDB (never lose anything)
 * 2. Embed messages for semantic search (RAG)
 * 3. On each query: summary + relevant retrieved messages + recent messages
 */

import { Message } from '@/types/chat';
import { estimateTokens } from './tokenizer';

// IndexedDB for message storage
const DB_NAME = 'anikchat-memory';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const EMBEDDINGS_STORE = 'embeddings';
const SUMMARIES_STORE = 'summaries';

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

let db: IDBDatabase | null = null;
let embeddingModel: unknown = null;
let isModelLoading = false;

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Messages store
      if (!database.objectStoreNames.contains(MESSAGES_STORE)) {
        const msgStore = database.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Embeddings store
      if (!database.objectStoreNames.contains(EMBEDDINGS_STORE)) {
        const embStore = database.createObjectStore(EMBEDDINGS_STORE, { keyPath: 'messageId' });
        embStore.createIndex('conversationId', 'conversationId', { unique: false });
      }

      // Summaries store
      if (!database.objectStoreNames.contains(SUMMARIES_STORE)) {
        database.createObjectStore(SUMMARIES_STORE, { keyPath: 'conversationId' });
      }
    };
  });
}

/**
 * Lazy load embedding model
 */
async function getEmbeddingModel() {
  if (embeddingModel) return embeddingModel;
  if (isModelLoading) {
    // Wait for model to load
    while (isModelLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return embeddingModel;
  }

  isModelLoading = true;
  try {
    const { getEmbedding } = await import('client-vector-search');
    // Warm up the model
    await getEmbedding('test');
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
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Store a message and its embedding
 */
export async function storeMessage(
  conversationId: string,
  message: Message
): Promise<void> {
  const database = await initDB();

  const storedMsg: StoredMessage = {
    id: message.id,
    conversationId,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp).getTime(),
    tokenCount: estimateTokens(message.content),
  };

  // Store message
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readwrite');
    tx.objectStore(MESSAGES_STORE).put(storedMsg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Generate and store embedding (async, don't block)
  if (message.role !== 'system' && message.content.length > 10) {
    generateEmbedding(message.content).then(async (embedding) => {
      if (!embedding) return;
      const storedEmb: StoredEmbedding = {
        messageId: message.id,
        conversationId,
        embedding,
        content: message.content.slice(0, 500), // Store truncated content for quick access
        timestamp: storedMsg.timestamp,
      };
      const tx = database.transaction(EMBEDDINGS_STORE, 'readwrite');
      tx.objectStore(EMBEDDINGS_STORE).put(storedEmb);
    }).catch(() => { /* ignore embedding failures */ });
  }
}

/**
 * Store multiple messages (batch)
 */
export async function storeMessages(
  conversationId: string,
  messages: Message[]
): Promise<void> {
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
  const database = await initDB();
  const queryEmbedding = await generateEmbedding(query);
  
  if (!queryEmbedding) return [];

  // Get all embeddings for this conversation
  const embeddings = await new Promise<StoredEmbedding[]>((resolve, reject) => {
    const tx = database.transaction(EMBEDDINGS_STORE, 'readonly');
    const index = tx.objectStore(EMBEDDINGS_STORE).index('conversationId');
    const request = index.getAll(conversationId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  // Filter and score
  const scored = embeddings
    .filter(e => !excludeMessageIds.includes(e.messageId))
    .map(e => ({
      ...e,
      score: cosineSimilarity(queryEmbedding, e.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/**
 * Get or create conversation summary
 */
export async function getConversationSummary(
  conversationId: string
): Promise<ConversationSummary | null> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SUMMARIES_STORE, 'readonly');
    const request = tx.objectStore(SUMMARIES_STORE).get(conversationId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save conversation summary
 */
export async function saveConversationSummary(
  conversationId: string,
  summary: string,
  summarizedUpToTimestamp: number
): Promise<void> {
  const database = await initDB();
  
  const summaryObj: ConversationSummary = {
    conversationId,
    summary,
    summarizedUpToTimestamp,
    tokenCount: estimateTokens(summary),
    updatedAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(SUMMARIES_STORE, 'readwrite');
    tx.objectStore(SUMMARIES_STORE).put(summaryObj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all messages for a conversation (for export/backup)
 */
export async function getAllMessages(
  conversationId: string
): Promise<StoredMessage[]> {
  const database = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = database.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index('conversationId');
    const request = index.getAll(conversationId);
    request.onsuccess = () => {
      const messages = (request.result || []).sort((a, b) => a.timestamp - b.timestamp);
      resolve(messages);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete conversation data
 */
export async function deleteConversationMemory(conversationId: string): Promise<void> {
  const database = await initDB();

  // Delete messages
  const messages = await getAllMessages(conversationId);
  const msgTx = database.transaction(MESSAGES_STORE, 'readwrite');
  for (const msg of messages) {
    msgTx.objectStore(MESSAGES_STORE).delete(msg.id);
  }

  // Delete embeddings
  const embTx = database.transaction(EMBEDDINGS_STORE, 'readwrite');
  const embIndex = embTx.objectStore(EMBEDDINGS_STORE).index('conversationId');
  const embRequest = embIndex.getAllKeys(conversationId);
  embRequest.onsuccess = () => {
    for (const key of embRequest.result) {
      embTx.objectStore(EMBEDDINGS_STORE).delete(key);
    }
  };

  // Delete summary
  const sumTx = database.transaction(SUMMARIES_STORE, 'readwrite');
  sumTx.objectStore(SUMMARIES_STORE).delete(conversationId);
}

/**
 * Preload embedding model (call on app init for better UX)
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
 * Check if embedding model is available
 */
export function isEmbeddingModelLoaded(): boolean {
  return embeddingModel !== null;
}
