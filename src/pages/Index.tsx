import { useRef, useEffect, useCallback, useState, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeft, Menu } from 'lucide-react';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { ChatMessage } from '@/components/ChatMessage';
import { ChatInput, ChatInputRef } from '@/components/ChatInput';
import { TypingIndicator } from '@/components/TypingIndicator';
import { VirtualizedMessageList } from '@/components/VirtualizedMessageList';
import { EmptyState } from '@/components/EmptyState';
import { ModelSelector } from '@/components/ModelSelector';
import { ConversationSearch } from '@/components/ConversationSearch';
import { TokenTracker } from '@/components/TokenTracker';
import { StreamingMessage } from '@/components/StreamingMessage';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useConversations } from '@/hooks/useConversations';
import { useChat } from '@/hooks/useChat';
import { useFolders } from '@/hooks/useFolders';
import { useConfig } from '@/hooks/useConfig';
import { APIConfig, defaultConfig, hasActiveModel, getActiveProviderAndModel, Message } from '@/types/chat';
import { useStreamingStore } from '@/stores/streamingStore';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Use virtualization for conversations with many messages
const VIRTUALIZATION_THRESHOLD = 30; // Increased from 10 - virtualization overhead can be higher for small lists

// Memoized Message List to prevent re-renders during streaming
const StaticMessageList = memo(({
  messages,
  isLoading,
  handleRegenerate,
  handleEditMessage,
  handleBranchNavigate
}: {
  messages: Message[],
  isLoading: boolean,
  handleRegenerate: () => void,
  handleEditMessage: (messageId: string, newContent: string) => void,
  handleBranchNavigate: (messageId: string, branchIndex: number) => void
}) => {
  return (
    <>
      {messages.map((msg, idx) => {
        const isLastMessage = idx === messages.length - 1;
        const isLastAssistant = isLastMessage && msg.role === 'assistant';
        const isLastUserWithNoResponse = isLastMessage && msg.role === 'user';

        // Skip empty assistant message during streaming
        if (isLoading && isLastMessage && msg.role === 'assistant' && msg.content === '') {
          return null;
        }

        return (
          <div key={msg.id} id={`message-${msg.id}`} className="message-container" style={{ contentVisibility: 'auto' }}>
            <ChatMessage
              message={msg}
              isLast={(isLastAssistant || isLastUserWithNoResponse) && !isLoading}
              onRegenerate={(isLastAssistant || isLastUserWithNoResponse) && !isLoading ? handleRegenerate : undefined}
              onEdit={msg.role === 'user' && !isLoading ? handleEditMessage : undefined}
              onBranchNavigate={handleBranchNavigate}
              messageIndex={idx}
            />
          </div>
        );
      })}
    </>
  );
});

// #region agent log
let indexRenderCount = 0;
// #endregion

export default function Index() {
  // #region agent log
  indexRenderCount++;
  const lastRenderTimeRef = useRef(Date.now());
  // Optimization: use primitive boolean selector to prevent re-renders on every chunk
  const hasStreamingContent = useStreamingStore(state => !!state.streamingContent);

  useEffect(() => {
    const now = Date.now();
    const diff = now - lastRenderTimeRef.current;
    lastRenderTimeRef.current = now;

    if (indexRenderCount % 10 === 0) {
      window.debugLog?.('Index RENDER details', {
        count: indexRenderCount,
        msSinceLast: diff,
        hasStreaming: hasStreamingContent
      }, 'A');
    }
  }, [indexRenderCount, hasStreamingContent]);
  // #endregion
  const navigate = useNavigate();
  const [config, setConfig] = useConfig<APIConfig>(defaultConfig);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('openchat-sidebar-collapsed', false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Memoize isVisionEnabled to avoid recalculation on every render (especially during streaming)
  const isVisionEnabled = useMemo(() => {
    const { model } = getActiveProviderAndModel(config);
    return model?.isVisionModel ?? false;
  }, [config]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputRef>(null);
  const isLoadingRef = useRef(false);
  const wasLoadingRef = useRef(false);

  // Use conversation management hook
  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    draftConversation,
    createNewConversation: baseCreateNewConversation,
    deleteConversation,
    handleRename,
    handleExport,
    handleSelectConversation: baseHandleSelectConversation,
    convertDraftToConversation,
  } = useConversations();

  // Use folder management hook
  const {
    folders,
    createFolder,
    deleteFolder,
    assignFolder,
  } = useFolders();

  // Use chat hook
  const {
    isLoading,
    handleSend,
    handleStop,
    handleRegenerate,
    handleEditMessage,
    handleBranchNavigate,
  } = useChat({
    config,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    draftConversation,
    convertDraftToConversation,
  });

  // Use primitive selector to get only what's needed for scrolling to avoid frequent re-renders
  const hasStreamingContentForScroll = useStreamingStore(state => !!state.streamingContent);

  // Wrap handlers to also close sidebar
  const createNewConversation = useCallback(() => {
    baseCreateNewConversation();
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [baseCreateNewConversation]);

  const handleSelectConversation = useCallback((id: string, messageId?: string) => {
    baseHandleSelectConversation(id);
    setSidebarOpen(false);

    // Scroll to specific message if messageId provided
    if (messageId) {
      setTimeout(() => {
        const messageEl = document.getElementById(`message-${messageId}`);
        messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      // Auto-scroll to bottom when selecting conversation from history
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 150);
    }
  }, [baseHandleSelectConversation]);

  const handleSidebarToggle = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleSearchOpen = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleAssignFolder = useCallback((convId: string, folderId: string | null) => {
    assignFolder(convId, folderId, setConversations);
  }, [assignFolder, setConversations]);

  // Ref to track if user has manually scrolled away
  const userScrolledAwayRef = useRef(false);
  const isInitialScrollDoneRef = useRef(false);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Reset scroll tracking when conversation changes
  useEffect(() => {
    userScrolledAwayRef.current = false;
    isInitialScrollDoneRef.current = false;
  }, [activeConversationId]);

  // Auto-scroll during streaming - uses refs to avoid dependency issues
  useEffect(() => {
    if (!scrollRef.current) return;

    const el = scrollRef.current;

    // Track when user manually scrolls up
    const handleUserScroll = () => {
      if (!isLoadingRef.current || !isInitialScrollDoneRef.current) return;
      
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledAwayRef.current = distanceFromBottom > 200;
      if (distanceFromBottom < 50) {
        userScrolledAwayRef.current = false;
      }
    };

    el.addEventListener('scroll', handleUserScroll, { passive: true });

    // Initial scroll when streaming starts
    if (isLoadingRef.current) {
      isInitialScrollDoneRef.current = false;
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => {
        if (scrollAnchorRef.current) {
          scrollAnchorRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else {
          el.scrollTop = el.scrollHeight;
        }
        isInitialScrollDoneRef.current = true;
      });
    }

    return () => {
      el.removeEventListener('scroll', handleUserScroll);
    };
  }, [isLoading, activeConversationId]);

  // Fallback: direct subscription to streaming content to ensure auto-scroll stays reliable
  useEffect(() => {
    const unsub = useStreamingStore.subscribe(
      state => state.streamingContent,
      () => {
        if (!isLoadingRef.current || userScrolledAwayRef.current) return;
        requestAnimationFrame(() => {
          if (scrollAnchorRef.current) {
            scrollAnchorRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
            isInitialScrollDoneRef.current = true;
            return;
          }
          const el = scrollRef.current;
          if (!el) return;
          el.scrollTop = el.scrollHeight;
          isInitialScrollDoneRef.current = true;
        });
      }
    );
    return () => unsub();
  }, []);

  // Consolidated scroll effect for non-streaming changes
  useEffect(() => {
    if (!scrollAnchorRef.current || hasStreamingContentForScroll) return;

    // Smooth scroll to bottom when messages change or loading stops
    scrollAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversation?.messages?.length, hasStreamingContentForScroll, activeConversationId, isLoading]);

  // Scroll to bottom when streaming completes (delay for DOM update)
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = isLoading;

    if (wasLoading && !isLoading) {
      const timer = window.setTimeout(() => {
        if (userScrolledAwayRef.current) return;
        scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 50);

      return () => window.clearTimeout(timer);
    }
  }, [isLoading]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'n',
      ctrl: true,
      handler: () => createNewConversation(),
    },
    {
      key: ',',
      ctrl: true,
      handler: () => navigate('/settings'),
    },
    {
      key: 'k',
      ctrl: true,
      handler: handleSearchOpen,
    },
    {
      key: 'b',
      ctrl: true,
      handler: () => setSidebarCollapsed(prev => !prev),
    },
    {
      key: '/',
      handler: () => {
        // Only focus if not already in an input
        if (document.activeElement?.tagName !== 'TEXTAREA' &&
          document.activeElement?.tagName !== 'INPUT') {
          inputRef.current?.focus();
        }
      },
    },
  ]);

  return (
    <div className="h-screen flex bg-background">
      {/* Search Modal */}
      <ConversationSearch
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        isOpen={searchOpen}
        onClose={handleSearchClose}
      />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed overlay on mobile, collapsible on desktop */}
      <div className={`
        h-full transition-all duration-300 ease-out flex-shrink-0 overflow-hidden
        ${sidebarCollapsed ? 'md:w-0' : 'md:w-64'}
      `}>
        <div className={`
          fixed md:relative inset-y-0 left-0 z-50
          h-full w-72 md:w-64
          transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarCollapsed ? 'md:-translate-x-full' : 'md:translate-x-0'}
        `}>
          <ConversationSidebar
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onNew={createNewConversation}
            onDelete={deleteConversation}
            onRename={handleRename}
            onExport={handleExport}
            isOpen={sidebarOpen}
            onToggle={handleSidebarToggle}
            onSearchOpen={handleSearchOpen}
            folders={folders}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            onAssignFolder={handleAssignFolder}
            isStreaming={isLoading}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header with Model Selector */}
        <div className="border-b border-border px-4 py-2 flex items-center gap-2 md:gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </Button>

          {/* Desktop Sidebar Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(prev => !prev)}
                  className="hidden md:flex"
                  aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeft className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} (⌘B)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex-1" />

          <ModelSelector
            config={config}
            disabled={isLoading}
            onModelChange={(providerId, modelId) => {
              setConfig(prev => ({
                ...prev,
                activeProviderId: providerId,
                activeModelId: modelId,
              }));
              toast.success('Model switched - next message will use new model');
            }}
          />

          {/* Token Tracker (compact) */}
          {activeConversation && activeConversation.messages.length > 0 && (
            <TokenTracker conversation={activeConversation} compact />
          )}
        </div>

        {/* Chat Content */}
        {activeConversation ? (
          activeConversation.messages.length > 0 ? (
            <>
              {activeConversation.messages.length >= VIRTUALIZATION_THRESHOLD ? (
                /* Virtualized list for long conversations */
                <VirtualizedMessageList
                  messages={activeConversation.messages}
                  isLoading={isLoading}
                  onRegenerate={handleRegenerate}
                  onEditMessage={handleEditMessage}
                  conversationId={activeConversationId}
                />
              ) : (
                /* Regular list for short conversations */
                <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
                  <StaticMessageList
                    messages={activeConversation.messages}
                    isLoading={isLoading}
                    handleRegenerate={handleRegenerate}
                    handleEditMessage={handleEditMessage}
                    handleBranchNavigate={handleBranchNavigate}
                  />
                  {/* Show streaming message only when actively streaming and last message is empty */}
                  {isLoading && hasStreamingContent &&
                    activeConversation.messages[activeConversation.messages.length - 1]?.content === '' && (
                      <StreamingMessage />
                    )}
                  {/* Show typing indicator when waiting for first chunk */}
                  {isLoading && !hasStreamingContent &&
                    activeConversation.messages[activeConversation.messages.length - 1]?.content === '' && (
                      <TypingIndicator />
                    )}
                  {/* Scroll anchor - always at the bottom for reliable auto-scroll */}
                  <div ref={scrollAnchorRef} className="h-0" aria-hidden="true" />
                </div>
              )}


              <ChatInput
                ref={inputRef}
                onSend={handleSend}
                onStop={handleStop}
                isLoading={isLoading}
                isVisionEnabled={isVisionEnabled}
              />
            </>
          ) : activeConversation.isSkeleton ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading messages...</div>
            </div>
          ) : (
            <>
              <EmptyState hasApiKey={hasActiveModel(config)} />
              <ChatInput
                ref={inputRef}
                onSend={handleSend}
                onStop={handleStop}
                isLoading={isLoading}
                isVisionEnabled={isVisionEnabled}
              />
            </>
          )
        ) : (
          <>
            <EmptyState hasApiKey={hasActiveModel(config)} />
            <ChatInput
              ref={inputRef}
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              isVisionEnabled={isVisionEnabled}
            />
          </>
        )}
      </main>
    </div>
  );
}
