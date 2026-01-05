import { ProviderType } from '@/types/chat';

/**
 * Vision-capable models by provider
 * Used to auto-detect if a model supports images
 */
export const VISION_MODELS: Record<string, string[]> = {
    openai: [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview',
        'gpt-4-turbo-2024-04-09', 'gpt-4-1106-vision-preview'
    ],
    anthropic: [
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
        'claude-3.5-sonnet', 'claude-3-5-sonnet', 'claude-3.5-haiku',
        'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'
    ],
    google: [
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash',
        'gemini-pro-vision', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'
    ],
    ollama: [
        'llava', 'llava:7b', 'llava:13b', 'llava:34b',
        'bakllava', 'llava-llama3', 'llava-phi3',
        'moondream', 'minicpm-v'
    ],
    groq: [
        'llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview',
        'llama-guard-3-11b-vision'
    ],
    mistral: [
        'pixtral-12b-2409', 'pixtral-12b', 'pixtral-large-latest',
        'mistral-small-3.1-24b-instruct'
    ],
    together: [
        'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
        'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo'
    ],
    sambanova: [
        'Llama-3.2-11B-Vision-Instruct', 'Llama-3.2-90B-Vision-Instruct'
    ],
    openrouter: [], // OpenRouter uses underlying model names
    deepseek: [],
    fireworks: ['firellava-13b'],
    perplexity: [],
};

/**
 * Detect provider type from base URL
 */
export function detectProviderType(baseUrl: string): ProviderType {
    const url = baseUrl.toLowerCase();

    // Ollama detection
    if (url.includes('ollama') || url.includes(':11434')) {
        return 'ollama';
    }

    // Anthropic detection
    if (url.includes('anthropic.com')) {
        return 'anthropic';
    }

    // Native Google (non-OpenAI wrapper)
    if (url.includes('generativelanguage.googleapis.com') && !url.includes('/openai')) {
        return 'google-native';
    }

    // All others are OpenAI-compatible
    return 'openai';
}

/**
 * Get the provider key for vision model lookup
 */
export function getProviderKey(baseUrl: string): string {
    const url = baseUrl.toLowerCase();

    if (url.includes('openai.com')) return 'openai';
    if (url.includes('anthropic.com')) return 'anthropic';
    if (url.includes('googleapis.com')) return 'google';
    if (url.includes('ollama') || url.includes(':11434')) return 'ollama';
    if (url.includes('groq.com')) return 'groq';
    if (url.includes('mistral.ai')) return 'mistral';
    if (url.includes('together.xyz') || url.includes('together.ai')) return 'together';
    if (url.includes('sambanova.ai')) return 'sambanova';
    if (url.includes('openrouter.ai')) return 'openrouter';
    if (url.includes('deepseek.com')) return 'deepseek';
    if (url.includes('fireworks.ai')) return 'fireworks';
    if (url.includes('perplexity.ai')) return 'perplexity';

    return 'custom';
}

/**
 * Check if a model ID is known to support vision
 */
export function isKnownVisionModel(modelId: string, baseUrl: string): boolean {
    const providerKey = getProviderKey(baseUrl);
    const visionModels = VISION_MODELS[providerKey] || [];

    // Check for exact match or partial match
    const lowerModelId = modelId.toLowerCase();
    return visionModels.some(vm =>
        lowerModelId.includes(vm.toLowerCase()) ||
        vm.toLowerCase().includes(lowerModelId)
    );
}

/**
 * Get provider-specific image format configuration
 */
export interface ImageFormatConfig {
    useImageUrlFormat: boolean;  // true = image_url format, false = images array
    supportsDetailParam: boolean;
    supportsUrlImages: boolean;
    maxImageSize?: number;  // in bytes
    maxImages?: number;
}

export function getImageFormatConfig(baseUrl: string): ImageFormatConfig {
    const providerKey = getProviderKey(baseUrl);

    switch (providerKey) {
        case 'ollama':
            return {
                useImageUrlFormat: false,  // Ollama uses images array
                supportsDetailParam: false,
                supportsUrlImages: false,  // Only base64
                maxImages: 10,
            };

        case 'sambanova':
            return {
                useImageUrlFormat: true,
                supportsDetailParam: false,  // SambaNova doesn't support detail
                supportsUrlImages: true,
                maxImageSize: 4 * 1024 * 1024,  // 4MB
            };

        case 'groq':
            return {
                useImageUrlFormat: true,
                supportsDetailParam: false,
                supportsUrlImages: true,
                maxImageSize: 4 * 1024 * 1024,  // 4MB for base64
                maxImages: 5,
            };

        case 'mistral':
            return {
                useImageUrlFormat: true,
                supportsDetailParam: false,
                supportsUrlImages: true,
                maxImageSize: 10 * 1024 * 1024,  // 10MB
            };

        case 'anthropic':
            return {
                useImageUrlFormat: false,  // Uses source.data format
                supportsDetailParam: false,
                supportsUrlImages: true,
                maxImageSize: 30 * 1024 * 1024,  // 30MB
                maxImages: 100,
            };

        default:
            // OpenAI and OpenAI-compatible (OpenRouter, Together, etc.)
            return {
                useImageUrlFormat: true,
                supportsDetailParam: true,
                supportsUrlImages: true,
                maxImageSize: 20 * 1024 * 1024,  // 20MB
                maxImages: 500,
            };
    }
}

/**
 * Get friendly provider name for display
 */
export function getProviderDisplayName(baseUrl: string): string {
    const providerKey = getProviderKey(baseUrl);

    const names: Record<string, string> = {
        openai: 'OpenAI',
        anthropic: 'Anthropic',
        google: 'Google AI',
        ollama: 'Ollama',
        groq: 'Groq',
        mistral: 'Mistral',
        together: 'Together AI',
        sambanova: 'SambaNova',
        openrouter: 'OpenRouter',
        deepseek: 'DeepSeek',
        fireworks: 'Fireworks',
        perplexity: 'Perplexity',
        custom: 'Custom',
    };

    return names[providerKey] || 'Unknown';
}
