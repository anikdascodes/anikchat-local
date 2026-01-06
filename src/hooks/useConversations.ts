import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Conversation, generateId } from '@/types/chat';
import { exportAsMarkdown, downloadFile } from '@/lib/export';
import { storageService } from '@/lib/storageService';
import { deleteConversationMemory } from '@/lib/memoryManager';

interface UseConversationsReturn {
  conversations: Conversation[];
  setConversations: (value: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeConversation: Conversation | undefined;
  createNewConversation: () => void;
  deleteConversation: (id: string) => void;
  handleRename: (id: string, newTitle: string) => void;
  handleExport: (id: string) => void;
  handleSelectConversation: (id: string) => void;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversationsState] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const hasRestoredActive = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Load conversations from storage on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        // Try file system storage first
        const ids = await storageService.listConversations();
        if (ids.length > 0) {
          const convs: Conversation[] = [];
          for (const id of ids) {
            const conv = await storageService.getConversation<Conversation>(id);
            if (conv) convs.push(conv);
          }
          convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setConversationsState(convs);

          // Restore active conversation immediately after loading
          const savedActiveId = localStorage.getItem('openchat-active-conversation');
          if (savedActiveId && convs.find(c => c.id === savedActiveId)) {
            setActiveConversationId(savedActiveId);
          } else if (convs.length > 0) {
            // Default to most recent conversation, NOT new chat
            setActiveConversationId(convs[0].id);
          }
          hasRestoredActive.current = true;
        } else {
          // Fallback: try localStorage for migration
          const localData = localStorage.getItem('openchat-conversations');
          if (localData) {
            const convs = JSON.parse(localData) as Conversation[];
            convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            setConversationsState(convs);

            // Migrate to new storage
            for (const conv of convs) {
              await storageService.saveConversation(conv.id, conv);
            }

            // Restore active
            const savedActiveId = localStorage.getItem('openchat-active-conversation');
            if (savedActiveId && convs.find(c => c.id === savedActiveId)) {
              setActiveConversationId(savedActiveId);
            } else if (convs.length > 0) {
              setActiveConversationId(convs[0].id);
            }
            hasRestoredActive.current = true;
          }
        }
      } catch (e) {
        console.error('Failed to load conversations:', e);
        // Fallback to localStorage
        const localData = localStorage.getItem('openchat-conversations');
        if (localData) {
          const convs = JSON.parse(localData) as Conversation[];
          setConversationsState(convs);
          if (convs.length > 0) {
            setActiveConversationId(convs[0].id);
          }
          hasRestoredActive.current = true;
        }
      }
      setIsLoaded(true);
    };
    loadConversations();
  }, []);

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('openchat-active-conversation', activeConversationId);
    }
  }, [activeConversationId]);

  // Track pending saves for flush on unmount
  const pendingConvsRef = useRef<Conversation[] | null>(null);

  // Save conversations - immediate for localStorage, debounced for file system
  const saveConversations = useCallback(async (convs: Conversation[]) => {
    // Immediate localStorage backup (fast, prevents data loss)
    localStorage.setItem('openchat-conversations', JSON.stringify(convs));

    // Save to file system storage
    for (const conv of convs) {
      await storageService.saveConversation(conv.id, conv);
    }
    pendingConvsRef.current = null;
  }, []);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Immediate save if there are pending changes
      if (pendingConvsRef.current) {
        localStorage.setItem('openchat-conversations', JSON.stringify(pendingConvsRef.current));
        // Note: Can't await in cleanup, but localStorage is sync
      }
    };
  }, []);

  const setConversations = useCallback((value: Conversation[] | ((prev: Conversation[]) => Conversation[]), options?: { skipPersist?: boolean }) => {
    setConversationsState(prev => {
      const newConvs = typeof value === 'function' ? value(prev) : value;

      // Track pending for flush
      pendingConvsRef.current = newConvs;

      // Skip persistence during streaming for performance
      if (!options?.skipPersist) {
        // Immediate localStorage backup
        localStorage.setItem('openchat-conversations', JSON.stringify(newConvs));
      }

      // Debounced file system save (always, but with longer delay)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveConversations(newConvs), options?.skipPersist ? 1000 : 500);

      return newConvs;
    });
  }, [saveConversations]);

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  }, [setConversations]);

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
        // Update localStorage backup
        localStorage.setItem('openchat-conversations', JSON.stringify(remaining));
        return remaining;
      });
    },
    [activeConversationId]
  );

  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: new Date() } : c))
      );
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

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  return {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    createNewConversation,
    deleteConversation,
    handleRename,
    handleExport,
    handleSelectConversation,
  };
}
