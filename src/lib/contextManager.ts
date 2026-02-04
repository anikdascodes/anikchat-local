import { Message } from '@/types/chat';
import { estimateTokens, estimateMessagesTokens, getTokenLimit } from './tokenizer';
import { retrieveRelevantMessages, getConversationSummary } from './memoryManager';
import { CONTEXT_CONFIG } from '@/constants';
import { logger } from './logger';

const {
  SYSTEM_PROMPT_BUDGET,
  SUMMARY_BUDGET,
  RAG_BUDGET,
  RECENT_MESSAGES_BUDGET,
  RESPONSE_RESERVE,
  RECENT_MESSAGES_COUNT,
  RAG_TOP_K,
} = CONTEXT_CONFIG;

interface ContextResult {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; sourceMessageId?: string }>;
  needsSummarization: boolean;
  messagesToSummarize: Message[];
  tokenCount: number;
}

/**
 * Truncate text to approximate token count
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + '...';
}

/**
 * Prepares context with unlimited memory support (RAG)
 */
export async function prepareContextWithMemory(
  conversationId: string,
  messages: Message[],
  systemPrompt: string | undefined,
  modelId: string
): Promise<ContextResult> {
  const tokenLimit = getTokenLimit(modelId) - RESPONSE_RESERVE;
  const apiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; sourceMessageId?: string }> = [];
  let usedTokens = 0;

  // 1. System prompt
  if (systemPrompt?.trim()) {
    const truncatedPrompt = truncateToTokens(systemPrompt.trim(), SYSTEM_PROMPT_BUDGET);
    apiMessages.push({ role: 'system', content: truncatedPrompt });
    usedTokens += estimateTokens(truncatedPrompt);
  }

  // 2. Get conversation summary from memory
  const summary = await getConversationSummary(conversationId);
  if (summary?.summary) {
    const summaryContent = `[Conversation Summary]\n${truncateToTokens(summary.summary, SUMMARY_BUDGET)}\n[End Summary]`;
    apiMessages.push({ role: 'system', content: summaryContent });
    usedTokens += estimateTokens(summaryContent);
  }

  // Split messages: recent vs older
  const recentMessages = messages.slice(-RECENT_MESSAGES_COUNT);
  const recentMessageIds = new Set(recentMessages.map(m => m.id));

  // 3. RAG: Retrieve relevant older messages
  if (messages.length > RECENT_MESSAGES_COUNT) {
    const currentQuery = recentMessages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join(' ');

    if (currentQuery) {
      try {
        const relevantMessages = await retrieveRelevantMessages(
          conversationId,
          currentQuery,
          RAG_TOP_K,
          Array.from(recentMessageIds)
        );

        if (relevantMessages.length > 0) {
          let ragContent = '[Relevant Context from Earlier]\n';
          let ragTokens = 0;

          for (const msg of relevantMessages) {
            const msgTokens = estimateTokens(msg.content);
            if (ragTokens + msgTokens > RAG_BUDGET) break;
            ragContent += `- ${msg.content.slice(0, 300)}${msg.content.length > 300 ? '...' : ''}\n`;
            ragTokens += msgTokens;
          }

          ragContent += '[End Relevant Context]';
          apiMessages.push({ role: 'system', content: ragContent });
          usedTokens += ragTokens;
        }
      } catch (error) {
        logger.debug('RAG retrieval failed:', error);
        // Continue without RAG context
      }
    }
  }

  // 4. Recent messages (verbatim)
  const remainingBudget = tokenLimit - usedTokens;
  let recentTokens = 0;
  const recentToInclude: Message[] = [];

  for (const msg of recentMessages) {
    const msgTokens = estimateTokens(msg.content) + 4;
    if (recentTokens + msgTokens <= Math.min(RECENT_MESSAGES_BUDGET, remainingBudget)) {
      recentToInclude.push(msg);
      recentTokens += msgTokens;
    }
  }

  for (const msg of recentToInclude) {
    apiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content, sourceMessageId: msg.id });
  }
  usedTokens += recentTokens;

  const oldMessages = messages.slice(0, -RECENT_MESSAGES_COUNT);
  const needsSummarization = oldMessages.length > 10 && !summary;

  return {
    messages: apiMessages,
    needsSummarization,
    messagesToSummarize: needsSummarization ? oldMessages : [],
    tokenCount: usedTokens,
  };
}

/**
 * Original prepareContext for backward compatibility
 */
export function prepareContext(
  messages: Message[],
  systemPrompt: string | undefined,
  existingSummary: string | undefined,
  modelId: string
): ContextResult {
  const apiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; sourceMessageId?: string }> = [];

  if (systemPrompt?.trim()) {
    apiMessages.push({ role: 'system', content: systemPrompt.trim() });
  }

  if (existingSummary?.trim()) {
    apiMessages.push({
      role: 'system',
      content: `[Previous conversation summary]\n${existingSummary.trim()}\n[End of summary]`
    });
  }

  const convertedMessages = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    sourceMessageId: msg.id,
  }));

  const allMessages = [...apiMessages, ...convertedMessages];
  const totalTokens = estimateMessagesTokens(allMessages);
  const tokenLimit = getTokenLimit(modelId);

  if (totalTokens <= tokenLimit) {
    return {
      messages: allMessages,
      needsSummarization: false,
      messagesToSummarize: [],
      tokenCount: totalTokens,
    };
  }

  const recentMessages = messages.slice(-RECENT_MESSAGES_COUNT);
  const oldMessages = messages.slice(0, -RECENT_MESSAGES_COUNT);

  const contextMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; sourceMessageId?: string }> = [];

  if (systemPrompt?.trim()) {
    contextMessages.push({ role: 'system', content: systemPrompt.trim() });
  }

  if (existingSummary?.trim()) {
    contextMessages.push({
      role: 'system',
      content: `[Previous conversation summary]\n${existingSummary.trim()}\n[End of summary]`
    });
  }

  for (const msg of recentMessages) {
    contextMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content, sourceMessageId: msg.id });
  }

  return {
    messages: contextMessages,
    needsSummarization: oldMessages.length > 0,
    messagesToSummarize: oldMessages,
    tokenCount: estimateMessagesTokens(contextMessages),
  };
}

/**
 * Creates a prompt for summarization
 */
export function createSummarizationPrompt(messages: Message[], existingSummary?: string): string {
  let conversationText = '';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    conversationText += `${role}: ${msg.content}\n\n`;
  }

  const basePrompt = `Summarize this conversation concisely, preserving:
- Key topics and decisions
- User preferences and requirements
- Important facts and conclusions
- Pending questions or tasks

Keep under 1500 words. Focus on information needed to continue naturally.`;

  if (existingSummary) {
    return `${basePrompt}\n\nPrevious summary:\n${existingSummary}\n\nNew messages:\n${conversationText}\n\nUpdated summary:`;
  }

  return `${basePrompt}\n\nConversation:\n${conversationText}\n\nSummary:`;
}

/**
 * Quick check if summarization might be needed
 */
export function quickNeedsSummarization(messageCount: number): boolean {
  return messageCount > 20;
}
