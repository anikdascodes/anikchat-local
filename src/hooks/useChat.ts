import { useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useStreamingStore } from '@/stores/streamingStore';
import {
  APIConfig,
  Conversation,
  Message,
  generateId,
  generateTitle,
  hasActiveModel
} from '@/types/chat';
import { streamChat, summarizeMessages } from '@/lib/api';
import { processMessageImages } from '@/lib/imageStorage';
import { logger } from '@/lib/logger';

// Performance: Adaptive flush interval based on response speed
const FAST_FLUSH_MS = 50;   // For fast responses
const SLOW_FLUSH_MS = 150;  // For normal/slow responses
const MIN_CHUNK_SIZE = 10;   // Minimum chunks before considering response fast

interface UseChatOptions {
  config: APIConfig;
  conversations: Conversation[];
  setConversations: (value: Conversation[] | ((prev: Conversation[]) => Conversation[]), options?: { skipPersist?: boolean }) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  draftConversation?: Conversation | null;
  convertDraftToConversation?: () => void;
}

interface UseChatReturn {
  isLoading: boolean;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  handleSend: (content: string, images?: string[]) => Promise<void>;
  handleStop: () => void;
  handleRegenerate: () => void;
  handleEditMessage: (messageId: string, newContent: string) => void;
  handleBranchNavigate: (messageId: string, branchIndex: number) => void;
}

export function useChat({
  config,
  conversations,
  setConversations,
  activeConversationId,
  setActiveConversationId,
  draftConversation,
  convertDraftToConversation,
}: UseChatOptions): UseChatReturn {
  const navigate = useNavigate();

  // State from separate non-persisted store (performance optimization)
  const isLoading = useStreamingStore(state => state.isLoading);
  const setIsLoading = useStreamingStore(state => state.setIsLoading);
  const setStreamingContent = useStreamingStore(state => state.setStreamingContent);
  const setStreamingMessageId = useStreamingStore(state => state.setStreamingMessageId);
  const resetStreaming = useStreamingStore(state => state.resetStreaming);

  // Refs for current state to avoid dependency cycles and extra re-renders
  const configRef = useRef(config);
  const conversationsRef = useRef(conversations);
  const activeConversationIdRef = useRef(activeConversationId);
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeConversationRef = useRef(activeConversation);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Refs for streaming buffer (performance optimization)
  // Use array for O(1) append instead of O(N) string concat
  const streamingBufferRef = useRef<string[]>([]);
  const flushTimeoutRef = useRef<number>();
  const totalStreamedRef = useRef<string[]>([]);

  // Use a ref for streamingMessageId to avoid re-renders when it changes
  const streamingMessageIdRef = useRef<string | null>(null);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Flush buffered streaming content to state
  const flushStreamingBuffer = useCallback(() => {
    if (streamingBufferRef.current.length > 0) {
      const chunk = streamingBufferRef.current.join('');
      totalStreamedRef.current.push(chunk);
      setStreamingContent(totalStreamedRef.current.join(''));
      streamingBufferRef.current = [];
    }
    flushTimeoutRef.current = undefined;
  }, [setStreamingContent]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;

      // Flush any remaining content and update conversations
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
      }
      flushStreamingBuffer();

      // Update conversations with final content
      const finalContent = totalStreamedRef.current.join('');
      const currentId = activeConversationIdRef.current;
      const streamingMessageId = streamingMessageIdRef.current;
      if (finalContent && streamingMessageId && currentId) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentId) return c;
            const messages = [...c.messages];
            const lastIdx = messages.length - 1;
            if (messages[lastIdx]?.role === 'assistant') {
              messages[lastIdx] = { ...messages[lastIdx], content: finalContent };
            }
            return { ...c, messages, updatedAt: new Date() };
          })
        );
      }

      // Reset streaming state
      resetStreaming();
      streamingMessageIdRef.current = null;
      totalStreamedRef.current = [];
      streamingBufferRef.current = [];

      toast.info('Generation stopped');
    }
  }, [flushStreamingBuffer, setConversations, resetStreaming]);

  const handleSend = useCallback(
    async (content: string, images?: string[]) => {
      const currentConfig = configRef.current;
      if (!hasActiveModel(currentConfig)) {
        toast.error('Please configure an LLM provider and activate a model');
        navigate('/settings');
        return;
      }

      let conversationId = activeConversationIdRef.current;
      let conv = activeConversationRef.current;

      // Create new conversation if none exists
      if (!conv) {
        const newId = generateId();
        const newConv: Conversation = {
          id: newId,
          title: generateTitle(content),
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newId);
        conversationId = newId;
        conv = newConv;
      } else if (convertDraftToConversation && draftConversation && conv.id === draftConversation.id) {
        // Convert draft to real conversation when first message is sent
        convertDraftToConversation();
      }

      // Store images separately and get references
      let imageRefs: string[] | undefined;
      if (images && images.length > 0) {
        imageRefs = await processMessageImages(images);
      }

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content,
        images: imageRefs,
        timestamp: new Date(),
      };

      const assistantMessageId = generateId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      // Update conversation with user message and empty assistant message
      const targetId = conversationId;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== targetId) return c;
          return {
            ...c,
            title: c.messages.length === 0 ? generateTitle(content) : c.title,
            messages: [...c.messages, userMessage, assistantMessage],
            updatedAt: new Date(),
          };
        })
      );

      // Initialize streaming state
      setStreamingContent('');
      setStreamingMessageId(assistantMessageId);
      streamingMessageIdRef.current = assistantMessageId;
      streamingBufferRef.current = [];
      totalStreamedRef.current = [];
      const chunkCountRef = { count: 0 };
      const startTimeRef = Date.now();

      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      const messagesToSend = [...(conv?.messages || []), userMessage];
      const existingSummary = conv?.summary;

      let pendingSummarization: { messages: Message[]; existingSummary?: string } | null = null;

      await streamChat({
        config: currentConfig,
        messages: messagesToSend,
        conversationId: conversationId || undefined,
        existingSummary,
        signal: abortControllerRef.current.signal,
        onChunk: (chunk) => {
          chunkCountRef.count++;

          // Adaptive flush: faster for quick responses, slower for steady streaming
          const elapsed = Date.now() - startTimeRef;
          const isFastResponse = chunkCountRef.count < MIN_CHUNK_SIZE && elapsed < 500;
          const flushInterval = isFastResponse ? FAST_FLUSH_MS : SLOW_FLUSH_MS;

          // Buffer chunks instead of updating state immediately (performance)
          streamingBufferRef.current.push(chunk);

          // Schedule flush if not already scheduled
          if (!flushTimeoutRef.current) {
            flushTimeoutRef.current = window.setTimeout(flushStreamingBuffer, flushInterval);
          }
        },
        onNeedsSummarization: (messagesToSummarize) => {
          pendingSummarization = {
            messages: messagesToSummarize,
            existingSummary,
          };
        },
        onError: (error) => {
          logger.error('Chat error:', error);

          // Clear streaming state
          if (flushTimeoutRef.current) {
            window.clearTimeout(flushTimeoutRef.current);
            flushTimeoutRef.current = undefined;
          }
          resetStreaming();
          streamingMessageIdRef.current = null;
          streamingBufferRef.current = [];
          totalStreamedRef.current = [];

          // Get the last user message for retry functionality
          const currentMessages = conversationsRef.current.find(c => c.id === targetId)?.messages || [];
          let lastUserMessage: Message | null = null;
          for (let i = currentMessages.length - 1; i >= 0; i--) {
            if (currentMessages[i].role === 'user') {
              lastUserMessage = currentMessages[i];
              break;
            }
          }

          toast.error(error.message || 'An error occurred', {
            duration: 10000,
            action: lastUserMessage ? {
              label: 'Retry',
              onClick: () => {
                setTimeout(() => {
                  handleSend(lastUserMessage!.content, lastUserMessage!.images);
                }, 100);
              },
            } : undefined,
          });

          setIsLoading(false);
          abortControllerRef.current = null;

          // Remove the empty assistant message on error
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const messages = c.messages;
              if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content === '') {
                return { ...c, messages: messages.slice(0, -1) };
              }
              return c;
            })
          );
        },
        onComplete: async () => {
          // Flush any remaining buffered content
          if (flushTimeoutRef.current) {
            window.clearTimeout(flushTimeoutRef.current);
            flushTimeoutRef.current = undefined;
          }

          // Get final content
          const finalContent = totalStreamedRef.current.join('') + streamingBufferRef.current.join('');

          // Clear streaming state FIRST to prevent double display
          resetStreaming();
          streamingMessageIdRef.current = null;
          streamingBufferRef.current = [];
          totalStreamedRef.current = [];
          setIsLoading(false);
          abortControllerRef.current = null;

          // Then update conversations with final content (this triggers storage save)
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== targetId) return c;
              const messages = [...c.messages];
              const lastIdx = messages.length - 1;
              if (messages[lastIdx]?.role === 'assistant') {
                messages[lastIdx] = { ...messages[lastIdx], content: finalContent };
              }
              return { ...c, messages, updatedAt: new Date() };
            })
          );

          // Store assistant response in memory
          if (targetId && finalContent) {
            import('@/lib/memoryManager').then(({ storeMessage }) => {
              storeMessage(targetId, {
                id: assistantMessageId,
                role: 'assistant',
                content: finalContent,
                timestamp: new Date(),
              }).catch(() => { });
            });
          }

          if (pendingSummarization && pendingSummarization.messages.length > 0) {
            try {
              toast.info('Summarizing conversation history...', { duration: 2000 });

              const summary = await summarizeMessages({
                config: currentConfig,
                messages: pendingSummarization.messages,
                existingSummary: pendingSummarization.existingSummary,
              });

              if (targetId) {
                import('@/lib/memoryManager').then(({ saveConversationSummary }) => {
                  saveConversationSummary(targetId, summary, Date.now()).catch(() => { });
                });
              }

              setConversations((prev) => {
                const currentConv = prev.find(c => c.id === targetId);
                if (!currentConv) return prev;

                return prev.map((c) => {
                  if (c.id !== targetId) return c;
                  return {
                    ...c,
                    messages: c.messages,
                    summary,
                    summarizedUpTo: c.messages.length - 5,
                    updatedAt: new Date(),
                  };
                });
              });

              toast.success('Context optimized', { duration: 2000 });
            } catch (error) {
              logger.error('Summarization failed:', error);
            }
          }
        },
      });
    },
    [setConversations, setActiveConversationId, navigate, flushStreamingBuffer, resetStreaming, setIsLoading, setStreamingContent, setStreamingMessageId]
  );

  const handleRegenerate = useCallback(() => {
    const currentConv = activeConversationRef.current;
    const currentId = activeConversationIdRef.current;
    if (!currentConv || currentConv.messages.length < 2) return;
    if (isLoadingRef.current) return;

    const messages = currentConv.messages;
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }

    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== currentId) return c;
        return {
          ...c,
          messages: c.messages.slice(0, lastUserMessageIndex),
          updatedAt: new Date(),
        };
      })
    );

    setTimeout(() => {
      handleSend(lastUserMessage.content, lastUserMessage.images);
    }, 100);

    toast.info('Regenerating response...');
  }, [setConversations, handleSend]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    const currentConv = activeConversationRef.current;
    const currentId = activeConversationIdRef.current;
    if (!currentConv || isLoadingRef.current) return;

    const messageIndex = currentConv.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const editedMessage = currentConv.messages[messageIndex];

    if (editedMessage.role !== 'user') {
      toast.error('Can only edit user messages');
      return;
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== currentId) return c;
        return {
          ...c,
          messages: c.messages.slice(0, messageIndex),
          updatedAt: new Date(),
        };
      })
    );

    setTimeout(() => {
      handleSend(newContent, editedMessage.images);
    }, 100);

    toast.info('Regenerating from edited message...');
  }, [setConversations, handleSend]);

  const handleBranchNavigate = useCallback((messageId: string, branchIndex: number) => {
    const currentConv = activeConversationRef.current;
    const currentId = activeConversationIdRef.current;
    if (!currentConv || !currentId) return;

    const targetMessage = currentConv.messages.find(m => m.id === messageId);
    if (!targetMessage?.parentId) return;

    const siblings = currentConv.messages.filter(
      m => m.parentId === targetMessage.parentId && m.role === targetMessage.role
    );

    if (branchIndex < 0 || branchIndex >= siblings.length) return;

    const newActiveMessage = siblings[branchIndex];
    if (!newActiveMessage || newActiveMessage.id === messageId) return;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== currentId) return c;

        const currentIndex = c.messages.findIndex(m => m.id === messageId);
        if (currentIndex === -1) return c;

        const messagesBeforeBranch = c.messages.slice(0, currentIndex);
        const branchMessages = [newActiveMessage];

        let lastId = newActiveMessage.id;
        for (const msg of c.messages) {
          if (msg.parentId === lastId) {
            branchMessages.push(msg);
            lastId = msg.id;
          }
        }

        return {
          ...c,
          messages: [...messagesBeforeBranch, ...branchMessages],
          updatedAt: new Date(),
        };
      })
    );
  }, [setConversations]);

  return {
    isLoading,
    abortControllerRef,
    handleSend,
    handleStop,
    handleRegenerate,
    handleEditMessage,
    handleBranchNavigate,
  };
}
