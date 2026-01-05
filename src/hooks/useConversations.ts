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

  // Save conversations with debounce
  const saveConversations = useCallback(async (convs: Conversation[]) => {
    // Also save to localStorage as backup
    localStorage.setItem('openchat-conversations', JSON.stringify(convs));
    
    // Save each conversation to storage
    for (const conv of convs) {
      await storageService.saveConversation(conv.id, conv);
    }
  }, []);

  const setConversations = useCallback((value: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
    setConversationsState(prev => {
      const newConvs = typeof value === 'function' ? value(prev) : value;
      
      // Debounced save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveConversations(newConvs), 500);
      
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
