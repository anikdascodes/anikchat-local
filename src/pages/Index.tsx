import { useRef, useEffect, useCallback, useState } from 'react';
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
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useConversations } from '@/hooks/useConversations';
import { useChat } from '@/hooks/useChat';
import { useFolders } from '@/hooks/useFolders';
import { useConfig } from '@/hooks/useConfig';
import { APIConfig, defaultConfig, hasActiveModel, getActiveProviderAndModel } from '@/types/chat';
import { UI_CONFIG } from '@/constants';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Use virtualization for conversations with many messages
const VIRTUALIZATION_THRESHOLD = 20; // Reduced from 50 for better performance

export default function Index() {
  const navigate = useNavigate();
  const [config, setConfig] = useConfig<APIConfig>(defaultConfig);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('openchat-sidebar-collapsed', false);
  const [searchOpen, setSearchOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputRef>(null);

  // Use conversation management hook
  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    createNewConversation: baseCreateNewConversation,
    deleteConversation,
    handleRename,
    handleExport,
    handleSelectConversation: baseHandleSelectConversation,
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
    streamingContent,
    streamingMessageId,
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
  });

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
    }
  }, [baseHandleSelectConversation]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConversation?.messages]);

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
      handler: () => setSearchOpen(true),
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

  // Check if vision is enabled
  const { model } = getActiveProviderAndModel(config);
  const isVisionEnabled = model?.isVisionModel ?? false;

  return (
    <div className="h-screen flex bg-background">
      {/* Search Modal */}
      <ConversationSearch
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
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
            onSelect={(id) => handleSelectConversation(id)}
            onNew={createNewConversation}
            onDelete={deleteConversation}
            onRename={handleRename}
            onExport={handleExport}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            onSearchOpen={() => setSearchOpen(true)}
            folders={folders}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            onAssignFolder={(convId, folderId) => assignFolder(convId, folderId, setConversations)}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header with Model Selector */}
        <div className="border-b border-border px-4 py-2 flex items-center gap-2 md:gap-4">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>

          {/* Desktop Sidebar Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSidebarCollapsed(prev => !prev)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors hidden md:flex"
                  aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                >
                  {sidebarCollapsed ? (
                    <PanelLeft className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
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
        {activeConversation && activeConversation.messages.length > 0 ? (
          <>
            {activeConversation.messages.length >= VIRTUALIZATION_THRESHOLD ? (
              /* Virtualized list for long conversations */
              <VirtualizedMessageList
                messages={activeConversation.messages}
                isLoading={isLoading}
                onRegenerate={handleRegenerate}
                onEditMessage={handleEditMessage}
              />
            ) : (
              /* Regular list for short conversations */
              <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
                {activeConversation.messages.map((msg, idx) => {
                  const isLastMessage = idx === activeConversation.messages.length - 1;
                  const isLastAssistant = isLastMessage && msg.role === 'assistant';
                  const isLastUserWithNoResponse = isLastMessage && msg.role === 'user';
                  if (isLoading && isLastMessage && msg.role === 'assistant' && msg.content === '') {
                    return null;
                  }
                  return (
                    <div key={msg.id} id={`message-${msg.id}`} className="message-container">
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
                {isLoading &&
                  activeConversation.messages[activeConversation.messages.length - 1]?.content === '' && (
                    <TypingIndicator />
                  )}
              </div>
            )}

            {/* Streaming message - rendered separately for performance */}
            {isLoading && streamingContent && (
              <StreamingMessage content={streamingContent} />
            )}

            <ChatInput
              ref={inputRef}
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              isVisionEnabled={isVisionEnabled}
            />
          </>
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
