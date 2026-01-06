import { memo } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface StreamingMessageProps {
    content: string;
}

/**
 * Component for actively streaming content.
 * Uses markdown rendering for consistent appearance during and after streaming.
 * The 50ms buffer in useChat already limits re-renders for performance.
 */
export const StreamingMessage = memo(function StreamingMessage({
    content
}: StreamingMessageProps) {
    return (
        <div className="py-6 bg-secondary/30">
            <div className="max-w-3xl mx-auto px-4">
                <div className="flex gap-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm bg-gradient-to-br from-cyan-500 to-blue-600">
                        AC
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-medium text-sm">AnikChat</span>
                            <span className="text-xs text-muted-foreground animate-pulse">generating...</span>
                        </div>

                        {/* Content - markdown rendered for consistent appearance */}
                        <div className="text-sm leading-relaxed overflow-x-auto">
                            <MarkdownRenderer content={content} />
                            <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

