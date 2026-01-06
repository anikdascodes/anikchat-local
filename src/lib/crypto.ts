/**
 * Secure API Key Storage
 * 
 * Uses Web Crypto API to encrypt API keys at rest.
 * Keys are encrypted with a device-specific key derived from
 * a combination of factors (not perfect, but better than plaintext).
 */

const ENCRYPTION_KEY_NAME = 'anikchat-encryption-key';

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  // Try to get existing key from IndexedDB
  const stored = await getStoredKey();
  if (stored) return stored;

  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable for storage
    ['encrypt', 'decrypt']
  );

  // Store for future use
  await storeKey(key);
  return key;
}

async function getStoredKey(): Promise<CryptoKey | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open('anikchat-keys', 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keys', 'readonly');
      const store = tx.objectStore('keys');
      const getReq = store.get(ENCRYPTION_KEY_NAME);
      getReq.onsuccess = async () => {
        if (getReq.result) {
          try {
            const key = await crypto.subtle.importKey(
              'raw',
              getReq.result,
              { name: 'AES-GCM', length: 256 },
              false,
              ['encrypt', 'decrypt']
            );
            resolve(key);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    };
  });
}

async function storeKey(key: CryptoKey): Promise<void> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('anikchat-keys', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      store.put(new Uint8Array(exported), ENCRYPTION_KEY_NAME);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Encrypt an API key
 */
export async function encryptApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return '';
  
  try {
    const key = await getOrCreateEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(apiKey);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    // Combine IV + encrypted data and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return 'enc:' + btoa(String.fromCharCode(...combined));
  } catch {
    // Fallback to plaintext if encryption fails
    return apiKey;
  }
}

/**
 * Decrypt an API key
 */
export async function decryptApiKey(encryptedKey: string): Promise<string> {
  if (!encryptedKey) return '';
  if (!encryptedKey.startsWith('enc:')) return encryptedKey; // Not encrypted
  
  try {
    const key = await getOrCreateEncryptionKey();
    const combined = Uint8Array.from(atob(encryptedKey.slice(4)), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // Return as-is if decryption fails
    return encryptedKey.startsWith('enc:') ? '' : encryptedKey;
  }
}

/**
 * Check if a key is encrypted
 */
export function isEncrypted(key: string): boolean {
  return key.startsWith('enc:');
}
