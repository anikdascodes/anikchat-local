import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
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

// Performance: Flush streaming content every 50ms instead of on every chunk
const STREAMING_FLUSH_INTERVAL_MS = 50;

interface UseChatOptions {
  config: APIConfig;
  conversations: Conversation[];
  setConversations: (value: Conversation[] | ((prev: Conversation[]) => Conversation[]), options?: { skipPersist?: boolean }) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

interface UseChatReturn {
  isLoading: boolean;
  streamingContent: string;
  streamingMessageId: string | null;
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
}: UseChatOptions): UseChatReturn {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Streaming state - separate from conversations to avoid triggering storage writes
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Refs for streaming buffer (performance optimization)
  const streamingBufferRef = useRef('');
  const flushTimeoutRef = useRef<number>();
  const totalStreamedRef = useRef('');

  // Ref to always have latest conversations (fixes stale closure)
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Cleanup on unmount - abort any pending requests
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (flushTimeoutRef.current) {
        window.clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Flush buffered streaming content to state
  const flushStreamingBuffer = useCallback(() => {
    if (streamingBufferRef.current) {
      totalStreamedRef.current += streamingBufferRef.current;
      setStreamingContent(totalStreamedRef.current);
      streamingBufferRef.current = '';
    }
    flushTimeoutRef.current = undefined;
  }, []);

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
      const finalContent = totalStreamedRef.current;
      if (finalContent && streamingMessageId) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeConversationId) return c;
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
      setStreamingContent('');
      setStreamingMessageId(null);
      totalStreamedRef.current = '';
      streamingBufferRef.current = '';

      setIsLoading(false);
      toast.info('Generation stopped');
    }
  }, [activeConversationId, flushStreamingBuffer, setConversations, streamingMessageId]);

  const handleSend = useCallback(
    async (content: string, images?: string[]) => {
      if (!hasActiveModel(config)) {
        toast.error('Please configure an LLM provider and activate a model');
        navigate('/settings');
        return;
      }

      let conversationId = activeConversationId;
      let conv = activeConversation;

      // Create new conversation if none exists
      if (!conv) {
        const newConv: Conversation = {
          id: generateId(),
          title: generateTitle(content),
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        conversationId = newConv.id;
        conv = newConv;
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
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
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
      streamingBufferRef.current = '';
      totalStreamedRef.current = '';

      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      const messagesToSend = [...(conv?.messages || []), userMessage];
      const existingSummary = conv?.summary;

      let pendingSummarization: { messages: Message[]; existingSummary?: string } | null = null;

      await streamChat({
        config,
        messages: messagesToSend,
        conversationId: conversationId || undefined,
        existingSummary,
        signal: abortControllerRef.current.signal,
        onChunk: (chunk) => {
          // Buffer chunks instead of updating state immediately (performance)
          streamingBufferRef.current += chunk;

          // Schedule flush if not already scheduled
          if (!flushTimeoutRef.current) {
            flushTimeoutRef.current = window.setTimeout(flushStreamingBuffer, STREAMING_FLUSH_INTERVAL_MS);
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
          setStreamingContent('');
          setStreamingMessageId(null);
          streamingBufferRef.current = '';
          totalStreamedRef.current = '';

          // Get the last user message for retry functionality
          const currentMessages = conversationsRef.current.find(c => c.id === conversationId)?.messages || [];
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
              if (c.id !== conversationId) return c;
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
          const finalContent = totalStreamedRef.current + streamingBufferRef.current;

          // Update conversations with final content (this triggers storage save)
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== conversationId) return c;
              const messages = [...c.messages];
              const lastIdx = messages.length - 1;
              if (messages[lastIdx]?.role === 'assistant') {
                messages[lastIdx] = { ...messages[lastIdx], content: finalContent };
              }
              return { ...c, messages, updatedAt: new Date() };
            })
          );

          // Delay clearing streaming state to ensure conversation update renders first
          // This prevents the flash where streaming content disappears before the final message appears
          await new Promise(resolve => setTimeout(resolve, 50));

          setStreamingContent('');
          setStreamingMessageId(null);
          streamingBufferRef.current = '';
          totalStreamedRef.current = '';

          setIsLoading(false);
          abortControllerRef.current = null;

          // Store assistant response in memory
          if (conversationId && finalContent) {
            import('@/lib/memoryManager').then(({ storeMessage }) => {
              storeMessage(conversationId, {
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
                config,
                messages: pendingSummarization.messages,
                existingSummary: pendingSummarization.existingSummary,
              });

              if (conversationId) {
                import('@/lib/memoryManager').then(({ saveConversationSummary }) => {
                  saveConversationSummary(conversationId, summary, Date.now()).catch(() => { });
                });
              }

              // Use ref to get the latest conversations state (avoids race condition)
              setConversations((prev) => {
                // Find the current conversation with latest data
                const currentConv = prev.find(c => c.id === conversationId);
                if (!currentConv) return prev;

                return prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  return {
                    ...c,
                    // Preserve all existing data including messages
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
    [config, activeConversationId, activeConversation, setConversations, setActiveConversationId, navigate, flushStreamingBuffer]
  );

  const handleRegenerate = useCallback(() => {
    if (!activeConversation || activeConversation.messages.length < 2) return;
    if (isLoading) return;

    const messages = activeConversation.messages;
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
        if (c.id !== activeConversationId) return c;
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
  }, [activeConversation, activeConversationId, isLoading, setConversations, handleSend]);

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    if (!activeConversation || isLoading) return;

    const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const editedMessage = activeConversation.messages[messageIndex];

    if (editedMessage.role !== 'user') {
      toast.error('Can only edit user messages');
      return;
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;
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
  }, [activeConversation, activeConversationId, isLoading, setConversations, handleSend]);

  const handleBranchNavigate = useCallback((messageId: string, branchIndex: number) => {
    if (!activeConversation) return;

    const targetMessage = activeConversation.messages.find(m => m.id === messageId);
    if (!targetMessage?.parentId) return;

    const siblings = activeConversation.messages.filter(
      m => m.parentId === targetMessage.parentId && m.role === targetMessage.role
    );

    if (branchIndex < 0 || branchIndex >= siblings.length) return;

    const newActiveMessage = siblings[branchIndex];
    if (!newActiveMessage || newActiveMessage.id === messageId) return;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;

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
  }, [activeConversation, activeConversationId, setConversations]);

  return {
    isLoading,
    streamingContent,
    streamingMessageId,
    abortControllerRef,
    handleSend,
    handleStop,
    handleRegenerate,
    handleEditMessage,
    handleBranchNavigate,
  };
}
