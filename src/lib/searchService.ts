/**
 * Conversation Search Service
 * Search across all conversations using text matching and optional embeddings
 */

import { storageService } from './storageService';
import { Conversation, Message } from '@/types/chat';

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
 * Simple text search across all conversations
 */
export async function searchConversations(query: string, limit = 20): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const queryLower = query.toLowerCase();
  const results: SearchResult[] = [];

  const convIds = await storageService.listConversations();
  
  for (const id of convIds) {
    const conv = await storageService.getConversation<Conversation>(id);
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
 * Search with highlighting
 */
export function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}
