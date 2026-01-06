import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

// Mock localStorage
const localStorageData = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageData.set(key, value),
  removeItem: (key: string) => localStorageData.delete(key),
  clear: () => localStorageData.clear(),
});

// Mock toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock export functions
vi.mock('@/lib/export', () => ({
  exportAsMarkdown: vi.fn(() => '# Test'),
  downloadFile: vi.fn(),
}));

// Mock memoryManager
vi.mock('@/lib/memoryManager', () => ({
  deleteConversationMemory: vi.fn(),
}));

import { Conversation } from '@/types/chat';

// Helper to get fresh hook with clean IndexedDB
const getHook = async () => {
  // Reset IndexedDB
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
  const { useConversations } = await import('@/hooks/useConversations');
  return useConversations;
};

describe('useConversations', () => {
  beforeEach(() => {
    localStorageData.clear();
    vi.clearAllMocks();
  });

  it('initializes with empty conversations', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());
    
    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
    });
  });

  it('loads conversations from localStorage', async () => {
    const mockConvs: Conversation[] = [
      { id: '1', title: 'Test', messages: [], createdAt: new Date(), updatedAt: new Date() },
    ];
    localStorageData.set('openchat-conversations', JSON.stringify(mockConvs));

    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(1);
    });
  });

  it('creates new conversation', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
    });

    act(() => {
      result.current.createNewConversation();
    });

    expect(result.current.conversations.length).toBe(1);
    expect(result.current.conversations[0].title).toBe('New Chat');
  });

  it('sets active conversation on create', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
    });

    act(() => {
      result.current.createNewConversation();
    });

    expect(result.current.activeConversationId).not.toBeNull();
    expect(result.current.activeConversation).toBeDefined();
  });

  it('deletes conversation', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    // Create two conversations
    act(() => {
      result.current.createNewConversation();
    });
    act(() => {
      result.current.createNewConversation();
    });

    expect(result.current.conversations.length).toBe(2);
    const idToDelete = result.current.conversations[0].id;

    await act(async () => {
      await result.current.deleteConversation(idToDelete);
    });

    expect(result.current.conversations.length).toBe(1);
    expect(result.current.conversations.find(c => c.id === idToDelete)).toBeUndefined();
  });

  it('renames conversation', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.createNewConversation();
    });

    const id = result.current.conversations[0].id;

    act(() => {
      result.current.handleRename(id, 'New Title');
    });

    expect(result.current.conversations[0].title).toBe('New Title');
  });

  it('selects conversation', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.createNewConversation();
    });
    act(() => {
      result.current.createNewConversation();
    });

    const secondId = result.current.conversations[1].id;

    act(() => {
      result.current.handleSelectConversation(secondId);
    });

    expect(result.current.activeConversationId).toBe(secondId);
  });

  it('persists active conversation ID to localStorage', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.createNewConversation();
    });

    const activeId = result.current.activeConversationId;
    expect(localStorageData.get('openchat-active-conversation')).toBe(activeId);
  });

  it('saves conversations to localStorage on change', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.createNewConversation();
    });

    const saved = localStorageData.get('openchat-conversations');
    expect(saved).toBeDefined();
    const parsed = JSON.parse(saved!);
    expect(parsed.length).toBe(1);
  });

  it('returns activeConversation based on activeConversationId', async () => {
    const useConversations = await getHook();
    const { result } = renderHook(() => useConversations());

    act(() => {
      result.current.createNewConversation();
    });

    expect(result.current.activeConversation).toBeDefined();
    expect(result.current.activeConversation?.id).toBe(result.current.activeConversationId);
  });
});
