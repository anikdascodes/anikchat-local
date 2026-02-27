/**
 * Conversation Search Service
 * Search across user's own conversations using text matching
 */

import * as localService from './localStorageService';
import { Conversation } from '@/types/chat';

export interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  content: string;
  role: 'user' | 'assistant';
  matchSnippet: string;
  score: number;
}

/**
 * Simple text search across the authenticated user's conversations only.
 * userId is required to enforce data isolation.
 */
export async function searchConversations(query: string, userId: string, limit = 20): Promise<SearchResult[]> {
  if (!query.trim() || !userId) return [];

  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];

  const convIds = await localService.listConversations(userId);
  
  for (const id of convIds) {
    const conv = await localService.getConversation(id, userId);
    if (!conv) continue;

    for (const msg of conv.messages) {
      const contentLower = msg.content.toLowerCase();
      const matchIndex = contentLower.indexOf(queryLower);
      
      if (matchIndex !== -1) {
        // Extract snippet around match
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(msg.content.length, matchIndex + query.length + 50);
        let snippet = msg.content.slice(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < msg.content.length) snippet = snippet + '...';

        results.push({
          conversationId: conv.id,
          conversationTitle: conv.title,
          messageId: msg.id,
          content: msg.content,
          role: msg.role,
          matchSnippet: snippet,
          score: 1, // Simple match score
        });
      }
    }
  }

  // Sort by most recent (assuming messages are in order)
  return results.slice(0, limit);
}

/**
 * Split text into parts that can be rendered safely with <mark> without HTML injection.
 */
export function getHighlightParts(
  text: string,
  query: string,
): Array<{ text: string; isMatch: boolean }> {
  const q = query.trim();
  if (!q) return [{ text, isMatch: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();

  const parts: Array<{ text: string; isMatch: boolean }> = [];

  let i = 0;
  while (i < text.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
    if (idx === -1) {
      parts.push({ text: text.slice(i), isMatch: false });
      break;
    }

    if (idx > i) {
      parts.push({ text: text.slice(i, idx), isMatch: false });
    }

    parts.push({ text: text.slice(idx, idx + q.length), isMatch: true });
    i = idx + q.length;
  }

  return parts.filter(p => p.text.length > 0);
}
