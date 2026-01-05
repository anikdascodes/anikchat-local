import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ArrowUp, ImagePlus, X, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  onStop: () => void;
  isLoading: boolean;
  isVisionEnabled: boolean;
}

export interface ChatInputRef {
  focus: () => void;
}

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
    if (isLoading) return;
    if (!input.trim() && images.length === 0) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input, images, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const MAX_IMAGES = 4;

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImages((current) => {
        if (current.length >= MAX_IMAGES) return current;
        return [...current, result];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!isVisionEnabled) return;
      const files = Array.from(e.dataTransfer.files);
      files.forEach(processFile);
    },
    [isVisionEnabled, processFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!isVisionEnabled) return;
      const items = Array.from(e.clipboardData.items);
      items.forEach((item) => {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) processFile(file);
        }
      });
    },
    [isVisionEnabled, processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(processFile);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [processFile]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const canSubmit = input.trim() || images.length > 0;

  return (
    <div className="p-4 border-t border-border bg-background">
      <div className="max-w-3xl mx-auto">
        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex flex-wrap gap-2 flex-1">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`Preview ${idx + 1}`}
                    className="w-14 h-14 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove image ${idx + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {images.length}/{MAX_IMAGES}
            </span>
          </div>
        )}

        {/* Input Container */}
        <div
          className={`relative flex items-end border rounded-2xl bg-background transition-all shadow-sm ${
            isDragging ? 'border-primary ring-2 ring-primary/20' : 'border-border'
          } focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (isVisionEnabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
        >
          {/* Image Upload Button */}
          {isVisionEnabled && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                multiple
                className="hidden"
                aria-label="Upload images"
              />
              <button
                className={`p-3 transition-colors disabled:opacity-40 ${
                  images.length >= MAX_IMAGES 
                    ? 'text-muted-foreground/50 cursor-not-allowed' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => images.length < MAX_IMAGES && fileInputRef.current?.click()}
                disabled={isLoading || images.length >= MAX_IMAGES}
                aria-label={images.length >= MAX_IMAGES ? 'Maximum images reached' : 'Attach image'}
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message..."
            className={`flex-1 resize-none bg-transparent py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none overflow-y-auto scrollbar-thin ${
              isVisionEnabled ? 'pl-0' : 'pl-4'
            }`}
            rows={1}
            disabled={isLoading}
            style={{ minHeight: '44px', maxHeight: '200px' }}
            aria-label="Message input"
          />

          {/* Submit/Stop Button */}
          {isLoading ? (
            <button
              onClick={onStop}
              className="absolute right-2.5 bottom-2.5 p-2 bg-destructive text-destructive-foreground rounded-xl hover:opacity-90 transition-opacity"
              aria-label="Stop generation"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="absolute right-2.5 bottom-2.5 p-2 bg-primary text-primary-foreground rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Helper Text */}
        <p className="text-xs text-muted-foreground/70 mt-2.5 text-center flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">↵</kbd> Send
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono">⇧↵</kbd> New line
          </span>
          {isVisionEnabled && (
            <span className="text-muted-foreground/50">· Paste or drop images</span>
          )}
        </p>
      </div>
    </div>
  );
});
