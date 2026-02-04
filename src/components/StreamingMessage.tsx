import { memo, useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useStreamingStore } from '@/stores/streamingStore';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StreamingMessageProps {
    content?: string;
}

/**
 * SlowResponseIndicator - Shows when response is taking time
 * Provides visual feedback to user during slow API responses
 */
const SlowResponseIndicator = memo(function SlowResponseIndicator() {
    const [showSlow, setShowSlow] = useState(false);
    const startTimeRef = useRef<number | null>(null);
    const hasShownSlowRef = useRef(false);

    useEffect(() => {
        let timeout: number | null = null;

        const unsub = useStreamingStore.subscribe(
            state => state.streamingContent,
            (content) => {
                if (!startTimeRef.current && content === '') {
                    startTimeRef.current = Date.now();
                    // Show slow indicator after 2 seconds
                    timeout = window.setTimeout(() => {
                        if (!hasShownSlowRef.current) {
                            setShowSlow(true);
                            hasShownSlowRef.current = true;
                        }
                    }, 2000);
                } else if (content.length > 0) {
                    // If content started coming, reset slow indicator
                    if (timeout) window.clearTimeout(timeout);
                    hasShownSlowRef.current = false;
                    setShowSlow(false);
                }
            }
        );

        return () => {
            if (timeout) window.clearTimeout(timeout);
            unsub();
        };
    }, []);

    return (
        <Badge variant="secondary" className={cn(
            "text-[10px] font-normal gap-1.5 px-2 py-0.5",
            "bg-primary/10 text-primary border-primary/20"
        )}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {showSlow ? 'thinking...' : 'generating...'}
        </Badge>
    );
});

/**
 * Component for actively streaming content.
 * Uses markdown rendering for consistent appearance during and after streaming.
 * It can either take content as a prop or read it from global chat store.
 */
const StreamingContent = memo(function StreamingContent() {
    const [content, setContent] = useState('');
    const lastRenderTimeRef = useRef(Date.now());
    const startTimeRef = useRef<number | null>(null);
    const chunkCountRef = useRef(0);

    // Performance Optimization: Decouple store updates from React renders
    // Adaptive rendering based on response speed for smooth UX
    useEffect(() => {
        let lastUpdate = 0;
        let timeout: number | null = null;
        let pendingContent = '';

        const unsub = useStreamingStore.subscribe(
            state => state.streamingContent,
            (newContent) => {
                // Track response speed
                if (!startTimeRef.current) {
                    startTimeRef.current = Date.now();
                }
                chunkCountRef.current++;

                pendingContent = newContent;
                const now = Date.now();
                const timeSinceLast = now - lastUpdate;
                const elapsed = now - (startTimeRef.current || now);

                // Adaptive throttle based on response speed
                // Fast responses: 60ms (16fps) for smooth animation
                // Slow responses: 150ms (6fps) to reduce re-renders
                const isFastResponse = elapsed < 2000 && chunkCountRef.current > 3;
                const throttleDelay = isFastResponse ? 60 : 150;

                if (timeSinceLast >= throttleDelay) {
                    setContent(newContent);
                    lastUpdate = now;
                    if (timeout) {
                        window.clearTimeout(timeout);
                        timeout = null;
                    }
                } else if (!timeout) {
                    timeout = window.setTimeout(() => {
                        setContent(pendingContent);
                        lastUpdate = Date.now();
                        timeout = null;
                    }, throttleDelay - timeSinceLast);
                }
            }
        );

        return () => {
            unsub();
            if (timeout) window.clearTimeout(timeout);
        };
    }, []);

    // #region agent log
    useEffect(() => {
        if (content) {
            const now = Date.now();
            const duration = now - lastRenderTimeRef.current;
            lastRenderTimeRef.current = now;
            window.debugLog?.('StreamingContent render', {
                len: content.length,
                msSinceLast: duration
            }, 'B');
        }
    }, [content]);
    // #endregion

    if (!content) return null;

    return (
        <div className="text-sm leading-relaxed overflow-x-auto">
            <MarkdownRenderer content={content} isStreaming />
            <span className="inline-block w-2 h-4 bg-primary/80 rounded-sm animate-pulse ml-0.5 align-middle" />
        </div>
    );
});

export const StreamingMessage = memo(function StreamingMessage({
    content: propContent
}: StreamingMessageProps) {
    // If content is passed as prop, use it directly (short conversation mode)
    if (propContent) {
        return (
            <div className="py-6 bg-secondary/30 animate-in fade-in-0 duration-200">
                <div className="max-w-3xl mx-auto px-4">
                    <div className="flex gap-4">
                        <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm">
                            <AvatarFallback className="text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-blue-600">
                                AC
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-medium text-sm">AnikChat</span>
                                <Badge variant="secondary" className="text-[10px] font-normal gap-1.5 px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    generating...
                                </Badge>
                            </div>
                            <div className="text-sm leading-relaxed overflow-x-auto">
                                <MarkdownRenderer content={propContent} isStreaming />
                                <span className="inline-block w-2 h-4 bg-primary/80 rounded-sm animate-pulse ml-0.5 align-middle" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Otherwise use store subscription (long conversation mode)
    return (
        <div className="py-6 bg-secondary/30 animate-in fade-in-0 duration-200">
            <div className="max-w-3xl mx-auto px-4">
                <div className="flex gap-4">
                    {/* Avatar using shadcn */}
                    <Avatar className="h-8 w-8 shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm">
                        <AvatarFallback className="text-xs font-bold text-white bg-gradient-to-br from-cyan-500 to-blue-600">
                            AC
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-medium text-sm">AnikChat</span>
                            <SlowResponseIndicator />
                        </div>

                        {/* Content - subscribes to store directly to avoid parent re-renders */}
                        <StreamingContent />
                    </div>
                </div>
            </div>
        </div>
    );
});
