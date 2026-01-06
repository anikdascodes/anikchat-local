import { useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '@/lib/storageService';
import { encryptApiKey, decryptApiKey, isEncrypted } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { APIConfig, LLMProvider } from '@/types/chat';

/**
 * Decrypt API keys in config
 */
async function decryptConfig<T>(config: T): Promise<T> {
  if (!config || typeof config !== 'object') return config;
  
  const apiConfig = config as unknown as APIConfig;
  if (!apiConfig.providers?.length) return config;

  const decryptedProviders = await Promise.all(
    apiConfig.providers.map(async (p: LLMProvider) => ({
      ...p,
      apiKey: p.apiKey ? await decryptApiKey(p.apiKey) : '',
    }))
  );

  return { ...config, providers: decryptedProviders } as T;
}

/**
 * Encrypt API keys in config
 */
async function encryptConfig<T>(config: T): Promise<T> {
  if (!config || typeof config !== 'object') return config;
  
  const apiConfig = config as unknown as APIConfig;
  if (!apiConfig.providers?.length) return config;

  const encryptedProviders = await Promise.all(
    apiConfig.providers.map(async (p: LLMProvider) => ({
      ...p,
      apiKey: p.apiKey && !isEncrypted(p.apiKey) 
        ? await encryptApiKey(p.apiKey) 
        : p.apiKey,
    }))
  );

  return { ...config, providers: encryptedProviders } as T;
}

/**
 * Hook for config that syncs with storageService
 * Automatically encrypts/decrypts API keys
 */
export function useConfig<T>(initialValue: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialMount = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Load from storage on mount
  useEffect(() => {
    const load = async () => {
      try {
        await storageService.init();
        let stored = await storageService.getConfig<T>();
        
        if (stored !== null) {
          stored = await decryptConfig(stored);
          if (mountedRef.current) setValue(stored);
        } else {
          // Migration fallback
          const local = localStorage.getItem('openchat-config');
          if (local) {
            let parsed = JSON.parse(local) as T;
            parsed = await decryptConfig(parsed);
            if (mountedRef.current) setValue(parsed);
            const encrypted = await encryptConfig(parsed);
            await storageService.saveConfig(encrypted);
            localStorage.removeItem('openchat-config'); // Clean up after migration
          }
        }
      } catch (e) {
        logger.error('Failed to load config:', e);
        const local = localStorage.getItem('openchat-config');
        if (local && mountedRef.current) {
          setValue(await decryptConfig(JSON.parse(local)));
        }
      }
      if (mountedRef.current) setIsLoaded(true);
    };
    load();
  }, []);

  // Debounced save when value changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isLoaded) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const encrypted = await encryptConfig(value);
        await storageService.saveConfig(encrypted);
      } catch (e) {
        logger.error('Failed to save config:', e);
      }
    }, 300); // Debounce 300ms
  }, [value, isLoaded]);

  const setValueAndPersist = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => typeof newValue === 'function' 
      ? (newValue as (prev: T) => T)(prev) 
      : newValue
    );
  }, []);

  return [value, setValueAndPersist, isLoaded];
}
