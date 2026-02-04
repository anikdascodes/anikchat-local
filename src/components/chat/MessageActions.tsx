import { Copy, Check, RotateCcw } from 'lucide-react';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
  content: string;
  onRegenerate?: () => void;
}

export function MessageActions({ content, onRegenerate }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              className={cn(
                "h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-all",
                copied && "text-green-500 hover:text-green-600"
              )}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Copy to clipboard</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {onRegenerate && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Regenerate</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Generate a new response</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
