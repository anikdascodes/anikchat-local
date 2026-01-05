import { APIConfig, Message, getActiveProviderAndModel } from '@/types/chat';
import { prepareContext, prepareContextWithMemory, createSummarizationPrompt } from './contextManager';
import { getImageFormatConfig, getProviderKey } from './providerUtils';
import { storeMessage, saveConversationSummary } from './memoryManager';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: string } }>;
  images?: string[];  // For Ollama format
}

export interface StreamOptions {
  config: APIConfig;
  messages: Message[];
  conversationId?: string;
  existingSummary?: string;
  onChunk: (chunk: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onNeedsSummarization?: (messagesToSummarize: Message[]) => void;
  signal?: AbortSignal;
}

/**
 * Parse API errors and return user-friendly messages
 */
function parseAPIError(status: number, errorData: Record<string, unknown>, providerName: string): string {
  const errorMessage = (errorData.error as Record<string, unknown>)?.message as string || '';
  const errorCode = (errorData.error as Record<string, unknown>)?.code as string || '';
  const errorType = (errorData.error as Record<string, unknown>)?.type as string || '';

  switch (status) {
    case 400:
      if (errorMessage.toLowerCase().includes('model')) {
        return `Model not found or not available. Please check the model ID in settings.`;
      }
      return `Invalid request: ${errorMessage || 'Please check your configuration.'}`;

    case 401:
      return `Authentication failed for ${providerName}. Please check your API key in settings.`;

    case 402:
      return `Payment required. Your ${providerName} account may have run out of credits. Please check your billing.`;

    case 403:
      return `Access denied. Your API key may not have permission to use this model.`;

    case 404:
      if (errorMessage.toLowerCase().includes('model') || errorCode === 'model_not_found') {
        return `Model not found. The model ID may be incorrect or the model is not available for your account.`;
      }
      if (errorMessage.toLowerCase().includes('vision') || errorMessage.toLowerCase().includes('image')) {
        return `This model may not support vision/images. Please try a vision-enabled model like GPT-4o or Claude 3.`;
      }
      return `API endpoint not found. Please verify the base URL in settings (should end with /v1 for OpenRouter).`;

    case 429:
      return `Rate limit exceeded. Please wait a moment before sending another message.`;

    case 500:
    case 502:
    case 503:
      return `${providerName} server error. The service may be temporarily unavailable. Please try again later.`;

    case 504:
      return `${providerName} gateway timeout. The service is taking too long to respond.`;

    default:
      if (errorType === 'insufficient_quota' || errorMessage.toLowerCase().includes('quota')) {
        return `Quota exceeded. Your ${providerName} account has run out of credits.`;
      }
      if (errorMessage.toLowerCase().includes('context') || errorMessage.toLowerCase().includes('token')) {
        return `Context length exceeded. Try starting a new conversation or reducing message length.`;
      }
      return errorMessage || `API Error (${status}): Something went wrong. Please try again.`;
  }
}

export interface SummarizeOptions {
  config: APIConfig;
  messages: Message[];
  existingSummary?: string;
  signal?: AbortSignal;
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const { config, messages, conversationId, existingSummary, onChunk, onError, onComplete, onNeedsSummarization, signal } = options;

  const { provider, model } = getActiveProviderAndModel(config);

  if (!provider || !model) {
    onError(new Error('No active model configured. Please select a model in settings.'));
    return;
  }

  // Use memory-enhanced context if conversationId provided
  let contextResult;
  if (conversationId) {
    try {
      contextResult = await prepareContextWithMemory(conversationId, messages, config.systemPrompt, model.modelId);
      // Store messages in memory for future RAG
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        storeMessage(conversationId, lastMsg).catch(() => {});
      }
    } catch {
      // Fallback to basic context
      contextResult = prepareContext(messages, config.systemPrompt, existingSummary, model.modelId);
    }
  } else {
    contextResult = prepareContext(messages, config.systemPrompt, existingSummary, model.modelId);
  }

  if (contextResult.needsSummarization && onNeedsSummarization) {
    onNeedsSummarization(contextResult.messagesToSummarize);
  }

  const apiMessages: ChatMessage[] = [];
  const imageFormatConfig = getImageFormatConfig(provider.baseUrl);
  const providerKey = getProviderKey(provider.baseUrl);

  for (const msg of contextResult.messages) {
    const originalMsg = messages.find((m) => m.content === msg.content);
    const hasImages = originalMsg?.images && originalMsg.images.length > 0;

    if (hasImages) {
      // Always try to send images - let the API decide if it supports them
      // This allows users to use newer vision models we don't know about yet
      if (!model.isVisionModel) {
        console.warn(`Model "${model.modelId}" is not marked as vision-capable, but images were attached. Attempting to send anyway.`);
      }

      // Ollama uses a separate 'images' array instead of content parts
      if (providerKey === 'ollama') {
        // Extract base64 data from data URLs for Ollama
        const base64Images = originalMsg.images!.map(img => {
          if (img.startsWith('data:')) {
            return img.split(',')[1];  // Remove data:image/...;base64, prefix
          }
          return img;
        });

        apiMessages.push({
          role: msg.role,
          content: msg.content,
          images: base64Images,
        });
      } else {
        // OpenAI-compatible format with image_url
        const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: string } }> = [
          { type: 'text' as const, text: msg.content },
        ];

        for (const img of originalMsg.images!) {
          if (imageFormatConfig.supportsDetailParam) {
            contentParts.push({
              type: 'image_url' as const,
              image_url: { url: img, detail: 'auto' },
            });
          } else {
            contentParts.push({
              type: 'image_url' as const,
              image_url: { url: img },
            });
          }
        }

        apiMessages.push({
          role: msg.role,
          content: contentParts,
        });
      }
    } else {
      apiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const isOpenRouter = baseUrl.includes('openrouter.ai');
  const isSambaNova = baseUrl.includes('sambanova.ai');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  // Check if this request has images (for SambaNova token limit)
  const hasImagesInRequest = apiMessages.some(msg =>
    Array.isArray(msg.content) && msg.content.some(part => part.type === 'image_url')
  );

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization header if API key exists (skip for local providers)
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    // OpenRouter requires additional headers
    if (isOpenRouter) {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'AnikChat';
    }

    // Build the request body
    const requestBody: Record<string, unknown> = {
      model: model.modelId,
      messages: apiMessages,
      temperature: config.temperature,
      stream: true,
    };

    // SambaNova vision models have specific requirements:
    // - Max tokens limited to 4K for vision models
    // - Don't support frequency_penalty, presence_penalty, top_p
    if (isSambaNova && hasImagesInRequest) {
      requestBody.max_tokens = Math.min(config.maxTokens, 4000);
    } else if (isSambaNova) {
      // SambaNova text models - still limit some params
      requestBody.max_tokens = config.maxTokens;
      requestBody.top_p = config.topP;
    } else {
      // Other providers support all parameters
      requestBody.max_tokens = config.maxTokens;
      requestBody.top_p = config.topP;
      requestBody.frequency_penalty = config.frequencyPenalty;
      requestBody.presence_penalty = config.presencePenalty;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(parseAPIError(response.status, errorData, provider.name));
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body received from the API');

    const decoder = new TextDecoder();
    let buffer = '';
    let hasReceivedContent = false;
    const CHUNK_TIMEOUT = 30000; // 30 seconds timeout between chunks

    // Helper function to read with timeout
    const readWithTimeout = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reader.cancel();
          reject(new Error('CHUNK_TIMEOUT'));
        }, CHUNK_TIMEOUT);

        reader.read().then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        }).catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    };

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;

      try {
        readResult = await readWithTimeout();
      } catch (timeoutError) {
        if (timeoutError instanceof Error && timeoutError.message === 'CHUNK_TIMEOUT') {
          if (hasReceivedContent) {
            // Partial response received but stream stalled
            onChunk('\n\n[Response stopped - the AI model stopped responding. The partial response is shown above.]');
            onComplete();
            return;
          } else {
            throw new Error('The AI model is not responding. This could be due to high server load or network issues. Please try again.');
          }
        }
        throw timeoutError;
      }

      const { done, value } = readResult;

      if (done) {
        // Stream ended - check if it was premature
        if (!hasReceivedContent) {
          throw new Error('The AI model returned an empty response. This might be a temporary issue - please try again.');
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          onComplete();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error.message || 'Stream error occurred');
          }

          // Check for finish reason indicating the model stopped
          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'length') {
            // Model hit max tokens
            onChunk('\n\n[Response truncated - max tokens reached. Try adjusting max tokens in settings.]');
          } else if (finishReason === 'content_filter') {
            onChunk('\n\n[Response filtered due to content policy]');
          }

          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            hasReceivedContent = true;
            onChunk(content);
          }
        } catch (parseError) {
          if (parseError instanceof SyntaxError) continue;
          throw parseError;
        }
      }
    }

    // Handle any remaining buffer content
    if (buffer.trim() && buffer.startsWith('data: ')) {
      const data = buffer.slice(6).trim();
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // Ignore partial data at end
        }
      }
    }

    onComplete();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        if (!signal?.aborted) {
          onError(new Error('Request timed out. The AI model is taking too long to respond.'));
        } else {
          onComplete();
        }
        return;
      }

      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        onError(new Error(`Unable to connect to ${provider.name}. Please check your internet connection.`));
        return;
      }

      onError(error);
    } else {
      onError(new Error('An unexpected error occurred. Please try again.'));
    }
  }
}

/**
 * Summarize messages using the active LLM
 */
export async function summarizeMessages({
  config,
  messages,
  existingSummary,
  signal,
}: SummarizeOptions): Promise<string> {
  const { provider, model } = getActiveProviderAndModel(config);

  if (!provider || !model) {
    throw new Error('No active model configured');
  }

  const prompt = createSummarizationPrompt(messages, existingSummary);
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.modelId,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that creates concise, informative summaries of conversations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(parseAPIError(response.status, errorData, provider.name));
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Summarization timed out');
    }
    throw error;
  }
}
