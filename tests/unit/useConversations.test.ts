import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import type { Conversation } from '@/types/chat';

// Mock localStorage
const localStorageData = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageData.set(key, value),
  removeItem: (key: string) => localStorageData.delete(key),
  clear: () => localStorageData.clear(),
  key: (_: number) => null,
  length: 0,
});

// Mock toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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

type StorageServiceMock = {
  init: ReturnType<typeof vi.fn>;
  listConversations: ReturnType<typeof vi.fn>;
  getConversation: ReturnType<typeof vi.fn>;
  saveConversation: ReturnType<typeof vi.fn>;
  deleteConversation: ReturnType<typeof vi.fn>;
};

const makeConversation = (id: string, title: string): Conversation => ({
  id,
  title,
  messages: [],
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
});

const getHook = async (seed: Conversation[]) => {
  const storageService: StorageServiceMock = {
    init: vi.fn().mockResolvedValue(undefined),
    listConversations: vi.fn().mockResolvedValue(seed.map(c => c.id)),
    getConversation: vi.fn((id: string) => Promise.resolve(seed.find(c => c.id === id) ?? null)),
    saveConversation: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  };

  vi.resetModules();
  vi.doMock('@/lib/storageService', () => ({ storageService }));
  const { useConversations } = await import('@/hooks/useConversations');
  return { useConversations, storageService };
};

describe('useConversations', () => {
  beforeEach(() => {
    localStorageData.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes with empty conversations and creates a draft', async () => {
    const { useConversations } = await getHook([]);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toEqual([]);
      expect(result.current.draftConversation).not.toBeNull();
      expect(result.current.activeConversationId).toBe(result.current.draftConversation?.id);
    });
  });

  it('loads conversations from storageService', async () => {
    const seed = [makeConversation('1', 'Test')];
    const { useConversations } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(1);
      expect(result.current.conversations[0].id).toBe('1');
    });
  });

  it('createNewConversation creates a draft and sets it active', async () => {
    const seed = [makeConversation('1', 'Existing')];
    const { useConversations } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(1);
    });

    act(() => {
      result.current.createNewConversation();
    });

    expect(result.current.draftConversation).not.toBeNull();
    expect(result.current.activeConversationId).toBe(result.current.draftConversation?.id);
  });

  it('deletes a conversation via storageService and removes it from state', async () => {
    const seed = [makeConversation('1', 'A'), makeConversation('2', 'B')];
    const { useConversations, storageService } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2);
    });

    await act(async () => {
      await result.current.deleteConversation('1');
    });

    expect(storageService.deleteConversation).toHaveBeenCalledWith('1');
    expect(result.current.conversations.map(c => c.id)).toEqual(['2']);
  });

  it('renames a conversation and persists it (debounced)', async () => {
    vi.useFakeTimers();
    const seed = [makeConversation('1', 'A')];
    const { useConversations, storageService } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    // Let the initial async load effect complete (no real timers needed).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.conversations.length).toBe(1);

    act(() => {
      result.current.handleRename('1', 'New Title');
    });

    expect(result.current.conversations[0].title).toBe('New Title');

    // Debounced persistence (1.5s)
    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
    });

    expect(storageService.saveConversation).toHaveBeenCalled();
  });

  it('selects conversation by id', async () => {
    const seed = [makeConversation('1', 'A'), makeConversation('2', 'B')];
    const { useConversations } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations.length).toBe(2);
    });

    act(() => {
      result.current.handleSelectConversation('2');
    });

    expect(result.current.activeConversationId).toBe('2');
  });

  it('persists active conversation ID to localStorage', async () => {
    const seed = [makeConversation('1', 'A')];
    const { useConversations } = await getHook(seed);
    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe('1');
    });

    expect(localStorageData.get('openchat-active-conversation')).toBe('1');
  });
});
