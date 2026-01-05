import { Copy, Check, ChevronDown, ChevronRight, Brain, RotateCcw, X, Pencil } from 'lucide-react';
import { useState, useMemo, memo, useCallback } from 'react';
import { Message } from '@/types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  message: Message;
  isLast?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  messageIndex?: number;
}

interface ParsedContent {
  thinking: string | null;
  output: string;
}

function parseThinkingBlock(content: string): ParsedContent {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/i;
  const match = content.match(thinkRegex);

  if (match) {
    const thinking = match[1].trim();
    const output = content.replace(thinkRegex, '').trim();
    return { thinking, output };
  }

  const closeTagIndex = content.indexOf('</think>');
  if (closeTagIndex !== -1) {
    const thinking = content.substring(0, closeTagIndex).trim();
    const output = content.substring(closeTagIndex + 8).trim();
    return { thinking, output };
  }

  return { thinking: null, output: content };
}

export const ChatMessage = memo(function ChatMessage({ 
  message, 
  isLast, 
  onRegenerate,
  onEdit,
  messageIndex 
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  
  const isUser = message.role === 'user';

  const { thinking, output } = useMemo(() => {
    if (isUser) return { thinking: null, output: message.content };
    return parseThinkingBlock(message.content);
  }, [message.content, isUser]);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const toggleThinking = useCallback(() => {
    setShowThinking((prev) => !prev);
  }, []);

  const handleImageClick = useCallback((imgSrc: string) => {
    setExpandedImage(imgSrc);
  }, []);

  const handleCloseImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  const startEditing = useCallback(() => {
    setEditContent(message.content);
    setIsEditing(true);
  }, [message.content]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditContent('');
  }, []);

  const saveEdit = useCallback(() => {
    if (onEdit && editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
    setEditContent('');
  }, [onEdit, editContent, message.id, message.content]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEditing();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEdit();
    }
  }, [cancelEditing, saveEdit]);

  return (
    <>
      {/* Image Lightbox Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={handleCloseImage}
        >
          <button
            onClick={handleCloseImage}
            className="absolute top-4 right-4 p-2 rounded-full bg-background/20 hover:bg-background/40 text-white transition-colors"
            aria-label="Close image"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={expandedImage}
            alt="Expanded view"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className={`py-6 ${isUser ? 'bg-background' : 'bg-secondary/30'} group`}>
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-4">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm ${
                isUser
                  ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                  : 'bg-gradient-to-br from-cyan-500 to-blue-600'
              }`}
              aria-hidden="true"
            >
              {isUser ? 'U' : 'AC'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-medium text-sm text-foreground">{isUser ? 'You' : 'AnikChat'}</span>
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

              {/* Uploaded Images */}
              {message.images && message.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {message.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Attachment ${idx + 1}`}
                      className="max-w-48 max-h-48 rounded-lg object-cover border border-border cursor-pointer hover:opacity-90 transition-opacity"
                      loading="lazy"
                      onClick={() => handleImageClick(img)}
                    />
                  ))}
                </div>
              )}

              {/* Thinking Block (Collapsible) */}
              {thinking && (
                <div className="mb-3">
                  <button
                    onClick={toggleThinking}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    aria-expanded={showThinking}
                    aria-label={showThinking ? 'Hide thinking' : 'Show thinking'}
                  >
                    {showThinking ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Brain className="h-4 w-4" />
                    <span>Thinking</span>
                  </button>

                  {showThinking && (
                    <div className="mt-2 p-3 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground overflow-x-auto">
                      <MarkdownRenderer content={thinking} />
                    </div>
                  )}
                </div>
              )}

              {/* Main Message Content */}
              {isUser ? (
                isEditing ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="min-h-[100px] text-sm bg-background border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl resize-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={saveEdit} className="rounded-lg">
                        Save & Submit
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditing} className="rounded-lg">
                        Cancel
                      </Button>
                      <span className="text-xs text-muted-foreground ml-auto">
                        ⌘+Enter to save · Esc to cancel
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                      <span className="w-1 h-1 bg-muted-foreground/50 rounded-full"></span>
                      Editing will regenerate the conversation from this point
                    </p>
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {output}
                  </div>
                )
              ) : (
                <div className="text-sm leading-relaxed overflow-x-auto">
                  <MarkdownRenderer content={output} />
                </div>
              )}

              {/* Action Buttons for Assistant Messages */}
              {!isUser && output && !isEditing && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
                    aria-label="Copy message"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  
                  {/* Regenerate Button - always visible on assistant messages with handler */}
                  {onRegenerate && (
                    <button
                      onClick={onRegenerate}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
                      aria-label="Regenerate response"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
