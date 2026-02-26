import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { toast } from 'sonner';
import { Conversation, generateId } from '@/types/chat';
import { exportAsMarkdown, downloadFile } from '@/lib/export';
import * as supabaseService from '@/lib/localStorageService';
import { deleteConversationMemory } from '@/lib/memoryManager';
import { useStreamingStore } from '@/stores/streamingStore';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import { handleStorageError } from '@/lib/errorHandler';

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
  const { user } = useAuth();

  const [conversations, setConversationsState] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSavedUpdatedAtRef = useRef<Map<string, number>>(new Map());

  const activeConversation = draftConversation?.id === activeConversationId
    ? draftConversation
    : conversations.find((c) => c.id === activeConversationId);
  const isStreaming = useStreamingStore(state => state.isLoading);

  // Load conversations from Supabase on mount
  useEffect(() => {
    if (!user) return;
    const loadConversations = async () => {
      try {
        // Load IDs from Supabase, pre-fetch the 5 most recent conversations
        const ids = await supabaseService.listConversations();
        if (ids.length > 0) {
          const targetIds = ids.slice(0, 5);

          const loadedConvs = (await Promise.all(
            targetIds.map(id => supabaseService.getConversation(id))
          )).filter((c): c is Conversation => !!c);

          setConversationsState(prev => {
            const map = new Map(prev.map(c => [c.id, c]));
            loadedConvs.forEach(c => map.set(c.id, c));
            ids.forEach(id => {
              if (!map.has(id)) {
                map.set(id, {
                  id, title: 'Chat', messages: [],
                  createdAt: new Date(), updatedAt: new Date(), isSkeleton: true
                });
              }
            });
            const final = Array.from(map.values());
            final.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            return final;
          });
        }
      } catch (e) {
        handleStorageError(e, 'useConversations.load');
      }
      setIsLoaded(true);
    };
    loadConversations();
  }, [user]);

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
          if (user) await supabaseService.saveConversation(conv, user.id);
          lastSavedUpdatedAtRef.current.set(conv.id, updatedAtMs);
        } catch (error) {
          logger.debug('Failed to save conversation to Supabase:', error);
          // UI remains usable with in-memory state.
        }
      }, 1500); // 1.5s debounce

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
      await supabaseService.deleteConversation(id);
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
      const fullConv = await supabaseService.getConversation(id);
      if (fullConv) {
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
