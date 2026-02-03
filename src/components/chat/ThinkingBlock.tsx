import { memo } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface ThinkingBlockProps {
  thinking: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export const ThinkingBlock = memo(function ThinkingBlock({ thinking, isExpanded, onToggle }: ThinkingBlockProps) {
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Hide thinking' : 'Show thinking'}
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Brain className="h-4 w-4" />
        <span>Thinking</span>
      </button>

      {isExpanded && (
        <div className="mt-2 p-3 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground overflow-x-auto">
          <MarkdownRenderer content={thinking} />
        </div>
      )}
    </div>
  );
});
