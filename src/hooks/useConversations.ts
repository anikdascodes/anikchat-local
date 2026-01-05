import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Conversation, generateId } from '@/types/chat';
import { exportAsMarkdown, downloadFile } from '@/lib/export';
import { useLocalStorage } from './useLocalStorage';

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
  const [conversations, setConversations] = useLocalStorage<Conversation[]>('openchat-conversations', []);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Restore active conversation from localStorage on mount
  useEffect(() => {
    const savedActiveId = localStorage.getItem('openchat-active-conversation');
    if (savedActiveId && conversations.find(c => c.id === savedActiveId)) {
      setActiveConversationId(savedActiveId);
    } else if (conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('openchat-active-conversation', activeConversationId);
    }
  }, [activeConversationId]);

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
    (id: string) => {
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        // Update active conversation if we're deleting the current one
        if (activeConversationId === id) {
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    },
    [activeConversationId, setConversations]
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
