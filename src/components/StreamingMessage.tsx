import { memo } from 'react';

interface StreamingMessageProps {
    content: string;
}

/**
 * Lightweight component for actively streaming content.
 * Uses plain text rendering instead of markdown for better performance during streaming.
 * The full markdown parsing happens only after streaming completes.
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

                        {/* Content - plain text during streaming for performance */}
                        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {content}
                            <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
