import { memo, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Cpu, Image, Lock, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  hasApiKey: boolean;
}

const features = [
  {
    icon: Cpu,
    title: 'Any Provider',
    description: 'OpenAI, Anthropic, local models...',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: MessageSquare,
    title: 'Full Markdown',
    description: 'Code, math, tables, and more',
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    icon: Image,
    title: 'Vision Support',
    description: 'Upload and analyze images',
    gradient: 'from-emerald-500 to-green-600',
  },
  {
    icon: Lock,
    title: 'Private',
    description: 'Keys stored locally only',
    gradient: 'from-orange-500 to-amber-600',
  },
];

export const EmptyState = memo(forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState({ hasApiKey }, ref) {
    const navigate = useNavigate();

    return (
      <div ref={ref} className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
          {/* Logo */}
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 flex items-center justify-center border border-primary/10 shadow-lg shadow-primary/5">
            <MessageSquare className="h-10 w-10 text-primary" />
          </div>

          {/* Title */}
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              AnikChat
            </h1>
            <p className="text-muted-foreground text-lg">
              Your intelligent AI chat assistant
            </p>
          </div>

          {!hasApiKey ? (
            <div className="space-y-4 animate-in fade-in-0 duration-300 delay-150">
              <p className="text-sm text-muted-foreground">
                Configure your API key to get started
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/settings')}
                className="gap-2 px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
              >
                <Settings className="h-4 w-4" />
                Configure API
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-left animate-in fade-in-0 duration-300 delay-150">
              {features.map((feature, idx) => (
                <Card
                  key={feature.title}
                  className={cn(
                    "border-border/50 bg-card/50 hover:bg-card/80 hover:border-primary/20 transition-all duration-300",
                    "hover:shadow-lg hover:shadow-primary/5 cursor-default group animate-in fade-in-0 slide-in-from-bottom-2"
                  )}
                  style={{ animationDelay: `${idx * 75}ms` }}
                >
                  <CardContent className="p-4">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110",
                      `bg-gradient-to-br ${feature.gradient}`
                    )}>
                      <feature.icon className="h-4 w-4 text-white" />
                    </div>
                    <p className="font-medium text-sm mb-0.5">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Keyboard Shortcut Hint */}
          <p className="text-xs text-muted-foreground/50 flex items-center justify-center gap-2 animate-in fade-in-0 duration-500 delay-300">
            Press
            <kbd className="px-2 py-1 bg-muted rounded-md text-[10px] font-mono border border-border/50 shadow-sm">
              ⌘ ,
            </kbd>
            to open settings
          </p>
        </div>
      </div>
    );
  }
));
