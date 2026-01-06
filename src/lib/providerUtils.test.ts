import { describe, it, expect } from 'vitest';
import {
    detectProviderType,
    getProviderKey,
    isKnownVisionModel,
    getImageFormatConfig
} from '@/lib/providerUtils';

describe('providerUtils', () => {
    describe('detectProviderType', () => {
        it('detects Ollama from port', () => {
            expect(detectProviderType('http://localhost:11434/v1')).toBe('ollama');
        });

        it('detects Ollama from name', () => {
            expect(detectProviderType('http://my-ollama-server.com/api')).toBe('ollama');
        });

        it('detects Anthropic', () => {
            expect(detectProviderType('https://api.anthropic.com/v1')).toBe('anthropic');
        });

        it('defaults to openai for OpenRouter', () => {
            expect(detectProviderType('https://openrouter.ai/api/v1')).toBe('openai');
        });

        it('defaults to openai for unknown providers', () => {
            expect(detectProviderType('https://api.example.com/v1')).toBe('openai');
        });
    });

    describe('getProviderKey', () => {
        it('identifies OpenAI', () => {
            expect(getProviderKey('https://api.openai.com/v1')).toBe('openai');
        });

        it('identifies Groq', () => {
            expect(getProviderKey('https://api.groq.com/openai/v1')).toBe('groq');
        });

        it('identifies SambaNova', () => {
            expect(getProviderKey('https://api.sambanova.ai/v1')).toBe('sambanova');
        });

        it('identifies Ollama', () => {
            expect(getProviderKey('http://localhost:11434/v1')).toBe('ollama');
        });

        it('returns custom for unknown', () => {
            expect(getProviderKey('https://my-custom-llm.com/api')).toBe('custom');
        });
    });

    describe('isKnownVisionModel', () => {
        it('detects GPT-4o as vision model', () => {
            expect(isKnownVisionModel('gpt-4o', 'https://api.openai.com/v1')).toBe(true);
        });

        it('detects LLaVA as vision model for Ollama', () => {
            expect(isKnownVisionModel('llava:7b', 'http://localhost:11434/v1')).toBe(true);
        });

        it('returns false for non-vision model', () => {
            expect(isKnownVisionModel('gpt-3.5-turbo', 'https://api.openai.com/v1')).toBe(false);
        });
    });

    describe('getImageFormatConfig', () => {
        it('returns Ollama config with ollama format', () => {
            const config = getImageFormatConfig('http://localhost:11434/v1');
            expect(config.format).toBe('ollama');
            expect(config.supportsUrlImages).toBe(false);
        });

        it('returns SambaNova config without detail param', () => {
            const config = getImageFormatConfig('https://api.sambanova.ai/v1');
            expect(config.format).toBe('openai');
            expect(config.supportsDetailParam).toBe(false);
        });

        it('returns OpenAI config with detail param', () => {
            const config = getImageFormatConfig('https://api.openai.com/v1');
            expect(config.format).toBe('openai');
            expect(config.supportsDetailParam).toBe(true);
        });
    });
});
