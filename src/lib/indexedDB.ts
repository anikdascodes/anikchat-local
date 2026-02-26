/**
 * IndexedDB wrapper for client-side data persistence
 * Provides a simple interface for storing and retrieving data
 * Falls back to localStorage for smaller data
 */

import { logger } from './logger';

const DB_NAME = 'anikchat_db';
const DB_VERSION = 1;

interface DBStore {
  conversations: string;
  messages: string;
  folders: string;
  user_config: string;
  user_api_keys: string;
}

const STORES: DBStore = {
  conversations: 'conversations',
  messages: 'messages',
  folders: 'folders',
  user_config: 'user_config',
  user_api_keys: 'user_api_keys',
};

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('Failed to open IndexedDB', request.error);
      reject(request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores if they don't exist
      Object.values(STORES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}

/**
 * Get data from IndexedDB store
 */
export async function getData<T>(storeName: keyof DBStore, key: string): Promise<T | undefined> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORES[storeName], 'readonly');
    const store = transaction.objectStore(STORES[storeName]);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error(`Failed to get data from ${storeName}`, err);
    return undefined;
  }
}

/**
 * Get all data from IndexedDB store
 */
export async function getAllData<T>(storeName: keyof DBStore): Promise<T[]> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORES[storeName], 'readonly');
    const store = transaction.objectStore(STORES[storeName]);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error(`Failed to get all data from ${storeName}`, err);
    return [];
  }
}

/**
 * Save data to IndexedDB store
 */
export async function saveData<T extends { id: string }>(storeName: keyof DBStore, data: T): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORES[storeName], 'readwrite');
    const store = transaction.objectStore(STORES[storeName]);

    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error(`Failed to save data to ${storeName}`, err);
    throw err;
  }
}

/**
 * Delete data from IndexedDB store
 */
export async function deleteData(storeName: keyof DBStore, key: string): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORES[storeName], 'readwrite');
    const store = transaction.objectStore(STORES[storeName]);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error(`Failed to delete data from ${storeName}`, err);
    throw err;
  }
}

/**
 * Clear entire store
 */
export async function clearStore(storeName: keyof DBStore): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORES[storeName], 'readwrite');
    const store = transaction.objectStore(STORES[storeName]);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error(`Failed to clear store ${storeName}`, err);
    throw err;
  }
}

/**
 * Query data by field
 */
export async function queryData<T>(
  storeName: keyof DBStore,
  field: string,
  value: unknown
): Promise<T[]> {
  try {
    const allData = await getAllData<T>(storeName);
    return allData.filter(item => (item as Record<string, unknown>)[field] === value);
  } catch (err) {
    logger.error(`Failed to query data from ${storeName}`, err);
    return [];
  }
}

/**
 * Export all data as JSON
 */
export async function exportAllData(): Promise<string> {
  try {
    const exported: Record<string, unknown> = {};
    for (const storeName of Object.keys(STORES)) {
      exported[storeName] = await getAllData(storeName as keyof DBStore);
    }
    return JSON.stringify(exported, null, 2);
  } catch (err) {
    logger.error('Failed to export data', err);
    return '{}';
  }
}

/**
 * Import all data from JSON
 */
export async function importAllData(jsonData: string): Promise<{ error: string | null }> {
  try {
    const data = JSON.parse(jsonData);
    
    for (const [storeName, items] of Object.entries(data)) {
      if (!Object.keys(STORES).includes(storeName)) continue;
      
      const store = storeName as keyof DBStore;
      const storeItems = items as Array<{ id: string }>;
      
      await clearStore(store);
      for (const item of storeItems) {
        await saveData(store, item);
      }
    }
    
    return { error: null };
  } catch (err) {
    logger.error('Failed to import data', err);
    return { error: 'Invalid data format' };
  }
}
