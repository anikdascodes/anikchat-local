import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ConversationFolder, Conversation, generateId } from '@/types/chat';
import * as supabaseService from '@/lib/localStorageService';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface UseFoldersReturn {
  folders: ConversationFolder[];
  activeFolder: string | null;
  setActiveFolder: (id: string | null) => void;
  createFolder: (name: string, color: string) => void;
  deleteFolder: (id: string) => void;
  assignFolder: (conversationId: string, folderId: string | null, setConversations: (fn: (prev: Conversation[]) => Conversation[]) => void) => void;
  getFilteredConversations: (conversations: Conversation[]) => Conversation[];
}

export function useFolders(): UseFoldersReturn {
  const { user } = useAuth();
  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Load folders from Supabase on mount
  useEffect(() => {
    if (!user) return;
    supabaseService.listFolders()
      .then(setFolders)
      .catch(e => logger.error('Failed to load folders', e));
  }, [user]);

  const createFolder = useCallback((name: string, color: string) => {
    if (!user) return;
    const newFolder: ConversationFolder = {
      id: generateId(),
      name,
      color,
      createdAt: new Date(),
    };
    setFolders(prev => [...prev, newFolder]);
    supabaseService.saveFolder(newFolder, user.id)
      .catch(e => logger.error('Failed to save folder', e));
    toast.success(`Folder "${name}" created`);
  }, [user]);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    if (activeFolder === id) setActiveFolder(null);
    supabaseService.deleteFolder(id)
      .catch(e => logger.error('Failed to delete folder', e));
    toast.success('Folder deleted');
  }, [activeFolder]);

  const assignFolder = useCallback((
    conversationId: string,
    folderId: string | null,
    setConversations: (fn: (prev: Conversation[]) => Conversation[]) => void
  ) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId
          ? { ...c, folderId: folderId || undefined, updatedAt: new Date() }
          : c
      )
    );
    toast.success(folderId ? 'Moved to folder' : 'Removed from folder');
  }, []);

  const getFilteredConversations = useCallback((conversations: Conversation[]) => {
    if (activeFolder === null) return conversations;
    if (activeFolder === 'uncategorized') return conversations.filter(c => !c.folderId);
    return conversations.filter(c => c.folderId === activeFolder);
  }, [activeFolder]);

  return {
    folders,
    activeFolder,
    setActiveFolder,
    createFolder,
    deleteFolder,
    assignFolder,
    getFilteredConversations,
  };
}
