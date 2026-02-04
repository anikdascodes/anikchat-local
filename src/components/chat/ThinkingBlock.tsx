import { memo } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  thinking: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export const ThinkingBlock = memo(function ThinkingBlock({ thinking, isExpanded, onToggle }: ThinkingBlockProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle} className="mb-3">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-2 text-muted-foreground hover:text-foreground px-2",
            isExpanded && "text-foreground"
          )}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Brain className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Thinking</span>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
        <div className="mt-2 p-4 bg-muted/50 border border-border rounded-xl text-sm text-muted-foreground overflow-x-auto">
          <MarkdownRenderer content={thinking} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});
