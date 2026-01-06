import { useRef, useEffect, memo, useState } from 'react';
import { List, useDynamicRowHeight } from 'react-window';
import type { RowComponentProps } from 'react-window';
import { Message } from '@/types/chat';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { StreamingMessage } from './StreamingMessage';

interface VirtualizedMessageListProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent?: string;
  onRegenerate?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
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
    <div style={style} id={`message-${msg.id}`} className="message-container">
      <ChatMessage
        message={msg}
        isLast={(isLastAssistant || isLastUserWithNoResponse) && !isLoading}
        onRegenerate={(isLastAssistant || isLastUserWithNoResponse) && !isLoading ? onRegenerate : undefined}
        onEdit={msg.role === 'user' && !isLoading ? onEditMessage : undefined}
        messageIndex={index}
      />
    </div>
  );
});

export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  isLoading,
  streamingContent,
  onRegenerate,
  onEditMessage,
}: VirtualizedMessageListProps) {
  const listRef = useRef<List<RowData>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && listRef.current) {
      listRef.current.scrollToRow(messages.length - 1);
    }
  }, [messages.length]);

  // Scroll during streaming
  useEffect(() => {
    if (isLoading && streamingContent && listRef.current) {
      listRef.current.scrollToRow(messages.length - 1);
    }
  }, [streamingContent, isLoading, messages.length]);

  // Scroll when streaming completes
  useEffect(() => {
    if (!isLoading && messages.length > 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToRow(messages.length - 1);
      }, 100);
    }
  }, [isLoading, messages.length]);

  // Show typing indicator when waiting for first chunk
  const showTyping = isLoading && !streamingContent && messages[messages.length - 1]?.content === '';

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      {dimensions.height > 0 && (
        <List
          ref={listRef}
          height={dimensions.height - (isLoading && streamingContent ? 150 : 0) - (showTyping ? 60 : 0)}
          width={dimensions.width}
          rowCount={messages.length}
          rowHeight={dynamicRowHeight}
          rowComponent={MessageRow}
          rowProps={{
            messages,
            isLoading,
            onRegenerate,
            onEditMessage,
          }}
          className="scrollbar-thin"
        />
      )}
      {/* Streaming message - shown separately from virtualized list */}
      {isLoading && streamingContent && (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border">
          <StreamingMessage content={streamingContent} />
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
