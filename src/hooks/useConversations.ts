import { useState, useEffect, useCallback, useRef, useTransition, startTransition } from 'react';
import { toast } from 'sonner';
import { Conversation, generateId } from '@/types/chat';
import { exportAsMarkdown, downloadFile } from '@/lib/export';
import { storageService } from '@/lib/storageService';
import { deleteConversationMemory } from '@/lib/memoryManager';
import { useStreamingStore } from '@/stores/streamingStore';

interface UseConversationsReturn {
  conversations: Conversation[];
  setConversations: (value: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeConversation: Conversation | undefined;
  draftConversation: Conversation | null;
  createNewConversation: () => void;
  deleteConversation: (id: string) => void;
  handleRename: (id: string, newTitle: string) => void;
  handleExport: (id: string) => void;
  handleSelectConversation: (id: string) => void;
  convertDraftToConversation: () => void;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversationsState] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasRestoredActive = useRef(false);
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSavedUpdatedAtRef = useRef<Map<string, number>>(new Map());

  const activeConversation = draftConversation?.id === activeConversationId
    ? draftConversation
    : conversations.find((c) => c.id === activeConversationId);
  const isStreaming = useStreamingStore(state => state.isLoading);

  // Load conversations from storage on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        // 1. Try metadata cache first for instant sidebar render
        const cachedMetadata = localStorage.getItem('openchat-conversations-metadata');
        let initialConvs: Conversation[] = [];

        if (cachedMetadata) {
          try {
            const parsed: unknown = JSON.parse(cachedMetadata);
            if (Array.isArray(parsed)) {
              type ConvMeta = Pick<Conversation, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'folderId'>;
              const metadata = parsed as Array<Partial<ConvMeta>>;
              initialConvs = metadata
                .filter((m): m is Partial<ConvMeta> & { id: string } => typeof m.id === 'string')
                .map((m) => ({
                  id: m.id,
                  title: typeof m.title === 'string' ? m.title : 'Chat',
                  messages: [],
                  createdAt: m.createdAt ? new Date(String(m.createdAt)) : new Date(),
                  updatedAt: m.updatedAt ? new Date(String(m.updatedAt)) : new Date(),
                  folderId: typeof m.folderId === 'string' ? m.folderId : undefined,
                  isSkeleton: true
                }));
            }
            setConversationsState(initialConvs);
          } catch {
            // Ignore corrupt metadata cache.
          }
        }

        // 2. Load IDs from storage to see what's actually there
        const ids = await storageService.listConversations();
        if (ids.length > 0) {
          // 3. Optimization: Instead of loading EVERYTHING, we only load the active one
          // and any conversation that was updated recently (top 5) to ensure titles are fresh.
          const lastActiveId = localStorage.getItem('openchat-active-conversation');
          const targetIds = Array.from(new Set([
            ...(lastActiveId ? [lastActiveId] : []),
            ...ids.slice(0, 5)
          ]));

          const loadedConvs = (await Promise.all(
            targetIds.map(id => storageService.getConversation<Conversation>(id))
          )).filter((c): c is Conversation => !!c);

          setConversationsState(prev => {
            const map = new Map(prev.map(c => [c.id, c]));
            loadedConvs.forEach(c => map.set(c.id, c));

            // Add any missing IDs as skeletons if not in cache
            ids.forEach(id => {
              if (!map.has(id)) {
                map.set(id, {
                  id,
                  title: 'Chat',
                  messages: [],
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  isSkeleton: true
                });
              }
            });

            const final = Array.from(map.values());
            final.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            return final;
          });

          // Restore active ID
          if (lastActiveId && ids.includes(lastActiveId)) {
            setActiveConversationId(lastActiveId);
          } else if (ids.length > 0) {
            setActiveConversationId(ids[0]);
          }

          hasRestoredActive.current = true;
        }
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
      setIsLoaded(true);
    };
    loadConversations();
  }, []);

  // Create draft conversation if no active conversation after loading
  useEffect(() => {
    if (isLoaded && !activeConversationId && !draftConversation) {
      const newDraft: Conversation = {
        id: generateId(),
        title: 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setDraftConversation(newDraft);
      setActiveConversationId(newDraft.id);
    }
  }, [isLoaded, activeConversationId, draftConversation]);

  // Update active conversation tracker in localStorage
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('openchat-active-conversation', activeConversationId);
    }
  }, [activeConversationId]);

  const metadataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save metadata to localStorage with debouncing to prevent UI lag during streaming
  useEffect(() => {
    if (!isLoaded || isStreaming) return;

    if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current);

    metadataTimeoutRef.current = setTimeout(() => {
      try {
        const metadata = conversations.map(({ id, title, createdAt, updatedAt, folderId }) => ({
          id, title, createdAt, updatedAt, folderId
        }));
        localStorage.setItem('openchat-conversations-metadata', JSON.stringify(metadata));
      } catch (e) {
        console.warn('Failed to save metadata:', e);
      }
    }, 5000); // Increased to 5 second debounce for metadata (very lightweight)

    return () => {
      if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current);
    };
  }, [conversations, isLoaded, isStreaming]);

  // Debounced persistence for ALL conversations (active and non-active).
  // This avoids losing renames/folder changes made in the sidebar.
  useEffect(() => {
    if (!isLoaded || isStreaming) return;

    for (const conv of conversations) {
      if (!conv || conv.isSkeleton) continue;

      const updatedAtMs = new Date(conv.updatedAt).getTime();
      const lastSavedMs = lastSavedUpdatedAtRef.current.get(conv.id) ?? 0;

      if (updatedAtMs <= lastSavedMs) continue;

      const existing = saveTimeoutsRef.current.get(conv.id);
      if (existing) clearTimeout(existing);

      const t = setTimeout(async () => {
        try {
          await storageService.saveConversation(conv.id, conv);
          lastSavedUpdatedAtRef.current.set(conv.id, updatedAtMs);
        } catch {
          // Ignore persistence errors; UI remains usable with in-memory state.
        }
      }, 1500); // 1.5s debounce for USB stick safety

      saveTimeoutsRef.current.set(conv.id, t);
    }
  }, [conversations, isLoaded, isStreaming]);

  // Cleanup pending timeouts on unmount
  useEffect(() => {
    return () => {
      for (const t of saveTimeoutsRef.current.values()) clearTimeout(t);
      saveTimeoutsRef.current.clear();
    };
  }, []);

  const isLoadedRef = useRef(isLoaded);
  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);

  const setConversations = useCallback((value: Conversation[] | ((prev: Conversation[]) => Conversation[]), _options?: { skipPersist?: boolean }) => {
    setConversationsState(prev => {
      const newConvs = typeof value === 'function' ? value(prev) : value;
      return newConvs;
    });
  }, []);

  const createNewConversation = useCallback(() => {
    // Create a draft conversation instead of saving immediately
    const newDraft: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setDraftConversation(newDraft);
    setActiveConversationId(newDraft.id);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      // Delete from storage
      await storageService.deleteConversation(id);
      await deleteConversationMemory(id);

      setConversationsState((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    },
    [activeConversationId]
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      setConversations((prev) => {
        const newConvs = prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: new Date() } : c));
        return newConvs;
      });
      toast.success('Conversation renamed');
    },
    [setConversations]
  );

  const handleExport = useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;

      const markdown = exportAsMarkdown(conv);
      const filename = `${conv.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      downloadFile(markdown, filename, 'text/markdown');
      toast.success('Conversation exported');
    },
    [conversations]
  );

  const handleSelectConversation = useCallback(async (id: string) => {
    // Clear draft if exists when selecting a conversation
    setDraftConversation(null);

    // Optimization D: Lazy load messages if it's a skeleton
    const conv = conversations.find(c => c.id === id);
    if (conv && conv.isSkeleton) {
      const fullConv = await storageService.getConversation<Conversation>(id);
      if (fullConv) {
        // Use startTransition to make the state update non-blocking
        startTransition(() => {
          setConversationsState(prev => prev.map(c => c.id === id ? fullConv : c));
        });
      }
    }
    setActiveConversationId(id);
  }, [conversations]);

  const convertDraftToConversation = useCallback(() => {
    if (draftConversation) {
      setConversations((prev) => [draftConversation, ...prev]);
      setDraftConversation(null);
    }
  }, [draftConversation]);

  return {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    draftConversation,
    createNewConversation,
    deleteConversation,
    handleRename,
    handleExport,
    handleSelectConversation,
    convertDraftToConversation,
  };
}
