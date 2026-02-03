import { APIConfig } from '@/types/chat';

/**
 * Backups should never include live API keys.
 *
 * Note: even "encrypted at rest" keys can be sensitive if exported, so we
 * redact entirely to avoid accidental credential exfiltration.
 */
export function redactConfigForExport(config: APIConfig): APIConfig {
  return {
    ...config,
    providers: (config.providers ?? []).map(p => ({
      ...p,
      apiKey: '',
    })),
  };
}

