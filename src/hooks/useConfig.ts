/**
 * useConfig — Cloud-first API configuration hook
 *
 * Loads and saves:
 *   • App settings  → user_config  table (temperature, system prompt, etc.)
 *   • API keys      → user_api_keys table (AES-GCM encrypted, PBKDF2 key derived
 *                      from userId — same key on every device the user logs into)
 *
 * No localStorage, no IndexedDB, no storageService.
 * Zero sensitive data leaves the Supabase cloud.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { APIConfig, LLMProvider } from '@/types/chat';
import { useAuth } from './useAuth';

// ─── Helpers ─────────────────────────────────────────────────

/** Reconstruct the enc:v2: string from the two DB columns. */
function buildEncKey(iv: string, encrypted: string): string {
  return `enc:v2:${iv}:${encrypted}`;
}

/** Split "enc:v2:<iv>:<data>" back into the two column values.  */
function splitEncKey(encKey: string): { iv: string; encrypted: string } | null {
  if (!encKey.startsWith('enc:v2:')) return null;
  const rest  = encKey.slice(7);
  const colon = rest.indexOf(':');
  if (colon === -1) return null;
  return { iv: rest.slice(0, colon), encrypted: rest.slice(colon + 1) };
}

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

  // ── Load from Supabase when auth resolves ──────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [configRes, keysRes] = await Promise.all([
          supabase.from('user_config')
            .select('*')
            .eq('user_id', user.id)
            .single(),
          supabase.from('user_api_keys')
            .select('*')
            .eq('user_id', user.id),
        ]);

        if (cancelled) return;

        // Merge settings onto the initial value
        const config = { ...(initialValue as unknown as APIConfig) };

        if (configRes.data) {
          const row = configRes.data as Record<string, unknown>;
          config.activeProviderId   = (row.active_provider_id   as string) ?? null;
          config.activeModelId      = (row.active_model_id      as string) ?? null;
          config.temperature        = (row.temperature          as number) ?? 0.7;
          config.maxTokens          = (row.max_tokens           as number) ?? 4096;
          config.topP               = (row.top_p                as number) ?? 1;
          config.frequencyPenalty   = (row.frequency_penalty    as number) ?? 0;
          config.presencePenalty    = (row.presence_penalty     as number) ?? 0;
          config.systemPrompt       = (row.system_prompt        as string) ?? 'You are a helpful AI assistant.';
        }

        // Load + decrypt provider API keys
        if (keysRes.data && keysRes.data.length > 0) {
          const rows = keysRes.data as Record<string, unknown>[];
          const providers: LLMProvider[] = await Promise.all(
            rows.map(async row => {
              const encKey     = buildEncKey(row.iv as string, row.encrypted_key as string);
              const plainKey   = await decryptApiKey(encKey, user.id);
              return {
                id:           row.provider_id   as string,
                name:         row.provider_name as string,
                baseUrl:      row.base_url      as string,
                apiKey:       plainKey,
                models:       (row.models       as LLMProvider['models'])    ?? [],
                providerType: (row.provider_type as LLMProvider['providerType']) ?? undefined,
              };
            }),
          );
          config.providers = providers;
          savedProviderIds.current = new Set(providers.map(p => p.id));
        }

        if (mountedRef.current) {
          setValue(config as unknown as T);
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

        // ── 1. Save settings (no keys) ─────────────────────
        await supabase.from('user_config').upsert({
          user_id:           user.id,
          active_provider_id: config.activeProviderId  ?? null,
          active_model_id:    config.activeModelId     ?? null,
          temperature:        config.temperature       ?? 0.7,
          max_tokens:         config.maxTokens         ?? 4096,
          top_p:              config.topP              ?? 1,
          frequency_penalty:  config.frequencyPenalty  ?? 0,
          presence_penalty:   config.presencePenalty   ?? 0,
          system_prompt:      config.systemPrompt      ?? '',
          updated_at:         new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // ── 2. Upsert API keys ─────────────────────────────
        const currentIds = new Set<string>();

        if (config.providers) {
          for (const provider of config.providers) {
            currentIds.add(provider.id);

            // Skip providers with no key (e.g. Ollama local)
            // Still upsert the provider metadata even without a key
            let iv = '';
            let encrypted = '';

            if (provider.apiKey) {
              const encKey = await encryptApiKey(provider.apiKey, user.id);
              if (encKey) {
                const parts = splitEncKey(encKey);
                if (parts) { iv = parts.iv; encrypted = parts.encrypted; }
              }
            }

            await supabase.from('user_api_keys').upsert({
              user_id:       user.id,
              provider_id:   provider.id,
              provider_name: provider.name,
              base_url:      provider.baseUrl,
              encrypted_key: encrypted,
              iv,
              models:        provider.models       ?? [],
              provider_type: provider.providerType ?? null,
              updated_at:    new Date().toISOString(),
            }, { onConflict: 'user_id,provider_id' });
          }

          // ── 3. Delete removed providers ───────────────────
          const removed = [...savedProviderIds.current].filter(id => !currentIds.has(id));
          for (const removedId of removed) {
            await supabase.from('user_api_keys')
              .delete()
              .eq('user_id',     user.id)
              .eq('provider_id', removedId);
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
