import { useEffect, useCallback, useRef } from 'react';
import { APIConfig, LLMProvider } from '@/types/chat';
import { encryptApiKey, decryptApiKey, isEncrypted } from '@/lib/crypto';
import { logger } from '@/lib/logger';

/**
 * Hook to handle API key encryption/decryption transparently
 * - Decrypts keys when loading config
 * - Encrypts keys when saving config
 */
export function useSecureConfig(
  config: APIConfig,
  setConfig: (config: APIConfig | ((prev: APIConfig) => APIConfig)) => void
) {
  const isInitialized = useRef(false);

  // Decrypt API keys on initial load
  useEffect(() => {
    if (isInitialized.current) return;
    if (!config.providers?.length) return;

    const decryptKeys = async () => {
      const hasEncrypted = config.providers.some(p => isEncrypted(p.apiKey));
      if (!hasEncrypted) {
        isInitialized.current = true;
        return;
      }

      const decryptedProviders = await Promise.all(
        config.providers.map(async (p) => ({
          ...p,
          apiKey: await decryptApiKey(p.apiKey),
        }))
      );

      setConfig(prev => ({ ...prev, providers: decryptedProviders }));
      isInitialized.current = true;
      logger.debug('API keys decrypted');
    };

    decryptKeys();
  }, [config.providers, setConfig]);

  // Encrypt API keys before saving
  const encryptConfig = useCallback(async (configToSave: APIConfig): Promise<APIConfig> => {
    if (!configToSave.providers?.length) return configToSave;

    const encryptedProviders = await Promise.all(
      configToSave.providers.map(async (p) => ({
        ...p,
        apiKey: p.apiKey && !isEncrypted(p.apiKey) 
          ? await encryptApiKey(p.apiKey) 
          : p.apiKey,
      }))
    );

    return { ...configToSave, providers: encryptedProviders };
  }, []);

  return { encryptConfig };
}
