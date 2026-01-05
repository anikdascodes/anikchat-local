import { useCallback } from 'react';
import { toast } from 'sonner';
import { ConversationFolder, Conversation, generateId } from '@/types/chat';
import { useLocalStorage } from './useLocalStorage';

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
  const [folders, setFolders] = useLocalStorage<ConversationFolder[]>('openchat-folders', []);
  const [activeFolder, setActiveFolder] = useLocalStorage<string | null>('openchat-active-folder', null);

  const createFolder = useCallback((name: string, color: string) => {
    const newFolder: ConversationFolder = {
      id: generateId(),
      name,
      color,
      createdAt: new Date(),
    };
    setFolders(prev => [...prev, newFolder]);
    toast.success(`Folder "${name}" created`);
  }, [setFolders]);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    if (activeFolder === id) {
      setActiveFolder(null);
    }
    toast.success('Folder deleted');
  }, [setFolders, activeFolder, setActiveFolder]);

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
    if (activeFolder === null) {
      return conversations;
    }
    if (activeFolder === 'uncategorized') {
      return conversations.filter(c => !c.folderId);
    }
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
