import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ArrowUp, ImagePlus, X, Square, Loader2 } from 'lucide-react';
import { sanitizeInput } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  onStop: () => void;
  isLoading: boolean;
  isVisionEnabled: boolean;
}

export interface ChatInputRef {
  focus: () => void;
}

const MAX_IMAGES = 4;

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput(
  { onSend, onStop, isLoading, isVisionEnabled },
  ref
) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const maxHeight = 200;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [input]);

  const handleSubmit = useCallback(() => {
    const trimmed = sanitizeInput(input.trim());
    if (!trimmed && images.length === 0) return;

    onSend(trimmed, images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
  }, [input, images, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isLoading) handleSubmit();
      }
    },
    [handleSubmit, isLoading]
  );

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, result];
        });
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!isVisionEnabled) return;
      const files = Array.from(e.dataTransfer.files);
      files.slice(0, MAX_IMAGES - images.length).forEach(processFile);
    },
    [isVisionEnabled, images.length, processFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!isVisionEnabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processFile(file);
          break;
        }
      }
    },
    [isVisionEnabled, processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        Array.from(files)
          .slice(0, MAX_IMAGES - images.length)
          .forEach(processFile);
      }
      e.target.value = '';
    },
    [processFile, images.length]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const canSubmit = input.trim() || images.length > 0;

  return (
    <div className="p-4 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto">
        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex items-center gap-2 mb-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
            <div className="flex flex-wrap gap-2 flex-1">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`Preview ${idx + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-border shadow-sm"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    onClick={() => removeImage(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 bg-muted px-2 py-1 rounded-full">
              {images.length}/{MAX_IMAGES}
            </span>
          </div>
        )}

        {/* Input Container */}
        <div
          className={cn(
            "relative flex items-end border rounded-2xl bg-background transition-all duration-200 shadow-sm",
            isDragging && "border-primary ring-2 ring-primary/20 bg-primary/5",
            !isDragging && "border-border hover:border-border/80",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
          )}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (isVisionEnabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
        >
          {/* Image Upload Button */}
          {isVisionEnabled && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "ml-2 mb-2 h-9 w-9 rounded-xl transition-colors",
                        images.length >= MAX_IMAGES && "opacity-40 cursor-not-allowed"
                      )}
                      disabled={images.length >= MAX_IMAGES}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-5 w-5" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {images.length >= MAX_IMAGES ? 'Max images reached' : 'Attach image'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Text Input - Using native textarea for better control */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message..."
            rows={1}
            disabled={isLoading}
            className={cn(
              "flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-3.5 text-sm",
              "placeholder:text-muted-foreground/60 max-h-[200px] min-h-[52px]",
              isVisionEnabled ? "pl-1 pr-3" : "pl-4 pr-3"
            )}
          />

          {/* Submit/Stop Button */}
          <div className="pr-2 pb-2">
            {isLoading ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                      onClick={onStop}
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Stop generation</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className={cn(
                        "h-10 w-10 rounded-xl transition-all",
                        canSubmit
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      )}
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Send message <kbd className="ml-1 text-[10px] opacity-60">↵</kbd>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Helper Text */}
        <div className="flex items-center justify-center gap-4 mt-2.5 text-xs text-muted-foreground/60">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border border-border/50">Enter</kbd>
            <span>send</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border border-border/50">Shift+Enter</kbd>
            <span>new line</span>
          </span>
          {isVisionEnabled && (
            <span className="text-muted-foreground/50">· Paste or drop images</span>
          )}
        </div>
      </div>
    </div>
  );
});
