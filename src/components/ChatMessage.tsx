import { Pencil } from 'lucide-react';
import { useState, useMemo, memo, useCallback, useEffect } from 'react';
import { Message } from '@/types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { loadMessageImages, isImageRef } from '@/lib/imageStorage';
import { ImageLightbox, ThinkingBlock, MessageEditor, MessageActions, BranchNavigator } from './chat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onBranchNavigate?: (messageId: string, branchIndex: number) => void;
  messageIndex?: number;
}

function parseThinkingBlock(content: string): { thinking: string | null; output: string } {
  if (!content.includes('<think>') && !content.includes('</think>')) {
    return { thinking: null, output: content };
  }

  const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
  const match = content.match(thinkRegex);

  if (match) {
    return { thinking: match[1].trim(), output: content.replace(thinkRegex, '').trim() };
  }

  const closeTagIndex = content.indexOf('</think>');
  if (closeTagIndex !== -1) {
    return { thinking: content.substring(0, closeTagIndex).trim(), output: content.substring(closeTagIndex + 8).trim() };
  }

  return { thinking: null, output: content };
}

export const ChatMessage = memo(function ChatMessage({
  message,
  onRegenerate,
  onEdit,
  onBranchNavigate,
}: ChatMessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const isUser = message.role === 'user';

  // Load images from refs
  useEffect(() => {
    if (message.images?.length) {
      const hasRefs = message.images.some(isImageRef);
      if (hasRefs) {
        loadMessageImages(message.images).then(setLoadedImages);
      } else {
        setLoadedImages(message.images);
      }
    } else {
      setLoadedImages([]);
    }
  }, [message.images]);

  const { thinking, output } = useMemo(() => {
    return isUser ? { thinking: null, output: message.content } : parseThinkingBlock(message.content);
  }, [message.content, isUser]);

  const startEditing = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const saveEdit = useCallback(() => {
    if (onEdit && editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  }, [onEdit, editContent, message.id, message.content]);

  return (
    <>
      {expandedImage && <ImageLightbox src={expandedImage} onClose={() => setExpandedImage(null)} />}

      <div
        className={cn(
          "py-6 group transition-colors",
          isUser ? "bg-background" : "bg-secondary/30"
        )}
      >
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-4">
            {/* Avatar using shadcn Avatar */}
            <Avatar className={cn(
              "h-8 w-8 shrink-0 shadow-sm",
              isUser
                ? "bg-gradient-to-br from-violet-500 to-purple-600"
                : "bg-gradient-to-br from-cyan-500 to-blue-600"
            )}>
              <AvatarFallback
                className={cn(
                  "text-xs font-bold text-white",
                  isUser
                    ? "bg-gradient-to-br from-violet-500 to-purple-600"
                    : "bg-gradient-to-br from-cyan-500 to-blue-600"
                )}
              >
                {isUser ? 'U' : 'AC'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-medium text-sm">{isUser ? 'You' : 'AnikChat'}</span>

                {/* Branch Navigator */}
                {message.totalSiblings && message.totalSiblings > 1 && onBranchNavigate && (
                  <BranchNavigator
                    currentIndex={message.siblingIndex || 0}
                    totalBranches={message.totalSiblings}
                    onNavigate={(index) => onBranchNavigate(message.id, index)}
                  />
                )}

                {/* Edit Button */}
                {isUser && onEdit && !isEditing && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={startEditing}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Edit message</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Images */}
              {loadedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {loadedImages.map((img, idx) => (
                    <Button
                      key={idx}
                      variant="ghost"
                      className="p-0 h-auto w-auto focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg transition-transform hover:scale-[1.02]"
                      onClick={() => setExpandedImage(img)}
                    >
                      <img
                        src={img}
                        alt={`Attachment ${idx + 1}`}
                        className="max-w-48 max-h-48 rounded-lg object-cover border border-border shadow-sm hover:shadow-md transition-shadow"
                        loading="lazy"
                      />
                    </Button>
                  ))}
                </div>
              )}

              {/* Thinking Block */}
              {thinking && (
                <ThinkingBlock
                  thinking={thinking}
                  isExpanded={showThinking}
                  onToggle={() => setShowThinking(prev => !prev)}
                />
              )}

              {/* Content */}
              {isUser ? (
                isEditing ? (
                  <MessageEditor
                    content={editContent}
                    onChange={setEditContent}
                    onSave={saveEdit}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{output}</div>
                )
              ) : (
                <div className="text-sm leading-relaxed overflow-x-auto prose-sm prose-neutral dark:prose-invert max-w-none">
                  <MarkdownRenderer content={output} />
                </div>
              )}

              {/* Actions */}
              {!isUser && output && !isEditing && (
                <MessageActions content={output} onRegenerate={onRegenerate} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
