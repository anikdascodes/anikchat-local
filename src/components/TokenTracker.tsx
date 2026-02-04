import { useMemo, memo, useState, useEffect } from 'react';
import { Coins, TrendingUp, MessageSquare, Brain } from 'lucide-react';
import { Conversation, TokenUsage } from '@/types/chat';
import { estimateTokens } from '@/lib/tokenizer';
import { logger } from '@/lib/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Cost per 1M tokens (approximate, varies by model)
const COST_RATES = {
  input: 0.15,  // $0.15 per 1M input tokens (average)
  output: 0.60, // $0.60 per 1M output tokens (average)
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

interface TokenTrackerProps {
  conversation?: Conversation;
  allConversations?: Conversation[];
  showTotal?: boolean;
  compact?: boolean;
}

export const TokenTracker = memo(function TokenTracker({
  conversation,
  allConversations,
  showTotal = false,
  compact = false,
}: TokenTrackerProps) {
  const [memoryActive, setMemoryActive] = useState(false);

  // Check if memory/embedding model is loaded
  useEffect(() => {
    import('@/lib/memoryManager').then(({ isEmbeddingModelLoaded }) => {
      setMemoryActive(isEmbeddingModelLoaded());
    }).catch((error) => {
      logger.debug('Failed to load memory manager:', error);
    });
    
    // Recheck periodically
    const interval = setInterval(() => {
      import('@/lib/memoryManager').then(({ isEmbeddingModelLoaded }) => {
        setMemoryActive(isEmbeddingModelLoaded());
      }).catch((error) => {
        logger.debug('Failed to refresh memory manager status:', error);
      });
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    if (showTotal && allConversations) {
      // Calculate total across all conversations
      let totalPrompt = 0;
      let totalCompletion = 0;
      let totalMessages = 0;

      for (const conv of allConversations) {
        for (const msg of conv.messages) {
          const tokens = msg.tokenCount || estimateTokens(msg.content);
          if (msg.role === 'user') {
            totalPrompt += tokens;
          } else if (msg.role === 'assistant') {
            totalCompletion += tokens;
          }
          totalMessages++;
        }
      }

      const estimatedCost = 
        (totalPrompt / 1000000) * COST_RATES.input +
        (totalCompletion / 1000000) * COST_RATES.output;

      return {
        promptTokens: totalPrompt,
        completionTokens: totalCompletion,
        totalTokens: totalPrompt + totalCompletion,
        estimatedCost,
        messageCount: totalMessages,
        conversationCount: allConversations.length,
      };
    } else if (conversation) {
      // Calculate for single conversation
      let promptTokens = 0;
      let completionTokens = 0;

      for (const msg of conversation.messages) {
        const tokens = msg.tokenCount || estimateTokens(msg.content);
        if (msg.role === 'user') {
          promptTokens += tokens;
        } else if (msg.role === 'assistant') {
          completionTokens += tokens;
        }
      }

      const estimatedCost = 
        (promptTokens / 1000000) * COST_RATES.input +
        (completionTokens / 1000000) * COST_RATES.output;

      return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost,
        messageCount: conversation.messages.length,
        conversationCount: 1,
      };
    }

    return null;
  }, [conversation, allConversations, showTotal]);

  if (!stats) return null;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-md cursor-help">
              {memoryActive && (
                <Brain className="h-3 w-3 text-green-500" />
              )}
              <Coins className="h-3 w-3" />
              <span>{formatNumber(stats.totalTokens)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-3">
            <div className="space-y-1.5 text-xs">
              {memoryActive && (
                <div className="flex items-center gap-1.5 text-green-500 pb-1.5 border-b border-border mb-1.5">
                  <Brain className="h-3 w-3" />
                  <span>Unlimited Context Active</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Input:</span>
                <span>{formatNumber(stats.promptTokens)} tokens</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Output:</span>
                <span>{formatNumber(stats.completionTokens)} tokens</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between gap-4">
                <span className="text-muted-foreground">Est. Cost:</span>
                <span className="font-medium">{formatCost(stats.estimatedCost)}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="p-4 bg-card border border-border rounded-lg space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TrendingUp className="h-4 w-4 text-primary" />
        {showTotal ? 'Total Usage' : 'Conversation Usage'}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Input Tokens</div>
          <div className="text-lg font-semibold">{formatNumber(stats.promptTokens)}</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Output Tokens</div>
          <div className="text-lg font-semibold">{formatNumber(stats.completionTokens)}</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Total Tokens</div>
          <div className="text-lg font-semibold">{formatNumber(stats.totalTokens)}</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-xs text-muted-foreground mb-1">Est. Cost</div>
          <div className="text-lg font-semibold text-primary">{formatCost(stats.estimatedCost)}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {stats.messageCount} messages
        </div>
        {showTotal && (
          <div>{stats.conversationCount} conversations</div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/70">
        * Cost estimates are approximate and vary by model
      </p>
    </div>
  );
});
