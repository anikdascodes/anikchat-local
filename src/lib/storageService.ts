/**
 * Storage Service - Hybrid File System Access API + IndexedDB
 * 
 * Provides local file storage with:
 * - File System Access API for Chrome/Edge (user picks folder)
 * - IndexedDB fallback for Firefox/Safari
 */

// Extended FileSystemDirectoryHandle with permissions (Chrome-specific)
interface ExtendedFileSystemDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ExtendedFileSystemDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterableIterator<ExtendedFileSystemDirectoryHandle | FileSystemFileHandle>;
}

// Check if File System Access API is supported
export const isFileSystemSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

// Storage types
export type StorageType = 'filesystem' | 'indexeddb' | 'localstorage';

interface StorageConfig {
  type: StorageType;
  directoryHandle?: FileSystemDirectoryHandle;
  dbName: string;
}

// IndexedDB wrapper
class IndexedDBStorage {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private readonly STORE_NAME = 'anikchat-data';

  constructor(dbName: string = 'anikchat-db') {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
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
      const transaction = this.db!.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(value, key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllKeys(): Promise<string[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.getAllKeys();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  async getStorageSize(): Promise<number> {
    if (!this.db) await this.init();
    
    const keys = await this.getAllKeys();
    let totalSize = 0;
    
    for (const key of keys) {
      const value = await this.get(key);
      if (value) {
        totalSize += new Blob([JSON.stringify(value)]).size;
      }
    }
    
    return totalSize;
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

// File System Access API wrapper
class FileSystemStorage {
  private directoryHandle: any = null;
  private handleKey = 'anikchat-fs-handle';

  async init(): Promise<boolean> {
    // Try to restore saved directory handle (silent check only, no prompt)
    try {
      const savedHandle = await this.getSavedHandle();
      if (savedHandle) {
        // Only check existing permission - don't request (that requires user gesture)
        const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          this.directoryHandle = savedHandle;
          return true;
        }
        // Permission not granted - store handle for later re-auth
        this.directoryHandle = savedHandle;
        return false; // Will need user to click to re-authenticate
      }
    } catch (error) {
      console.log('No saved directory handle');
    }
    return false;
  }

  async reauthorize(): Promise<boolean> {
    // Called on user gesture to re-request permission for saved handle
    try {
      const savedHandle = await this.getSavedHandle();
      if (savedHandle) {
        const permission = await savedHandle.requestPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          this.directoryHandle = savedHandle;
          return true;
        }
      }
    } catch (error) {
      console.log('Permission denied during reauthorization');
    }
    return false;
  }

  hasSavedHandle(): boolean {
    return this.directoryHandle !== null;
  }

  async pickDirectory(): Promise<any | null> {
    try {
      const handle = await (window as any).showDirectoryPicker({
        id: 'anikchat-storage',
        mode: 'readwrite',
        startIn: 'documents',
      });
      
      this.directoryHandle = handle;
      await this.saveHandle(handle);
      
      // Create anikchat subdirectory
      try {
        await handle.getDirectoryHandle('anikchat-data', { create: true });
      } catch (e) {
        console.log('Subdirectory already exists or error:', e);
      }
      
      return handle;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error picking directory:', error);
      }
      return null;
    }
  }

  private async saveHandle(handle: any): Promise<void> {
    // Save handle to IndexedDB for persistence
    const idb = new IndexedDBStorage('anikchat-handles');
    await idb.init();
    await idb.set(this.handleKey, handle);
  }

  private async getSavedHandle(): Promise<any | null> {
    const idb = new IndexedDBStorage('anikchat-handles');
    await idb.init();
    return await idb.get(this.handleKey);
  }

  async clearSavedHandle(): Promise<void> {
    const idb = new IndexedDBStorage('anikchat-handles');
    await idb.init();
    await idb.delete(this.handleKey);
    this.directoryHandle = null;
  }

  isConnected(): boolean {
    return this.directoryHandle !== null;
  }

  getDirectoryName(): string | null {
    return this.directoryHandle?.name ?? null;
  }

  private async getDataDirectory(): Promise<any> {
    if (!this.directoryHandle) throw new Error('No directory selected');
    return await this.directoryHandle.getDirectoryHandle('anikchat-data', { create: true });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const dataDir = await this.getDataDirectory();
      const fileHandle = await dataDir.getFileHandle(`${key}.json`);
      const file = await fileHandle.getFile();
      const content = await file.text();
      return JSON.parse(content) as T;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const dataDir = await this.getDataDirectory();
    const fileHandle = await dataDir.getFileHandle(`${key}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(value, null, 2));
    await writable.close();
  }

  async delete(key: string): Promise<void> {
    try {
      const dataDir = await this.getDataDirectory();
      await dataDir.removeEntry(`${key}.json`);
    } catch (error) {
      if ((error as Error).name !== 'NotFoundError') {
        throw error;
      }
    }
  }

  async saveMedia(filename: string, data: Blob): Promise<string> {
    const dataDir = await this.getDataDirectory();
    const mediaDir = await dataDir.getDirectoryHandle('media', { create: true });
    const fileHandle = await mediaDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return `media/${filename}`;
  }

  async getMedia(path: string): Promise<Blob | null> {
    try {
      const dataDir = await this.getDataDirectory();
      const parts = path.split('/');
      let dir: FileSystemDirectoryHandle = dataDir;
      
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]);
      }
      
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }

  async getStorageSize(): Promise<number> {
    if (!this.directoryHandle) return 0;
    
    let totalSize = 0;
    
    async function calculateSize(dir: any): Promise<void> {
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          totalSize += file.size;
        } else if (entry.kind === 'directory') {
          await calculateSize(entry);
        }
      }
    }
    
    try {
      const dataDir = await this.getDataDirectory();
      await calculateSize(dataDir);
    } catch {
      // Directory might not exist yet
    }
    
    return totalSize;
  }
}

// Main Storage Service
class StorageService {
  private config: StorageConfig;
  private indexedDB: IndexedDBStorage;
  private fileSystem: FileSystemStorage;
  private initialized = false;

  constructor() {
    this.config = {
      type: 'localstorage',
      dbName: 'anikchat-db',
    };
    this.indexedDB = new IndexedDBStorage();
    this.fileSystem = new FileSystemStorage();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Load saved storage preference
    const savedType = localStorage.getItem('anikchat-storage-type') as StorageType | null;
    
    if (savedType === 'filesystem' && isFileSystemSupported()) {
      const connected = await this.fileSystem.init();
      if (connected) {
        this.config.type = 'filesystem';
      } else if (this.fileSystem.hasSavedHandle()) {
        // Has saved handle but needs re-auth - stay on filesystem type but mark as needing auth
        this.config.type = 'filesystem';
      } else {
        // Fall back to indexeddb if no saved handle
        await this.indexedDB.init();
        this.config.type = 'indexeddb';
      }
    } else if (savedType === 'indexeddb') {
      await this.indexedDB.init();
      this.config.type = 'indexeddb';
    } else {
      // Default to localStorage for compatibility
      this.config.type = 'localstorage';
    }

    this.initialized = true;
  }

  needsReauthorization(): boolean {
    return this.config.type === 'filesystem' && !this.fileSystem.isConnected() && this.fileSystem.hasSavedHandle();
  }

  async reauthorizeFileSystem(): Promise<boolean> {
    const success = await this.fileSystem.reauthorize();
    if (!success) {
      // If re-auth fails, fall back to IndexedDB
      await this.indexedDB.init();
      this.config.type = 'indexeddb';
    }
    return success;
  }

  getStorageType(): StorageType {
    return this.config.type;
  }

  isFileSystemConnected(): boolean {
    return this.fileSystem.isConnected();
  }

  getDirectoryName(): string | null {
    return this.fileSystem.getDirectoryName();
  }

  async switchToFileSystem(): Promise<boolean> {
    if (!isFileSystemSupported()) return false;
    
    const handle = await this.fileSystem.pickDirectory();
    if (handle) {
      // Migrate existing data
      await this.migrateToFileSystem();
      this.config.type = 'filesystem';
      localStorage.setItem('anikchat-storage-type', 'filesystem');
      return true;
    }
    return false;
  }

  async switchToIndexedDB(): Promise<void> {
    await this.indexedDB.init();
    this.config.type = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  async switchToLocalStorage(): Promise<void> {
    this.config.type = 'localstorage';
    localStorage.setItem('anikchat-storage-type', 'localstorage');
  }

  async disconnectFileSystem(): Promise<void> {
    await this.fileSystem.clearSavedHandle();
    await this.indexedDB.init();
    this.config.type = 'indexeddb';
    localStorage.setItem('anikchat-storage-type', 'indexeddb');
  }

  private async migrateToFileSystem(): Promise<void> {
    // Migrate from localStorage
    const keys = ['openchat-config', 'openchat-conversations'];
    
    for (const key of keys) {
      const localValue = localStorage.getItem(key);
      if (localValue) {
        try {
          const parsed = JSON.parse(localValue);
          await this.fileSystem.set(key, parsed);
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    // Migrate from IndexedDB if any
    try {
      const idbKeys = await this.indexedDB.getAllKeys();
      for (const key of idbKeys) {
        const value = await this.indexedDB.get(key);
        if (value) {
          await this.fileSystem.set(key as string, value);
        }
      }
    } catch {
      // IndexedDB might not be initialized
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.init();
    
    switch (this.config.type) {
      case 'filesystem':
        return await this.fileSystem.get<T>(key);
      case 'indexeddb':
        return await this.indexedDB.get<T>(key);
      case 'localstorage':
      default:
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.init();
    
    switch (this.config.type) {
      case 'filesystem':
        await this.fileSystem.set(key, value);
        break;
      case 'indexeddb':
        await this.indexedDB.set(key, value);
        break;
      case 'localstorage':
      default:
        localStorage.setItem(key, JSON.stringify(value));
    }
  }

  async delete(key: string): Promise<void> {
    await this.init();
    
    switch (this.config.type) {
      case 'filesystem':
        await this.fileSystem.delete(key);
        break;
      case 'indexeddb':
        await this.indexedDB.delete(key);
        break;
      case 'localstorage':
      default:
        localStorage.removeItem(key);
    }
  }

  async saveMedia(filename: string, data: Blob): Promise<string> {
    await this.init();
    
    if (this.config.type === 'filesystem') {
      return await this.fileSystem.saveMedia(filename, data);
    }
    
    // For IndexedDB/localStorage, convert to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        await this.set(`media-${filename}`, base64);
        resolve(`media-${filename}`);
      };
      reader.onerror = reject;
      reader.readAsDataURL(data);
    });
  }

  async getStorageSize(): Promise<number> {
    await this.init();
    
    switch (this.config.type) {
      case 'filesystem':
        return await this.fileSystem.getStorageSize();
      case 'indexeddb':
        return await this.indexedDB.getStorageSize();
      case 'localstorage':
      default:
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('openchat-') || key?.startsWith('anikchat-')) {
            const value = localStorage.getItem(key) || '';
            total += new Blob([value]).size;
          }
        }
        return total;
    }
  }

  async clearAll(): Promise<void> {
    await this.init();
    
    switch (this.config.type) {
      case 'filesystem':
        // Clear file system data
        await this.fileSystem.delete('openchat-config');
        await this.fileSystem.delete('openchat-conversations');
        break;
      case 'indexeddb':
        await this.indexedDB.clear();
        break;
      case 'localstorage':
      default:
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('openchat-') || key?.startsWith('anikchat-')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }
}

// Singleton instance
export const storageService = new StorageService();

// React hook for storage info
export function getStorageInfo(): { type: StorageType; isFileSystemSupported: boolean } {
  return {
    type: storageService.getStorageType(),
    isFileSystemSupported: isFileSystemSupported(),
  };
}
