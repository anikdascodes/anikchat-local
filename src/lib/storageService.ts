/**
 * Storage Service - File System Access API for local storage
 * 
 * Stores ALL data (chats, media, embeddings) in user-selected folder:
 * - File System Access API for Chrome/Edge (recommended)
 * - IndexedDB fallback for Firefox/Safari
 * 
 * Folder structure:
 * /anikchat-data/
 *   ├── conversations/     # Chat history JSON files
 *   ├── media/            # Images and attachments
 *   ├── embeddings/       # Vector embeddings for RAG
 *   ├── summaries/        # Conversation summaries
 *   └── config.json       # App configuration
 */

export type StorageType = 'filesystem' | 'indexeddb';

// Check if File System Access API is supported
export const isFileSystemSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

// IndexedDB wrapper (fallback)
class IndexedDBStorage {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private readonly STORE_NAME = 'anikchat-data';

  constructor(dbName: string = 'anikchat-db') {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
      const request = tx.objectStore(this.STORE_NAME).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const request = tx.objectStore(this.STORE_NAME).put(value, key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const request = tx.objectStore(this.STORE_NAME).delete(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllKeys(): Promise<string[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
      const request = tx.objectStore(this.STORE_NAME).getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  async getStorageSize(): Promise<number> {
    const keys = await this.getAllKeys();
    let total = 0;
    for (const key of keys) {
      const value = await this.get(key);
      if (value) total += new Blob([JSON.stringify(value)]).size;
    }
    return total;
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const request = tx.objectStore(this.STORE_NAME).clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// File System Access API wrapper
class FileSystemStorage {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private dataHandle: FileSystemDirectoryHandle | null = null;
  private handleStore = new IndexedDBStorage('anikchat-handles');

  async init(): Promise<boolean> {
    try {
      await this.handleStore.init();
      const saved = await this.handleStore.get<FileSystemDirectoryHandle>('root-handle');
      if (saved) {
        const permission = await (saved as any).queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          this.rootHandle = saved;
          this.dataHandle = await this.rootHandle.getDirectoryHandle('anikchat-data', { create: true });
          await this.ensureDirectories();
          return true;
        }
        this.rootHandle = saved; // Store for re-auth
      }
    } catch { /* no saved handle */ }
    return false;
  }

  async reauthorize(): Promise<boolean> {
    if (!this.rootHandle) return false;
    try {
      const permission = await (this.rootHandle as any).requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.dataHandle = await this.rootHandle.getDirectoryHandle('anikchat-data', { create: true });
        await this.ensureDirectories();
        return true;
      }
    } catch { /* denied */ }
    return false;
  }

  async pickDirectory(): Promise<boolean> {
    try {
      const handle = await (window as any).showDirectoryPicker({
        id: 'anikchat-storage',
        mode: 'readwrite',
        startIn: 'documents',
      });
      this.rootHandle = handle;
      this.dataHandle = await handle.getDirectoryHandle('anikchat-data', { create: true });
      await this.ensureDirectories();
      await this.handleStore.set('root-handle', handle);
      return true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('Folder pick error:', e);
      return false;
    }
  }

  private async ensureDirectories(): Promise<void> {
    if (!this.dataHandle) return;
    await this.dataHandle.getDirectoryHandle('conversations', { create: true });
    await this.dataHandle.getDirectoryHandle('media', { create: true });
    await this.dataHandle.getDirectoryHandle('embeddings', { create: true });
    await this.dataHandle.getDirectoryHandle('summaries', { create: true });
  }

  async clearHandle(): Promise<void> {
    await this.handleStore.delete('root-handle');
    this.rootHandle = null;
    this.dataHandle = null;
  }

  isConnected(): boolean {
    return this.dataHandle !== null;
  }

  hasSavedHandle(): boolean {
    return this.rootHandle !== null;
  }

  getDirectoryName(): string | null {
    return this.rootHandle?.name ?? null;
  }

  private async getSubDir(name: string): Promise<FileSystemDirectoryHandle> {
    if (!this.dataHandle) throw new Error('Storage not connected');
    return this.dataHandle.getDirectoryHandle(name, { create: true });
  }

  // Generic JSON file operations
  async getJSON<T>(subdir: string, filename: string): Promise<T | null> {
    try {
      const dir = await this.getSubDir(subdir);
      const fileHandle = await dir.getFileHandle(`${filename}.json`);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (e) {
      if ((e as Error).name === 'NotFoundError') return null;
      throw e;
    }
  }

  async setJSON<T>(subdir: string, filename: string, data: T): Promise<void> {
    const dir = await this.getSubDir(subdir);
    const fileHandle = await dir.getFileHandle(`${filename}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  }

  async deleteJSON(subdir: string, filename: string): Promise<void> {
    try {
      const dir = await this.getSubDir(subdir);
      await dir.removeEntry(`${filename}.json`);
    } catch { /* not found */ }
  }

  async listFiles(subdir: string): Promise<string[]> {
    try {
      const dir = await this.getSubDir(subdir);
      const files: string[] = [];
      for await (const entry of (dir as any).values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          files.push(entry.name.replace('.json', ''));
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  // Media operations
  async saveMedia(filename: string, blob: Blob): Promise<string> {
    const dir = await this.getSubDir('media');
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return filename;
  }

  async getMedia(filename: string): Promise<Blob | null> {
    try {
      const dir = await this.getSubDir('media');
      const fileHandle = await dir.getFileHandle(filename);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }

  async deleteMedia(filename: string): Promise<void> {
    try {
      const dir = await this.getSubDir('media');
      await dir.removeEntry(filename);
    } catch { /* not found */ }
  }

  async getStorageSize(): Promise<number> {
    if (!this.dataHandle) return 0;
    let total = 0;
    const calcSize = async (dir: FileSystemDirectoryHandle) => {
      for await (const entry of (dir as any).values()) {
        if (entry.kind === 'file') {
          total += (await entry.getFile()).size;
        } else {
          await calcSize(entry);
        }
      }
    };
    await calcSize(this.dataHandle);
    return total;
  }
}

// Main Storage Service - Singleton
class StorageService {
  private type: StorageType = 'indexeddb';
  private idb = new IndexedDBStorage();
  private fs = new FileSystemStorage();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const savedType = localStorage.getItem('anikchat-storage-type') as StorageType | null;
      
      if (savedType === 'filesystem' && isFileSystemSupported()) {
        const connected = await this.fs.init();
        this.type = connected ? 'filesystem' : 'indexeddb';
        if (!connected && this.fs.hasSavedHandle()) {
          this.type = 'filesystem'; // Needs re-auth
        }
      } else {
        await this.idb.init();
        this.type = 'indexeddb';
      }
      this.initialized = true;
    })();

    return this.initPromise;
  }

  // Check if first time (no storage configured)
  isFirstTime(): boolean {
    return !localStorage.getItem('anikchat-storage-type');
  }

  needsReauthorization(): boolean {
    return this.type === 'filesystem' && !this.fs.isConnected() && this.fs.hasSavedHandle();
  }

  async reauthorize(): Promise<boolean> {
    return this.fs.reauthorize();
  }

  getStorageType(): StorageType {
    return this.type;
  }

  isFileSystemConnected(): boolean {
    return this.fs.isConnected();
  }

  getDirectoryName(): string | null {
    return this.fs.getDirectoryName();
  }

  async switchToFileSystem(): Promise<boolean> {
    if (!isFileSystemSupported()) return false;
    const success = await this.fs.pickDirectory();
    if (success) {
      await this.migrateToFileSystem();
      this.type = 'filesystem';
      localStorage.setItem('anikchat-storage-type', 'filesystem');
    }
    return success;
  }

  async switchToIndexedDB(): Promise<void> {
    await this.idb.init();
    this.type = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  async disconnectFileSystem(): Promise<void> {
    await this.fs.clearHandle();
    await this.idb.init();
    this.type = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  private async migrateToFileSystem(): Promise<void> {
    // Migrate conversations from localStorage
    const convData = localStorage.getItem('openchat-conversations');
    if (convData) {
      try {
        const convs = JSON.parse(convData);
        for (const conv of convs) {
          await this.fs.setJSON('conversations', conv.id, conv);
        }
      } catch { /* skip */ }
    }

    // Migrate config
    const configData = localStorage.getItem('openchat-config');
    if (configData) {
      try {
        await this.fs.setJSON('', 'config', JSON.parse(configData));
      } catch { /* skip */ }
    }

    // Migrate from IndexedDB
    try {
      const keys = await this.idb.getAllKeys();
      for (const key of keys) {
        const value = await this.idb.get(key);
        if (key.startsWith('conv-')) {
          await this.fs.setJSON('conversations', key.replace('conv-', ''), value);
        } else if (key.startsWith('emb-')) {
          await this.fs.setJSON('embeddings', key.replace('emb-', ''), value);
        } else if (key.startsWith('summary-')) {
          await this.fs.setJSON('summaries', key.replace('summary-', ''), value);
        }
      }
    } catch { /* skip */ }
  }

  // Conversation operations
  async getConversation<T>(id: string): Promise<T | null> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getJSON('conversations', id);
    }
    return this.idb.get(`conv-${id}`);
  }

  async saveConversation<T>(id: string, data: T): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.setJSON('conversations', id, data);
    } else {
      await this.idb.set(`conv-${id}`, data);
    }
  }

  async deleteConversation(id: string): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.deleteJSON('conversations', id);
    } else {
      await this.idb.delete(`conv-${id}`);
    }
  }

  async listConversations(): Promise<string[]> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.listFiles('conversations');
    }
    const keys = await this.idb.getAllKeys();
    return keys.filter(k => k.startsWith('conv-')).map(k => k.replace('conv-', ''));
  }

  // Embedding operations
  async getEmbedding<T>(id: string): Promise<T | null> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getJSON('embeddings', id);
    }
    return this.idb.get(`emb-${id}`);
  }

  async saveEmbedding<T>(id: string, data: T): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.setJSON('embeddings', id, data);
    } else {
      await this.idb.set(`emb-${id}`, data);
    }
  }

  async deleteEmbedding(id: string): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.deleteJSON('embeddings', id);
    } else {
      await this.idb.delete(`emb-${id}`);
    }
  }

  async listEmbeddings(): Promise<string[]> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.listFiles('embeddings');
    }
    const keys = await this.idb.getAllKeys();
    return keys.filter(k => k.startsWith('emb-')).map(k => k.replace('emb-', ''));
  }

  // Summary operations
  async getSummary<T>(convId: string): Promise<T | null> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getJSON('summaries', convId);
    }
    return this.idb.get(`summary-${convId}`);
  }

  async saveSummary<T>(convId: string, data: T): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.setJSON('summaries', convId, data);
    } else {
      await this.idb.set(`summary-${convId}`, data);
    }
  }

  // Media operations
  async saveMedia(filename: string, blob: Blob): Promise<string> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.saveMedia(filename, blob);
    }
    // IndexedDB: store as base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        await this.idb.set(`media-${filename}`, reader.result);
        resolve(filename);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async getMedia(filename: string): Promise<Blob | null> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getMedia(filename);
    }
    const data = await this.idb.get<string>(`media-${filename}`);
    if (!data) return null;
    const res = await fetch(data);
    return res.blob();
  }

  // Config operations
  async getConfig<T>(): Promise<T | null> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getJSON('', 'config');
    }
    return this.idb.get('config');
  }

  async saveConfig<T>(data: T): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      await this.fs.setJSON('', 'config', data);
    } else {
      await this.idb.set('config', data);
    }
  }

  async getStorageSize(): Promise<number> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getStorageSize();
    }
    return this.idb.getStorageSize();
  }

  async clearAll(): Promise<void> {
    await this.init();
    if (this.type === 'filesystem') {
      const convs = await this.fs.listFiles('conversations');
      for (const c of convs) await this.fs.deleteJSON('conversations', c);
      const embs = await this.fs.listFiles('embeddings');
      for (const e of embs) await this.fs.deleteJSON('embeddings', e);
      const sums = await this.fs.listFiles('summaries');
      for (const s of sums) await this.fs.deleteJSON('summaries', s);
    } else {
      await this.idb.clear();
    }
  }
}

// Singleton
export const storageService = new StorageService();
