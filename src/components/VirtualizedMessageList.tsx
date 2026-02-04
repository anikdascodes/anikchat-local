import { useRef, useEffect, memo, useState, useMemo } from 'react';
import { List, useDynamicRowHeight } from 'react-window';
import type { RowComponentProps } from 'react-window';
import { Message } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { StreamingMessage } from './StreamingMessage';
import { useStreamingStore } from '@/stores/streamingStore';

interface VirtualizedMessageListProps {
  messages: Message[];
  isLoading: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  conversationId?: string;
}

interface RowData {
  messages: Message[];
  isLoading: boolean;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
}

// Row component for react-window v2
const MessageRow = memo(function MessageRow({
  index,
  style,
  messages,
  isLoading,
  onRegenerate,
  onEditMessage
}: RowComponentProps<RowData>) {
  const msg = messages[index];
  if (!msg) return null;

  const isLastMessage = index === messages.length - 1;
  const isLastAssistant = isLastMessage && msg.role === 'assistant';
  const isLastUserWithNoResponse = isLastMessage && msg.role === 'user';

  // Skip empty assistant message while loading - we show StreamingMessage instead
  if (isLoading && isLastMessage && msg.role === 'assistant' && msg.content === '') {
    return <div style={style} />;
  }

  return (
    <div style={{ ...style, contentVisibility: 'auto' }} id={`message-${msg.id}`} className="message-container overflow-hidden">
      <ChatMessage
        message={msg}
        isLast={(isLastAssistant || isLastUserWithNoResponse) && !isLoading}
        onRegenerate={(isLastAssistant || isLastUserWithNoResponse) && !isLoading ? onRegenerate : undefined}
        onEdit={msg.role === 'user' && !isLoading ? onEditMessage : undefined}
        messageIndex={index}
      />
    </div>
  );
}, (prev, next) => {
  return prev.index === next.index &&
    prev.style.top === next.style.top &&
    prev.style.height === next.style.height &&
    prev.isLoading === next.isLoading &&
    prev.messages[prev.index]?.content === next.messages[next.index]?.content;
});

export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  isLoading,
  onRegenerate,
  onEditMessage,
  conversationId,
}: VirtualizedMessageListProps) {
  const hasStreamingContent = useStreamingStore(state => !!state.streamingContent);
  const listRef = useRef<List<RowData>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStreamScrollRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isLoadingRef = useRef(isLoading);
  const messageCountRef = useRef(messages.length);
  const userScrolledAwayRef = useRef(false);

  // Dynamic row heights
  const dynamicRowHeight = useDynamicRowHeight({
    estimatedRowHeight: 120,
  });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    userScrolledAwayRef.current = false;
  }, [conversationId]);

  // Auto-scroll to bottom on new messages or conversation switch
  useEffect(() => {
    if (messages.length > 0 && listRef.current) {
      listRef.current.scrollToRow(messages.length - 1);
    }
  }, [messages.length, conversationId]);

  // Scroll during streaming - use MutationObserver for reliable scrolling
  useEffect(() => {
    if (!isLoading || !listRef.current) return;

    const list = listRef.current as unknown as { _outerRef?: HTMLElement };
    // Capture outerRef at effect start to ensure we clean up the same element
    const outerRef = list._outerRef;

    // Immediately scroll to bottom when streaming starts
    listRef.current.scrollToRow(messageCountRef.current - 1);

    // Track user scroll events
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      // User is considered scrolling away if more than 200px from bottom
      userScrolledAwayRef.current = distanceFromBottom > 200;
      if (distanceFromBottom < 50) {
        userScrolledAwayRef.current = false;
      }
    };

    if (outerRef) {
      outerRef.addEventListener('scroll', handleScroll, { passive: true });
    }

    // Use MutationObserver to detect content changes and scroll
    const observer = new MutationObserver(() => {
      if (!listRef.current || userScrolledAwayRef.current) return;
      requestAnimationFrame(() => {
        const count = messageCountRef.current;
        listRef.current?.scrollToRow(Math.max(0, count - 1));
      });
    });

    // Observe the container if it exists
    if (outerRef) {
      observer.observe(outerRef, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // Backup interval in case MutationObserver misses updates
    const backupInterval = setInterval(() => {
      if (!listRef.current || userScrolledAwayRef.current) return;
      if (outerRef) {
        const distanceFromBottom = outerRef.scrollHeight - outerRef.scrollTop - outerRef.clientHeight;
        if (distanceFromBottom > 10) {
          const count = messageCountRef.current;
          listRef.current.scrollToRow(Math.max(0, count - 1));
        }
      }
    }, 100);

    return () => {
      observer.disconnect();
      clearInterval(backupInterval);
      if (outerRef) {
        outerRef.removeEventListener('scroll', handleScroll);
      }
    };
  }, [isLoading, messages.length]);

  // Fallback: subscribe to streaming content so auto-scroll keeps up with chunk updates
  useEffect(() => {
    const unsub = useStreamingStore.subscribe(
      state => state.streamingContent,
      () => {
        if (!isLoadingRef.current || userScrolledAwayRef.current) return;
        const count = messageCountRef.current;
        if (count > 0) {
          requestAnimationFrame(() => {
            listRef.current?.scrollToRow(count - 1);
          });
        }
      }
    );
    return () => unsub();
  }, []);

  // Scroll when streaming completes
  useEffect(() => {
    if (!isLoading && messages.length > 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToRow(messages.length - 1);
      }, 50);
    }
  }, [isLoading, messages.length]);

  // Show typing indicator when waiting for first chunk
  const showTyping = isLoading && !hasStreamingContent && messages[messages.length - 1]?.content === '';

  // Memoize rowProps to prevent re-renders when other props don't change
  const rowProps = useMemo(() => ({
    messages,
    isLoading,
    onRegenerate,
    onEditMessage,
  }), [messages, isLoading, onRegenerate, onEditMessage]);

  // Memoize height to avoid re-renders of the List when streamingContent updates but stays non-empty
  const listHeight = useMemo(() => {
    const streamingOffset = (isLoading && hasStreamingContent) ? 150 : 0;
    const typingOffset = showTyping ? 60 : 0;
    return dimensions.height - streamingOffset - typingOffset;
  }, [dimensions.height, isLoading, !!hasStreamingContent, showTyping]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      {dimensions.height > 0 && (
        <List
          ref={listRef}
          height={listHeight}
          width={dimensions.width}
          rowCount={messages.length}
          rowHeight={dynamicRowHeight}
          rowComponent={MessageRow}
          rowProps={rowProps}
          className="scrollbar-thin"
        />
      )}
      {/* Streaming message - shown separately from virtualized list */}
      {isLoading && hasStreamingContent && (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border">
          <StreamingMessage />
        </div>
      )}
      {/* Typing indicator when waiting for first chunk */}
      {showTyping && (
        <div className="absolute bottom-0 left-0 right-0 bg-background">
          <TypingIndicator />
        </div>
      )}
    </div>
  );
});
