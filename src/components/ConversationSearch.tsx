import { useState, useCallback, useEffect } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Conversation } from '@/types/chat';
import { searchConversations, SearchResult, getHighlightParts } from '@/lib/searchService';
import { useDebounce } from '@/hooks/useDebounce';

interface ConversationSearchProps {
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ConversationSearch({ conversations, onSelectConversation, isOpen, onClose }: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    searchConversations(debouncedQuery).then((res) => {
      setResults(res);
      setIsSearching(false);
    });
  }, [debouncedQuery]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelectConversation(result.conversationId);
    onClose();
  }, [onSelectConversation, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div 
        className="w-full max-w-xl bg-background rounded-xl shadow-2xl border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations..."
            className="border-0 focus-visible:ring-0 text-base"
            autoFocus
          />
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {isSearching && (
            <div className="p-4 text-center text-muted-foreground">Searching...</div>
          )}
          
          {!isSearching && query && results.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No results found</div>
          )}

          {!query && (
            <div className="p-4 text-center text-muted-foreground">
              Type to search across all conversations
            </div>
          )}

          {results.map((result, idx) => (
            <button
              key={`${result.conversationId}-${result.messageId}-${idx}`}
              onClick={() => handleSelect(result)}
              className="w-full p-4 text-left hover:bg-muted/50 border-b last:border-0 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm truncate">{result.conversationTitle}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {result.role === 'user' ? 'You' : 'Assistant'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800">
                {getHighlightParts(result.matchSnippet, query).map((part, partIdx) =>
                  part.isMatch ? (
                    <mark key={partIdx} className="rounded px-0.5">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={partIdx}>{part.text}</span>
                  )
                )}
              </p>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to close · 
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] ml-1">⌘K</kbd> to open
        </div>
      </div>
    </div>
  );
}
