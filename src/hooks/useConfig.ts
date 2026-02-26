/**
 * useConfig — Client-side API configuration hook
 *
 * Loads and saves:
 *   • App settings  → IndexedDB user_config store (temperature, system prompt, etc.)
 *   • API keys      → IndexedDB user_api_keys store (AES-GCM encrypted)
 *
 * All data stored locally in browser IndexedDB.
 * No sensitive data leaves the browser.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as storageService from '@/lib/localStorageService';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { APIConfig, LLMProvider } from '@/types/chat';
import { useAuth } from './useAuth';


// ─── Hook ────────────────────────────────────────────────────

export function useConfig<T>(initialValue: T): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const { user } = useAuth();
  const [value, setValue]   = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  const isInitialMount   = useRef(true);
  const saveTimeoutRef   = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef       = useRef(true);
  // Track provider IDs that are currently saved so we can detect deletions
  const savedProviderIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // ── Load from storage when auth resolves ──────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [config, providers] = await Promise.all([
          storageService.getConfig(user.id),
          storageService.getApiKeys(user.id),
        ]);

        if (cancelled) return;

        // Merge settings onto the initial value
        const mergedConfig = { ...(initialValue as unknown as APIConfig) };

        if (config) {
          mergedConfig.activeProviderId   = config.activeProviderId   ?? null;
          mergedConfig.activeModelId      = config.activeModelId      ?? null;
          mergedConfig.temperature        = config.temperature        ?? 0.7;
          mergedConfig.maxTokens          = config.maxTokens          ?? 4096;
          mergedConfig.topP               = config.topP               ?? 1;
          mergedConfig.frequencyPenalty   = config.frequencyPenalty   ?? 0;
          mergedConfig.presencePenalty    = config.presencePenalty    ?? 0;
          mergedConfig.systemPrompt       = config.systemPrompt       ?? 'You are a helpful AI assistant.';
        }

        // Load + decrypt provider API keys
        if (providers && providers.length > 0) {
          const decryptedProviders: LLMProvider[] = await Promise.all(
            providers.map(async provider => {
              const plainKey = await decryptApiKey(provider.apiKey, user.id);
              return {
                ...provider,
                apiKey: plainKey,
              };
            }),
          );
          mergedConfig.providers = decryptedProviders;
          savedProviderIds.current = new Set(decryptedProviders.map(p => p.id));
        }

        if (mountedRef.current) {
          setValue(mergedConfig as unknown as T);
          setIsLoaded(true);
        }
      } catch (e) {
        logger.error('useConfig load error:', e);
        if (mountedRef.current) setIsLoaded(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced save on value change ────────────────────────
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isLoaded || !user) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const config = value as unknown as APIConfig;

        // ── 1. Save settings ───────────────────────────────
        await storageService.saveConfig(user.id, config);

        // ── 2. Upsert API keys ─────────────────────────────
        const currentIds = new Set<string>();

        if (config.providers) {
          for (const provider of config.providers) {
            currentIds.add(provider.id);

            // Skip providers with no key (e.g. Ollama local)
            // Still upsert the provider metadata even without a key
            let encryptedKey = '';
            let iv = '';

            if (provider.apiKey) {
              const encKey = await encryptApiKey(provider.apiKey, user.id);
              if (encKey && encKey.includes(':')) {
                const parts = encKey.split(':');
                iv = parts[0];
                encryptedKey = parts.slice(1).join(':');
              }
            }

            await storageService.saveApiKey(user.id, provider, encryptedKey, iv);
          }

          // ── 3. Delete removed providers ───────────────────
          const removed = [...savedProviderIds.current].filter(id => !currentIds.has(id));
          for (const removedId of removed) {
            await storageService.deleteApiKey(user.id, removedId);
          }

          savedProviderIds.current = currentIds;
        }
      } catch (e) {
        logger.error('useConfig save error:', e);
      }
    }, 500);
  }, [value, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const setValueAndPersist = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev =>
      typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prev)
        : newValue,
    );
  }, []);

  return [value, setValueAndPersist, isLoaded];
}
