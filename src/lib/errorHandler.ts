import { logger } from './logger';

export function handleStorageError(error: unknown, context: string): void {
  logger.error(`Storage error in ${context}:`, error);
}

export function handleApiError(error: unknown, context: string): void {
  logger.error(`API error in ${context}:`, error);
}
