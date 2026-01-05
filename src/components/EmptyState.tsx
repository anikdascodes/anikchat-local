import { memo, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

interface EmptyStateProps {
  hasApiKey: boolean;
}

export const EmptyState = memo(forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState({ hasApiKey }, ref) {
    const navigate = useNavigate();

    return (
      <div ref={ref} className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 shadow-sm">
            <MessageSquare className="h-8 w-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">AnikChat</h1>
            <p className="text-muted-foreground">
              Your intelligent AI chat assistant
            </p>
          </div>

          {!hasApiKey ? (
            <button
              onClick={() => navigate('/settings')}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
            >
              Configure API
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-left text-sm">
              <div className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/20 transition-colors">
                <p className="font-medium mb-1 text-foreground">Any Provider</p>
                <p className="text-xs text-muted-foreground">
                  OpenAI, Anthropic, local models...
                </p>
              </div>
              <div className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/20 transition-colors">
                <p className="font-medium mb-1 text-foreground">Full Markdown</p>
                <p className="text-xs text-muted-foreground">
                  Code, math, tables, and more
                </p>
              </div>
              <div className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/20 transition-colors">
                <p className="font-medium mb-1 text-foreground">Vision Support</p>
                <p className="text-xs text-muted-foreground">
                  Upload and analyze images
                </p>
              </div>
              <div className="p-4 rounded-xl bg-secondary/50 border border-border hover:border-primary/20 transition-colors">
                <p className="font-medium mb-1 text-foreground">Private</p>
                <p className="text-xs text-muted-foreground">
                  Keys stored locally only
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground/60 flex items-center justify-center gap-2">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⌘,</kbd> to open settings
          </p>
        </div>
      </div>
    );
  }
));
