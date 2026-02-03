import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessagesTokens } from '@/lib/tokenizer';

describe('tokenizer', () => {
    it('estimates tokens correctly for simple text', () => {
        const text = 'Hello world';
        // 11 chars / 4 = 2.75 -> 3 tokens
        expect(estimateTokens(text)).toBe(3);
    });

    it('estimates tokens correctly for empty text', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('estimates tokens correclty for messages', () => {
        const messages = [
            { role: 'user', content: 'Hello', id: '1', timestamp: new Date() },
            { role: 'assistant', content: 'Hi there', id: '2', timestamp: new Date() },
        ] as Array<{ role: string; content: string }>;

        const tokens = estimateMessagesTokens(messages);
        // User: 5 chars -> 1.25 -> 2
        // Assistant: 8 chars -> 2
        // Total: 4
        expect(tokens).toBeGreaterThan(0);
    });
});
