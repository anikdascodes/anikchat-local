import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, X, MessageSquare, ArrowRight } from 'lucide-react';
import { Conversation } from '@/types/chat';

interface ConversationSearchProps {
  conversations: Conversation[];
  onSelectConversation: (id: string, messageId?: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId?: string;
  messagePreview?: string;
  matchType: 'title' | 'message';
  highlightedText: string;
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '**$1**');
}

export function ConversationSearch({ 
  conversations, 
  onSelectConversation, 
  isOpen, 
  onClose 
}: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const searchResults = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const conv of conversations) {
      // Search in title
      if (conv.title.toLowerCase().includes(lowerQuery)) {
        results.push({
          conversationId: conv.id,
          conversationTitle: conv.title,
          matchType: 'title',
          highlightedText: highlightMatch(conv.title, query),
        });
      }
      
      // Search in messages
      for (const msg of conv.messages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          const start = Math.max(0, msg.content.toLowerCase().indexOf(lowerQuery) - 30);
          const end = Math.min(msg.content.length, start + 80);
          let preview = msg.content.slice(start, end);
          if (start > 0) preview = '...' + preview;
          if (end < msg.content.length) preview = preview + '...';
          
          results.push({
            conversationId: conv.id,
            conversationTitle: conv.title,
            messageId: msg.id,
            messagePreview: preview,
            matchType: 'message',
            highlightedText: highlightMatch(preview, query),
          });
          
          // Limit message matches per conversation
          if (results.filter(r => r.conversationId === conv.id).length >= 3) break;
        }
      }
    }
    
    return results.slice(0, 20); // Limit total results
  }, [query, conversations]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelectConversation(result.conversationId, result.messageId);
    onClose();
  }, [onSelectConversation, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(searchResults[selectedIndex]);
    }
  }, [onClose, searchResults, selectedIndex, handleSelect]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search conversations and messages..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Close search"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
          {query.trim() === '' ? (
            <div className="px-4 py-10 text-center">
              <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Start typing to search across all conversations</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No results found for "<span className="font-medium text-foreground">{query}</span>"</p>
            </div>
          ) : (
            <div className="py-1">
              {searchResults.map((result, idx) => (
                <button
                  key={`${result.conversationId}-${result.messageId || 'title'}-${idx}`}
                  className={`w-full px-4 py-3 flex items-start gap-3 text-left transition-all ${
                    idx === selectedIndex 
                      ? 'bg-accent/80' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${idx === selectedIndex ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate text-foreground">
                        {result.conversationTitle}
                      </span>
                      {result.matchType === 'message' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground shrink-0">
                          in message
                        </span>
                      )}
                    </div>
                    {result.messagePreview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {result.messagePreview}
                      </p>
                    )}
                  </div>
                  <ArrowRight className={`h-4 w-4 shrink-0 mt-0.5 transition-transform ${idx === selectedIndex ? 'text-primary translate-x-0.5' : 'text-muted-foreground/50'}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center gap-5">
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">↵</kbd> Select</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] font-mono">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
