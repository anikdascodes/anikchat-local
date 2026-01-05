import { useState, useRef, useCallback } from 'react';
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

interface UseChatOptions {
  config: APIConfig;
  conversations: Conversation[];
  setConversations: (value: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

interface UseChatReturn {
  isLoading: boolean;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  handleSend: (content: string, images?: string[]) => Promise<void>;
  handleStop: () => void;
  handleRegenerate: () => void;
  handleEditMessage: (messageId: string, newContent: string) => void;
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

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      toast.info('Generation stopped');
    }
  }, []);

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

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content,
        images,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: generateId(),
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
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== conversationId) return c;
              const messages = [...c.messages];
              const lastIdx = messages.length - 1;
              messages[lastIdx] = {
                ...messages[lastIdx],
                content: messages[lastIdx].content + chunk,
              };
              return { ...c, messages };
            })
          );
        },
        onNeedsSummarization: (messagesToSummarize) => {
          pendingSummarization = {
            messages: messagesToSummarize,
            existingSummary,
          };
        },
        onError: (error) => {
          console.error('Chat error:', error);

          // Get the last user message for retry functionality
          const currentMessages = conversations.find(c => c.id === conversationId)?.messages || [];
          let lastUserMessage: Message | null = null;
          for (let i = currentMessages.length - 1; i >= 0; i--) {
            if (currentMessages[i].role === 'user') {
              lastUserMessage = currentMessages[i];
              break;
            }
          }

          // Show error toast with retry button
          toast.error(error.message || 'An error occurred', {
            duration: 10000,
            action: lastUserMessage ? {
              label: 'Retry',
              onClick: () => {
                // Use setTimeout to ensure state is updated before retry
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
          setIsLoading(false);
          abortControllerRef.current = null;

          // Store assistant response in memory
          if (conversationId) {
            const currentConv = conversations.find(c => c.id === conversationId);
            const lastMsg = currentConv?.messages[currentConv.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
              import('@/lib/memoryManager').then(({ storeMessage }) => {
                storeMessage(conversationId, lastMsg).catch(() => {});
              });
            }
          }

          if (pendingSummarization && pendingSummarization.messages.length > 0) {
            try {
              toast.info('Summarizing conversation history...', { duration: 2000 });

              const summary = await summarizeMessages({
                config,
                messages: pendingSummarization.messages,
                existingSummary: pendingSummarization.existingSummary,
              });

              // Save summary to memory
              if (conversationId) {
                import('@/lib/memoryManager').then(({ saveConversationSummary }) => {
                  saveConversationSummary(conversationId, summary, Date.now()).catch(() => {});
                });
              }

              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== conversationId) return c;
                  return {
                    ...c,
                    summary,
                    summarizedUpTo: c.messages.length - 5,
                    updatedAt: new Date(),
                  };
                })
              );

              toast.success('Context optimized', { duration: 2000 });
            } catch (error) {
              console.error('Summarization failed:', error);
            }
          }
        },
      });
    },
    [config, activeConversationId, activeConversation, setConversations, setActiveConversationId, navigate]
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

  // Edit a message and regenerate from that point
  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    if (!activeConversation || isLoading) return;

    const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const editedMessage = activeConversation.messages[messageIndex];

    // Only allow editing user messages
    if (editedMessage.role !== 'user') {
      toast.error('Can only edit user messages');
      return;
    }

    // Remove all messages from this point onwards
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

    // Send the edited message
    setTimeout(() => {
      handleSend(newContent, editedMessage.images);
    }, 100);

    toast.info('Regenerating from edited message...');
  }, [activeConversation, activeConversationId, isLoading, setConversations, handleSend]);

  return {
    isLoading,
    abortControllerRef,
    handleSend,
    handleStop,
    handleRegenerate,
    handleEditMessage,
  };
}
