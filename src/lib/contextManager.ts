import { Message } from '@/types/chat';
import { estimateTokens, estimateMessagesTokens, getTokenLimit } from './tokenizer';
import {
  retrieveRelevantMessages,
  getConversationSummary,
} from './memoryManager';

// Token budget allocation
const SYSTEM_PROMPT_BUDGET = 500;
const SUMMARY_BUDGET = 1500;
const RAG_BUDGET = 4000;
const RECENT_MESSAGES_BUDGET = 4000;
const RESPONSE_RESERVE = 4000;

const RECENT_MESSAGES_COUNT = 6; // Keep last 6 messages verbatim
const RAG_TOP_K = 5; // Retrieve top 5 relevant messages

interface ContextResult {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  needsSummarization: boolean;
  messagesToSummarize: Message[];
  tokenCount: number;
}

/**
 * Prepares context with unlimited memory support
 * 
 * Structure:
 * 1. System prompt (fixed)
 * 2. Conversation summary (compressed history)
 * 3. Retrieved relevant messages (RAG)
 * 4. Recent messages (verbatim)
 * 5. Current message
 */
export async function prepareContextWithMemory(
  conversationId: string,
  messages: Message[],
  systemPrompt: string | undefined,
  modelId: string
): Promise<ContextResult> {
  const tokenLimit = getTokenLimit(modelId) - RESPONSE_RESERVE;
  const apiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
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
      } catch (e) {
        console.warn('RAG retrieval failed:', e);
      }
    }
  }

  // 4. Recent messages (verbatim)
  const remainingBudget = tokenLimit - usedTokens;
  let recentTokens = 0;
  const recentToInclude: Message[] = [];

  // Add recent messages from oldest to newest, respecting budget
  for (const msg of recentMessages) {
    const msgTokens = estimateTokens(msg.content) + 4; // +4 for role overhead
    if (recentTokens + msgTokens <= Math.min(RECENT_MESSAGES_BUDGET, remainingBudget)) {
      recentToInclude.push(msg);
      recentTokens += msgTokens;
    }
  }

  for (const msg of recentToInclude) {
    apiMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }
  usedTokens += recentTokens;

  // Determine if summarization is needed
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
  const apiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

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

  // Over limit: keep recent, flag for summarization
  const recentMessages = messages.slice(-RECENT_MESSAGES_COUNT);
  const oldMessages = messages.slice(0, -RECENT_MESSAGES_COUNT);

  const contextMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

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
    contextMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
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
export function createSummarizationPrompt(
  messages: Message[],
  existingSummary?: string
): string {
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
 * Truncate text to approximate token count
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Approximate: 4 chars per token
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + '...';
}

/**
 * Quick check if summarization might be needed
 */
export function quickNeedsSummarization(messageCount: number): boolean {
  return messageCount > 20;
}
