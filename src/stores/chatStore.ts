import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { Conversation, Message, APIConfig, defaultConfig, generateId, generateTitle } from '@/types/chat';
import { storageService } from '@/lib/storageService';
import { logger } from '@/lib/logger';
import { handleStorageError } from '@/lib/errorHandler';

interface ChatState {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  config: APIConfig;

  // Actions
  setConversations: (convs: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  setActiveConversationId: (id: string | null) => void;
  setConfig: (config: APIConfig | ((prev: APIConfig) => APIConfig)) => void;

  // Conversation actions
  createConversation: (title?: string) => string;
  deleteConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateLastMessage: (conversationId: string, content: string) => void;
  removeLastMessage: (conversationId: string) => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial state
        conversations: [],
        activeConversationId: null,
        config: defaultConfig,

        // Setters
        setConversations: (convs) => {
          set((state) => ({
            conversations: typeof convs === 'function' ? convs(state.conversations) : convs,
          }));
          get().saveToStorage();
        },

        setActiveConversationId: (id) => set({ activeConversationId: id }),

        setConfig: (config) => {
          set((state) => ({
            config: typeof config === 'function' ? config(state.config) : config,
          }));
        },

        // Conversation actions
        createConversation: (title) => {
          const id = generateId();
          const newConv: Conversation = {
            id,
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          set((state) => ({
            conversations: [newConv, ...state.conversations],
            activeConversationId: id,
          }));
          get().saveToStorage();
          return id;
        },

        deleteConversation: (id) => {
          set((state) => {
            const newConvs = state.conversations.filter((c) => c.id !== id);
            const newActiveId = state.activeConversationId === id
              ? (newConvs[0]?.id || null)
              : state.activeConversationId;
            return { conversations: newConvs, activeConversationId: newActiveId };
          });
          storageService.deleteConversation(id).catch((error) => {
            logger.debug('Failed to delete conversation from storage:', error);
          });
          get().saveToStorage();
        },

        updateConversation: (id, updates) => {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c
            ),
          }));
          get().saveToStorage();
        },

        addMessage: (conversationId, message) => {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messages: [...c.messages, message], updatedAt: new Date() }
                : c
            ),
          }));
        },

        updateLastMessage: (conversationId, content) => {
          set((state) => ({
            conversations: state.conversations.map((c) => {
              if (c.id !== conversationId) return c;
              const messages = [...c.messages];
              if (messages.length > 0) {
                messages[messages.length - 1] = {
                  ...messages[messages.length - 1],
                  content,
                };
              }
              return { ...c, messages };
            }),
          }));
        },

        removeLastMessage: (conversationId) => {
          set((state) => ({
            conversations: state.conversations.map((c) => {
              if (c.id !== conversationId) return c;
              const messages = c.messages;
              if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !messages[messages.length - 1].content) {
                return { ...c, messages: messages.slice(0, -1) };
              }
              return c;
            }),
          }));
        },

        // Persistence
        loadFromStorage: async () => {
          try {
            const ids = await storageService.listConversations();
            const convs: Conversation[] = [];
            for (const id of ids) {
              const conv = await storageService.getConversation<Conversation>(id);
              if (conv) convs.push(conv);
            }
            convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            set({ conversations: convs });
          } catch (e) {
            handleStorageError(e, 'chatStore.loadFromStorage');
          }
        },

        saveToStorage: async () => {
          const { conversations } = get();
          for (const conv of conversations) {
            await storageService.saveConversation(conv.id, conv).catch((error) => {
              logger.debug('Failed to save conversation to storage:', error);
            });
          }
        },
      }),
      {
        name: 'anikchat-store',
        partialize: (state) => ({ 
          config: state.config,
          activeConversationId: state.activeConversationId
        }),
      }
    )
  )
);

// Selectors with memoization
export const useActiveConversation = () =>
  useChatStore((state) =>
    state.conversations.find((c) => c.id === state.activeConversationId)
  );

export const useConversationById = (id: string | null) =>
  useChatStore((state) =>
    id ? state.conversations.find((c) => c.id === id) : undefined
  );

export const useConfig = () => useChatStore(state => state.config);
