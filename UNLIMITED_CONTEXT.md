# Unlimited Context Window System

## Overview

AnikChat now supports **unlimited context** through a hybrid memory management system that combines:

1. **IndexedDB Storage** - All messages stored permanently, never lost
2. **Vector Embeddings (RAG)** - Semantic search to retrieve relevant past messages
3. **Hierarchical Summarization** - Compress old context into summaries
4. **Smart Token Budgeting** - Automatically fits within any model's context limit

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTEXT PREPARATION                       │
├─────────────────────────────────────────────────────────────┤
│  1. System Prompt (500 tokens)                              │
│  2. Conversation Summary (1500 tokens)                      │
│  3. RAG: Retrieved Relevant Messages (4000 tokens)          │
│  4. Recent Messages - Last 6 verbatim (4000 tokens)         │
│  5. Response Reserve (4000 tokens)                          │
└─────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### New Files
- `src/lib/memoryManager.ts` - Core memory system with IndexedDB + embeddings

### Modified Files
- `src/lib/contextManager.ts` - Added `prepareContextWithMemory()` for RAG
- `src/lib/api.ts` - Integrated memory storage on send/receive
- `src/lib/tokenizer.ts` - Expanded model token limits
- `src/hooks/useChat.ts` - Pass conversationId for memory tracking
- `src/App.tsx` - Preload embedding model on startup
- `src/components/TokenTracker.tsx` - Memory status indicator

## How It Works

### On Each Message Send:
1. User message stored in IndexedDB
2. Embedding generated and stored for future RAG
3. Context prepared:
   - Fetch conversation summary (if exists)
   - RAG: Search for semantically relevant past messages
   - Include last 6 messages verbatim
4. API call made with optimized context

### On Response Complete:
1. Assistant response stored in IndexedDB
2. Embedding generated for assistant message
3. If conversation is long, trigger summarization
4. Summary saved to memory

### When Switching Models:
- Context automatically adjusts to new model's token limit
- RAG retrieves same relevant context
- No conversation history lost

## Token Limits Supported

| Model | Context Limit |
|-------|---------------|
| Gemini 2.5 Pro | 2M tokens |
| Gemini 1.5 Pro/Flash | 1M tokens |
| Claude 3.x | 200K tokens |
| GPT-4 Turbo/4o | 128K tokens |
| Llama 3.x | 128K tokens |
| DeepSeek | 64K tokens |
| Default | 32K tokens |

## UI Indicators

- **Green Brain Icon** in token tracker = Unlimited context active
- Hover for details on memory status

## Dependencies Added

- `client-vector-search` - Browser-side embeddings (~30MB model, loaded lazily)

## Performance Notes

- Embedding model loads asynchronously on first use
- IndexedDB operations are non-blocking
- RAG search is fast (cosine similarity on cached embeddings)
- Falls back gracefully if embeddings unavailable
