import { memo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="py-6 bg-secondary/30 animate-in fade-in-0 duration-200">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm">
            <AvatarFallback className="text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-blue-600">
              AC
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-medium text-sm mb-1.5 text-foreground">AnikChat</div>
            <div
              className="flex items-center gap-1.5"
              role="status"
              aria-label="Assistant is typing"
            >
              <span className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDuration: '1s' }} />
              <span
                className="w-2 h-2 bg-primary/70 rounded-full animate-bounce"
                style={{ animationDelay: '150ms', animationDuration: '1s' }}
              />
              <span
                className="w-2 h-2 bg-primary/70 rounded-full animate-bounce"
                style={{ animationDelay: '300ms', animationDuration: '1s' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
