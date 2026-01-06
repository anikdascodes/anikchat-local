import { Pencil } from 'lucide-react';
import { useState, useMemo, memo, useCallback, useEffect } from 'react';
import { Message } from '@/types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { loadMessageImages, isImageRef } from '@/lib/imageStorage';
import { ImageLightbox, ThinkingBlock, MessageEditor, MessageActions, BranchNavigator } from './chat';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onBranchNavigate?: (messageId: string, branchIndex: number) => void;
  messageIndex?: number;
}

function parseThinkingBlock(content: string): { thinking: string | null; output: string } {
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

      <div className={`py-6 ${isUser ? 'bg-background' : 'bg-secondary/30'} group`}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-4">
            {/* Avatar */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm ${
                isUser ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-cyan-500 to-blue-600'
              }`}
            >
              {isUser ? 'U' : 'AC'}
            </div>

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
                {isUser && onEdit && !isEditing && (
                  <button
                    onClick={startEditing}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded transition-all"
                    aria-label="Edit message"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Images */}
              {loadedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {loadedImages.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Attachment ${idx + 1}`}
                      className="max-w-48 max-h-48 rounded-lg object-cover border border-border cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      onClick={() => setExpandedImage(img)}
                    />
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
                <div className="text-sm leading-relaxed overflow-x-auto">
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
