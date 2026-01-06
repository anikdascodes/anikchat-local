import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

// Mock localStorage
const localStorageData = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageData.set(key, value),
  removeItem: (key: string) => localStorageData.delete(key),
  clear: () => localStorageData.clear(),
};
vi.stubGlobal('localStorage', mockLocalStorage);

// Import after mocks are set up
import { isFileSystemSupported } from '@/lib/storageService';

// Create fresh storage service for each test
const createStorageService = async () => {
  // Clear module cache to get fresh instance
  vi.resetModules();
  const module = await import('@/lib/storageService');
  return module.storageService;
};

describe('storageService', () => {
  beforeEach(() => {
    localStorageData.clear();
    vi.clearAllMocks();
  });

  describe('isFileSystemSupported', () => {
    it('returns false when showDirectoryPicker not available', () => {
      expect(isFileSystemSupported()).toBe(false);
    });
  });

  describe('initialization', () => {
    it('isFirstTime returns true when no storage configured', async () => {
      const service = await createStorageService();
      expect(service.isFirstTime()).toBe(true);
    });

    it('isFirstTime returns false after storage type set', async () => {
      localStorageData.set('anikchat-storage-type', 'indexeddb');
      const service = await createStorageService();
      expect(service.isFirstTime()).toBe(false);
    });

    it('defaults to indexeddb storage type', async () => {
      const service = await createStorageService();
      await service.init();
      expect(service.getStorageType()).toBe('indexeddb');
    });
  });

  describe('conversation operations', () => {
    it('saves and retrieves a conversation', async () => {
      const service = await createStorageService();
      const conv = { id: 'test-1', title: 'Test Chat', messages: [] };
      
      await service.saveConversation('test-1', conv);
      const result = await service.getConversation('test-1');
      
      expect(result).toEqual(conv);
    });

    it('returns null for non-existent conversation', async () => {
      const service = await createStorageService();
      const result = await service.getConversation('non-existent');
      expect(result).toBeNull();
    });

    it('deletes a conversation', async () => {
      const service = await createStorageService();
      await service.saveConversation('test-1', { id: 'test-1' });
      await service.deleteConversation('test-1');
      
      const result = await service.getConversation('test-1');
      expect(result).toBeNull();
    });

    it('lists all conversations', async () => {
      const service = await createStorageService();
      await service.saveConversation('conv-1', { id: '1' });
      await service.saveConversation('conv-2', { id: '2' });
      
      const list = await service.listConversations();
      expect(list).toContain('conv-1');
      expect(list).toContain('conv-2');
    });

    it('updates existing conversation', async () => {
      const service = await createStorageService();
      await service.saveConversation('test-1', { id: 'test-1', title: 'Old' });
      await service.saveConversation('test-1', { id: 'test-1', title: 'New' });
      
      const result = await service.getConversation<{ title: string }>('test-1');
      expect(result?.title).toBe('New');
    });
  });

  describe('embedding operations', () => {
    it('saves and retrieves embeddings', async () => {
      const service = await createStorageService();
      const emb = { vectors: [0.1, 0.2, 0.3] };
      
      await service.saveEmbedding('doc-1', emb);
      const result = await service.getEmbedding('doc-1');
      
      expect(result).toEqual(emb);
    });

    it('lists embeddings', async () => {
      const service = await createStorageService();
      await service.saveEmbedding('doc1', { vectors: [] });
      await service.saveEmbedding('doc2', { vectors: [] });
      
      const list = await service.listEmbeddings();
      expect(list).toContain('doc1');
      expect(list).toContain('doc2');
    });

    it('deletes embeddings', async () => {
      const service = await createStorageService();
      await service.saveEmbedding('doc1', { vectors: [] });
      await service.deleteEmbedding('doc1');
      
      const result = await service.getEmbedding('doc1');
      expect(result).toBeNull();
    });
  });

  describe('summary operations', () => {
    it('saves and retrieves summaries', async () => {
      const service = await createStorageService();
      const summary = { text: 'Chat about testing', topics: ['vitest'] };
      
      await service.saveSummary('conv-1', summary);
      const result = await service.getSummary('conv-1');
      
      expect(result).toEqual(summary);
    });

    it('returns null for non-existent summary', async () => {
      const service = await createStorageService();
      const result = await service.getSummary('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('config operations', () => {
    it('saves and retrieves config', async () => {
      const service = await createStorageService();
      const config = { theme: 'dark', model: 'gpt-4' };
      
      await service.saveConfig(config);
      const result = await service.getConfig();
      
      expect(result).toEqual(config);
    });

    it('returns null when no config exists', async () => {
      const service = await createStorageService();
      await service.clearAll(); // Ensure clean state
      const result = await service.getConfig();
      expect(result).toBeNull();
    });
  });

  describe('storage type switching', () => {
    it('switchToIndexedDB sets correct type', async () => {
      const service = await createStorageService();
      await service.switchToIndexedDB();
      
      expect(service.getStorageType()).toBe('indexeddb');
      expect(localStorageData.get('anikchat-storage-type')).toBe('indexeddb');
    });

    it('switchToFileSystem returns false when not supported', async () => {
      const service = await createStorageService();
      const result = await service.switchToFileSystem();
      expect(result).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('clears all data', async () => {
      const service = await createStorageService();
      await service.saveConversation('conv-1', { id: '1' });
      await service.saveEmbedding('emb-1', { vectors: [] });
      await service.saveConfig({ theme: 'dark' });
      
      await service.clearAll();
      
      expect(await service.getConversation('conv-1')).toBeNull();
      expect(await service.getEmbedding('emb-1')).toBeNull();
    });
  });

  describe('storage size', () => {
    it('calculates storage size', async () => {
      const service = await createStorageService();
      await service.saveConversation('conv-1', { id: '1', messages: ['hello'] });
      
      const size = await service.getStorageSize();
      expect(size).toBeGreaterThan(0);
    });
  });
});
