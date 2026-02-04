import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

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
    <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border/50">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-md"
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Previous version</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span className="min-w-[3ch] text-center text-xs text-muted-foreground font-medium tabular-nums">
        {currentIndex + 1}/{totalBranches}
      </span>

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-md"
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={currentIndex === totalBranches - 1}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Next version</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
