import { useState, useCallback, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { searchConversations, SearchResult, getHighlightParts } from '@/lib/searchService';
import { useDebounce } from '@/hooks/useDebounce';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from '@/components/ui/command';

interface ConversationSearchProps {
  conversations: Conversation[];
  onSelectConversation: (id: string, messageId?: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ConversationSearch({
  conversations: _conversations,
  onSelectConversation,
  isOpen,
  onClose,
}: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setIsSearching(false);
    }
  }, [isOpen]);

  // Search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchConversations(debouncedQuery).then((res) => {
      setResults(res);
      setIsSearching(false);
    });
  }, [debouncedQuery]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelectConversation(result.conversationId, result.messageId);
    onClose();
  }, [onSelectConversation, onClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="p-0 overflow-hidden">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search conversations..."
            autoFocus
          />
          <CommandList className="max-h-[50vh]">
            {isSearching && (
              <CommandItem disabled>Searching...</CommandItem>
            )}

            {!isSearching && !query && (
              <CommandItem disabled>Type to search across all conversations</CommandItem>
            )}

            {!isSearching && query && results.length === 0 && (
              <CommandItem disabled>No results found</CommandItem>
            )}

            {!isSearching && query && results.length > 0 && (
              <CommandGroup heading="Results">
                {results.map((result, idx) => (
                  <CommandItem
                    key={`${result.conversationId}-${result.messageId}-${idx}`}
                    value={`${result.conversationTitle} ${result.matchSnippet}`}
                    onSelect={() => handleSelect(result)}
                    className="flex items-start gap-2"
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">
                          {result.conversationTitle}
                        </span>
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
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> to close ·
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] ml-1">⌘K</kbd> to open
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
