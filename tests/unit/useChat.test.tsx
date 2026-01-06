import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReactNode } from 'react';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/lib/api', () => ({
  streamChat: vi.fn(),
  summarizeMessages: vi.fn(),
}));

vi.mock('@/lib/imageStorage', () => ({
  processMessageImages: vi.fn((imgs) => Promise.resolve(imgs)),
}));

import { useChat } from '@/hooks/useChat';
import { APIConfig, Conversation } from '@/types/chat';
import { toast } from 'sonner';

const wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

const mockConfig: APIConfig = {
  providers: [{
    id: 'test',
    name: 'Test',
    baseUrl: 'http://test.com',
    apiKey: 'key',
    models: [{ id: 'model-1', name: 'Model 1', isActive: true }],
  }],
  systemPrompt: 'You are helpful',
  temperature: 0.7,
  maxTokens: 1000,
};

const mockConfigNoModel: APIConfig = {
  providers: [],
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 1000,
};

describe('useChat', () => {
  let conversations: Conversation[];
  let setConversations: ReturnType<typeof vi.fn>;
  let setActiveConversationId: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    conversations = [];
    setConversations = vi.fn();
    setActiveConversationId = vi.fn();
    vi.clearAllMocks();
  });

  it('initializes with isLoading false', () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfig,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
  });

  it('shows error and navigates when no model configured', async () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfigNoModel,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleSend('Hello');
    });

    expect(toast.error).toHaveBeenCalledWith('Please configure an LLM provider and activate a model');
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('exposes all required functions', () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfig,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    expect(typeof result.current.handleSend).toBe('function');
    expect(typeof result.current.handleStop).toBe('function');
    expect(typeof result.current.handleRegenerate).toBe('function');
    expect(typeof result.current.handleEditMessage).toBe('function');
    expect(result.current.abortControllerRef).toBeDefined();
  });

  it('handleStop does nothing when not loading', () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfig,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    // Should not throw
    act(() => {
      result.current.handleStop();
    });

    // toast.info should not be called since there's nothing to stop
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('handleRegenerate does nothing without active conversation', () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfig,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    // Should not throw
    act(() => {
      result.current.handleRegenerate();
    });
  });

  it('handleEditMessage does nothing without active conversation', () => {
    const { result } = renderHook(
      () => useChat({
        config: mockConfig,
        conversations,
        setConversations,
        activeConversationId: null,
        setActiveConversationId,
      }),
      { wrapper }
    );

    // Should not throw
    act(() => {
      result.current.handleEditMessage('msg-1', 'new content');
    });
  });
});
