import { memo } from 'react';

export const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="py-6 bg-secondary/30">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm"
            aria-hidden="true"
          >
            AC
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm mb-1.5 text-foreground">AnikChat</div>
            <div className="flex items-center gap-1.5" aria-label="Assistant is typing">
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-pulse" />
              <span
                className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-primary/60 rounded-full animate-pulse"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
