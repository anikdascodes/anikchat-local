import { memo, useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useStreamingStore } from '@/stores/streamingStore';

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

    if (!showSlow) {
        return <span className="text-xs text-muted-foreground animate-pulse">generating...</span>;
    }

    return (
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="animate-pulse">generating...</span>
            <span className="text-xs text-muted-foreground/70">(thinking...)</span>
        </span>
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
            <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
        </div>
    );
});

export const StreamingMessage = memo(function StreamingMessage({
    content: propContent
}: StreamingMessageProps) {
    // If content is passed as prop, use it directly (short conversation mode)
    if (propContent) {
        return (
            <div className="py-6 bg-secondary/30">
                <div className="max-w-3xl mx-auto px-4">
                    <div className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm bg-gradient-to-br from-cyan-500 to-blue-600">
                            AC
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-medium text-sm">AnikChat</span>
                                <span className="text-xs text-muted-foreground animate-pulse">generating...</span>
                            </div>
                            <div className="text-sm leading-relaxed overflow-x-auto">
                                <MarkdownRenderer content={propContent} isStreaming />
                                <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 align-middle" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Otherwise use store subscription (long conversation mode)
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
