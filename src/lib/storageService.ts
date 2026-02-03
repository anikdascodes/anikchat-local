/**
 * Storage Service - File System Access API for local storage
 * 
 * Stores ALL data (chats, media, embeddings) in user-selected folder:
 * - File System Access API for Chrome/Edge (recommended)
 * - IndexedDB fallback for Firefox/Safari
 */

import { logger } from './logger';

export type StorageType = 'filesystem' | 'indexeddb';

// Extended FileSystemDirectoryHandle with permission methods
interface ExtendedFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface ShowDirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

declare global {
  interface Window {
    showDirectoryPicker?(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  }
}

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
  private rootHandle: ExtendedFileSystemDirectoryHandle | null = null;
  private dataHandle: FileSystemDirectoryHandle | null = null;
  private handleStore = new IndexedDBStorage('anikchat-handles');

  // Optimization E: In-memory cache for lightning fast reads from slow USB sticks
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  async init(): Promise<boolean> {
    try {
      await this.handleStore.init();
      const saved = await this.handleStore.get<ExtendedFileSystemDirectoryHandle>('root-handle');
      if (saved) {
        const permission = await saved.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          this.rootHandle = saved;
          this.dataHandle = await this.rootHandle.getDirectoryHandle('anikchat-data', { create: true });
          await this.ensureDirectories();
          return true;
        }
        this.rootHandle = saved;
      }
    } catch {
      logger.debug('No saved file system handle');
    }
    return false;
  }

  async reauthorize(): Promise<boolean> {
    if (!this.rootHandle) return false;
    try {
      const permission = await this.rootHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.dataHandle = await this.rootHandle.getDirectoryHandle('anikchat-data', { create: true });
        await this.ensureDirectories();
        return true;
      }
    } catch {
      logger.debug('Permission denied for file system');
    }
    return false;
  }

  async pickDirectory(): Promise<boolean> {
    if (!window.showDirectoryPicker) return false;
    try {
      const handle = await window.showDirectoryPicker({
        id: 'anikchat-storage',
        mode: 'readwrite',
        startIn: 'documents',
      }) as ExtendedFileSystemDirectoryHandle;
      this.rootHandle = handle;
      this.dataHandle = await handle.getDirectoryHandle('anikchat-data', { create: true });
      await this.ensureDirectories();
      await this.handleStore.set('root-handle', handle);
      return true;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        logger.error('Folder pick error:', e);
      }
      return false;
    }
  }

  private async ensureDirectories(): Promise<void> {
    if (!this.dataHandle) return;
    await this.dataHandle.getDirectoryHandle('conversations', { create: true });
    await this.dataHandle.getDirectoryHandle('media', { create: true });
    await this.dataHandle.getDirectoryHandle('embeddings', { create: true });
    await this.dataHandle.getDirectoryHandle('summaries', { create: true });
    await this.dataHandle.getDirectoryHandle('debug', { create: true });
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

  async getJSON<T>(subdir: string, filename: string): Promise<T | null> {
    const cacheKey = `${subdir}/${filename}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
      return cached.data as T;
    }

    try {
      const dir = await this.getSubDir(subdir);
      const fileHandle = await dir.getFileHandle(`${filename}.json`);
      const file = await fileHandle.getFile();
      const data = JSON.parse(await file.text());

      // Update cache
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (e) {
      if ((e as Error).name === 'NotFoundError') return null;
      throw e;
    }
  }

  async setJSON<T>(subdir: string, filename: string, data: T): Promise<void> {
    const cacheKey = `${subdir}/${filename}`;
    this.cache.set(cacheKey, { data, timestamp: Date.now() });

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
      // Clear from cache
      this.cache.delete(`${subdir}/${filename}`);
    } catch (e) {
      // File not found is expected, only log unexpected errors
      if ((e as Error).name !== 'NotFoundError') {
        logger.debug(`deleteJSON error for ${subdir}/${filename}:`, e);
      }
    }
  }

  async listFiles(subdir: string): Promise<string[]> {
    try {
      const dir = await this.getSubDir(subdir) as ExtendedFileSystemDirectoryHandle;
      const files: string[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          files.push(entry.name.replace('.json', ''));
        }
      }
      return files;
    } catch (e) {
      logger.debug(`listFiles error for ${subdir}:`, e);
      return [];
    }
  }

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
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') {
        logger.debug(`getMedia error for ${filename}:`, e);
      }
      return null;
    }
  }

  async deleteMedia(filename: string): Promise<void> {
    try {
      const dir = await this.getSubDir('media');
      await dir.removeEntry(filename);
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') {
        logger.debug(`deleteMedia error for ${filename}:`, e);
      }
    }
  }

  async getStorageSize(): Promise<number> {
    if (!this.dataHandle) return 0;
    let total = 0;
    const calcSize = async (dir: ExtendedFileSystemDirectoryHandle) => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          const fileHandle = entry as FileSystemFileHandle;
          total += (await fileHandle.getFile()).size;
        } else {
          await calcSize(entry as ExtendedFileSystemDirectoryHandle);
        }
      }
    };
    await calcSize(this.dataHandle as ExtendedFileSystemDirectoryHandle);
    return total;
  }
}

// Main Storage Service - Singleton
// Config (API keys, models) → always in IndexedDB (browser persistent)
// Chat data → user's local folder via File System API
class StorageService {
  /**
   * The currently-active backend used for reads/writes.
   * This should always be a working backend (fallback to IndexedDB when FS is disconnected).
   */
  private type: StorageType = 'indexeddb';
  /**
   * The user-selected storage type (persisted). May be 'filesystem' even if not currently connected.
   */
  private selectedType: StorageType | null = null;
  private idb = new IndexedDBStorage();          // For config (persistent)
  private configIdb = new IndexedDBStorage('anikchat-config-db'); // Dedicated config store
  private fs = new FileSystemStorage();          // For chat data
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Always init config DB (browser persistent)
      await this.configIdb.init();
      // Always init chat IndexedDB too as a safe fallback.
      await this.idb.init();

      const savedType = localStorage.getItem('anikchat-storage-type') as StorageType | null;
      this.selectedType = savedType;

      if (savedType === 'filesystem' && isFileSystemSupported()) {
        const connected = await this.fs.init();
        this.type = connected ? 'filesystem' : 'indexeddb';
      } else {
        this.type = 'indexeddb';
      }
      this.initialized = true;
    })();

    return this.initPromise;
  }

  isFirstTime(): boolean {
    return !localStorage.getItem('anikchat-storage-type');
  }

  needsReauthorization(): boolean {
    return this.selectedType === 'filesystem' && isFileSystemSupported() && !this.fs.isConnected() && this.fs.hasSavedHandle();
  }

  async reauthorize(): Promise<boolean> {
    await this.init();
    const ok = await this.fs.reauthorize();
    // Always fall back to IndexedDB if we can't regain permission.
    this.type = ok ? 'filesystem' : 'indexeddb';
    return ok;
  }

  getStorageType(): StorageType {
    // UI: show the selected type if the user picked one, even if we are temporarily falling back.
    return this.selectedType ?? this.type;
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
      this.selectedType = 'filesystem';
      localStorage.setItem('anikchat-storage-type', 'filesystem');
    }
    return success;
  }

  async switchToIndexedDB(): Promise<void> {
    await this.idb.init();
    this.type = 'indexeddb';
    this.selectedType = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  async disconnectFileSystem(): Promise<void> {
    await this.fs.clearHandle();
    await this.idb.init();
    this.type = 'indexeddb';
    this.selectedType = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  private async migrateToFileSystem(): Promise<void> {
    const convData = localStorage.getItem('openchat-conversations');
    if (convData) {
      try {
        const parsed: unknown = JSON.parse(convData);
        if (!Array.isArray(parsed)) return;
        const convs = parsed as Array<{ id?: unknown } & Record<string, unknown>>;
        // Optimization: Parallelize migration
        await Promise.all(
          convs
            .filter((conv) => typeof conv.id === 'string' && conv.id.length > 0)
            .map((conv) => this.fs.setJSON('conversations', conv.id as string, conv))
        );
      } catch (e) {
        logger.debug('Migration: no localStorage conversations');
      }
    }
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

  // Config operations - ALWAYS in IndexedDB (browser persistent, never deleted unless user clears)
  async getConfig<T>(): Promise<T | null> {
    await this.init();
    return this.configIdb.get('config');
  }

  async saveConfig<T>(data: T): Promise<void> {
    await this.init();
    await this.configIdb.set('config', data);
  }

  async getStorageSize(): Promise<number> {
    await this.init();
    if (this.type === 'filesystem') {
      return this.fs.getStorageSize();
    }
    return this.idb.getStorageSize();
  }

  // Clear chat data only (preserves config/API keys)
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
    // Note: Config in configIdb is NOT cleared - API keys persist
  }

  // Explicitly delete config (API keys, models) - only when user requests
  async clearConfig(): Promise<void> {
    await this.init();
    await this.configIdb.delete('config');
  }

  // Clear everything including config
  async clearEverything(): Promise<void> {
    await this.clearAll();
    await this.clearConfig();
  }
}

export const storageService = new StorageService();
