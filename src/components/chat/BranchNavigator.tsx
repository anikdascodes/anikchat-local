import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo } from 'react';

interface BranchNavigatorProps {
  currentIndex: number;
  totalBranches: number;
  onNavigate: (index: number) => void;
}

export const BranchNavigator = memo(function BranchNavigator({
  currentIndex,
  totalBranches,
  onNavigate,
}: BranchNavigatorProps) {
  if (totalBranches <= 1) return null;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <button
        onClick={() => onNavigate(currentIndex - 1)}
        disabled={currentIndex === 0}
        className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous branch"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[3ch] text-center">
        {currentIndex + 1}/{totalBranches}
      </span>
      <button
        onClick={() => onNavigate(currentIndex + 1)}
        disabled={currentIndex === totalBranches - 1}
        className="p-0.5 hover:bg-muted rounded disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next branch"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});
