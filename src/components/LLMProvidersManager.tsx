import { useState, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Check, Server, Cpu, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APIConfig, LLMProvider, LLMModel, generateId } from '@/types/chat';
import { toast } from 'sonner';

// Pre-configured providers with their base URLs
const PRESET_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google AI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', placeholder: 'AIza...' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', placeholder: 'gsk_...' },
  { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', placeholder: 'api-key' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', placeholder: 'api-key' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', placeholder: 'sk-...' },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', placeholder: 'fw_...' },
  { id: 'perplexity', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', placeholder: 'pplx-...' },
  { id: 'nebius', name: 'Nebius Token Factory', baseUrl: 'https://api.tokenfactory.nebius.com/v1', placeholder: 'api-key' },
  { id: 'sambanova', name: 'SambaNova Cloud', baseUrl: 'https://api.sambanova.ai/v1', placeholder: 'api-key' },
  { id: 'ollama', name: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1', placeholder: 'optional' },
  { id: 'lmstudio', name: 'LM Studio (Local)', baseUrl: 'http://localhost:1234/v1', placeholder: 'optional' },
  { id: 'custom', name: 'OpenAI Compatible (Custom)', baseUrl: '', placeholder: 'api-key' },
] as const;

interface LLMProvidersManagerProps {
  config: APIConfig;
  onConfigChange: (config: APIConfig) => void;
}

export function LLMProvidersManager({ config, onConfigChange }: LLMProvidersManagerProps) {
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [showApiKeys, setShowApiKeys] = useState<Set<string>>(new Set());

  const providers = config.providers ?? [];

  const toggleProviderExpanded = useCallback((providerId: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const toggleShowApiKey = useCallback((providerId: string) => {
    setShowApiKeys(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const addPresetProvider = useCallback((presetId: string) => {
    const preset = PRESET_PROVIDERS.find(p => p.id === presetId);
    if (!preset) return;

    const newProvider: LLMProvider = {
      id: generateId(),
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: '',
      models: [],
    };
    onConfigChange({
      ...config,
      providers: [...providers, newProvider],
    });
    setExpandedProviders(prev => new Set(prev).add(newProvider.id));
    toast.success(`${preset.name} provider added`);
  }, [config, providers, onConfigChange]);

  const updateProvider = useCallback((providerId: string, updates: Partial<LLMProvider>) => {
    onConfigChange({
      ...config,
      providers: providers.map(p =>
        p.id === providerId ? { ...p, ...updates } : p
      ),
    });
  }, [config, providers, onConfigChange]);

  const deleteProvider = useCallback((providerId: string) => {
    if (!window.confirm('Delete this provider and all its models?')) return;

    const newProviders = providers.filter(p => p.id !== providerId);
    let newActiveProviderId = config.activeProviderId;
    let newActiveModelId = config.activeModelId;

    if (config.activeProviderId === providerId) {
      newActiveProviderId = null;
      newActiveModelId = null;
    }

    onConfigChange({
      ...config,
      providers: newProviders,
      activeProviderId: newActiveProviderId,
      activeModelId: newActiveModelId,
    });
    toast.success('Provider deleted');
  }, [config, providers, onConfigChange]);

  const addModel = useCallback((providerId: string) => {
    const newModel: LLMModel = {
      id: generateId(),
      modelId: '',
      displayName: 'New Model',
      isVisionModel: false,
    };
    onConfigChange({
      ...config,
      providers: providers.map(p =>
        p.id === providerId
          ? { ...p, models: [...p.models, newModel] }
          : p
      ),
    });
    toast.success('Model added');
  }, [config, providers, onConfigChange]);

  const updateModel = useCallback((providerId: string, modelId: string, updates: Partial<LLMModel>) => {
    onConfigChange({
      ...config,
      providers: providers.map(p =>
        p.id === providerId
          ? {
            ...p,
            models: p.models.map(m => m.id === modelId ? { ...m, ...updates } : m)
          }
          : p
      ),
    });
  }, [config, providers, onConfigChange]);

  const deleteModel = useCallback((providerId: string, modelId: string) => {
    let newActiveProviderId = config.activeProviderId;
    let newActiveModelId = config.activeModelId;

    if (config.activeModelId === modelId) {
      newActiveProviderId = null;
      newActiveModelId = null;
    }

    onConfigChange({
      ...config,
      providers: providers.map(p =>
        p.id === providerId
          ? { ...p, models: p.models.filter(m => m.id !== modelId) }
          : p
      ),
      activeProviderId: newActiveProviderId,
      activeModelId: newActiveModelId,
    });
    toast.success('Model deleted');
  }, [config, providers, onConfigChange]);

  const activateModel = useCallback((providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider?.apiKey && !provider?.baseUrl.includes('localhost')) {
      toast.error('Please add an API key for this provider first');
      return;
    }

    onConfigChange({
      ...config,
      activeProviderId: providerId,
      activeModelId: modelId,
    });

    const model = provider.models.find(m => m.id === modelId);
    toast.success(`Activated: ${model?.displayName || model?.modelId}`);
  }, [config, providers, onConfigChange]);

  // Test connection to a provider
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const testConnection = useCallback(async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const isLocal = provider.baseUrl.includes('localhost') || provider.baseUrl.includes('127.0.0.1');
    if (!provider.apiKey && !isLocal) {
      toast.error('Please add an API key first');
      return;
    }

    if (provider.models.length === 0) {
      toast.error('Please add at least one model first');
      return;
    }

    setTestingProvider(providerId);
    const model = provider.models[0];
    const baseUrl = provider.baseUrl.replace(/\/+$/, '');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.modelId,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        toast.success(`${provider.name} connection successful!`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData.error as any)?.message || `Error ${response.status}`;

        if (response.status === 401) {
          toast.error('Invalid API key');
        } else if (response.status === 404) {
          toast.error(`Model "${model.modelId}" not found. Check the model ID.`);
        } else if (response.status === 429) {
          toast.error('Rate limited. Connection works but try again later.');
        } else {
          toast.error(`Connection failed: ${errorMsg}`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          toast.error('Connection timed out. Check the base URL.');
        } else if (error.message.includes('Failed to fetch')) {
          toast.error('Cannot connect. Check base URL and network.');
        } else {
          toast.error(`Error: ${error.message}`);
        }
      } else {
        toast.error('Unknown error occurred');
      }
    } finally {
      setTestingProvider(null);
    }
  }, [providers]);

  // Get placeholder for API key based on provider name
  const getApiKeyPlaceholder = (providerName: string) => {
    const preset = PRESET_PROVIDERS.find(p => p.name === providerName);
    return preset?.placeholder || 'api-key';
  };

  // Check if provider uses custom base URL (includes renamed custom providers)
  const isCustomProvider = (provider: LLMProvider) => {
    const preset = PRESET_PROVIDERS.find(p => p.name === provider.name);
    // If it's the custom preset OR if it's not a known preset (user renamed it), allow base URL editing
    return provider.name === 'OpenAI Compatible (Custom)' || (!preset && provider.baseUrl === '');
  };

  // Check if base URL should be editable
  const shouldShowEditableBaseUrl = (provider: LLMProvider) => {
    const preset = PRESET_PROVIDERS.find(p => p.name === provider.name);
    // Editable if: custom provider OR not a preset provider
    return provider.name === 'OpenAI Compatible (Custom)' || !preset;
  };

  return (
    <div className="space-y-4">
      {/* Active Model Display */}
      {config.activeProviderId && config.activeModelId && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Active:</span>
              <span className="text-sm text-muted-foreground">
                {(() => {
                  const provider = providers.find(p => p.id === config.activeProviderId);
                  const model = provider?.models.find(m => m.id === config.activeModelId);
                  return `${provider?.name} → ${model?.displayName || model?.modelId}`;
                })()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Providers List */}
      {providers.map((provider) => (
        <Card key={provider.id} className="overflow-hidden">
          <Collapsible
            open={expandedProviders.has(provider.id)}
            onOpenChange={() => toggleProviderExpanded(provider.id)}
          >
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedProviders.has(provider.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Server className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                        {!provider.apiKey && !provider.baseUrl.includes('localhost') && ' • No API key'}
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProvider(provider.id);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                {/* Provider Settings */}
                <div className="grid gap-4 p-4 bg-muted/30 rounded-lg">
                  {/* Only show Base URL for custom providers */}
                  {shouldShowEditableBaseUrl(provider) ? (
                    <div className="space-y-2">
                      <Label>Base URL</Label>
                      <Input
                        value={provider.baseUrl}
                        onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                        placeholder="https://api.example.com/v1"
                        className="font-mono text-sm"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Base URL</Label>
                      <p className="text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-2 rounded">
                        {provider.baseUrl}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showApiKeys.has(provider.id) ? 'text' : 'password'}
                        value={provider.apiKey}
                        onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                        placeholder={getApiKeyPlaceholder(provider.name)}
                        className="font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleShowApiKey(provider.id)}
                      >
                        {showApiKeys.has(provider.id) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {provider.baseUrl.includes('localhost') && (
                      <p className="text-xs text-muted-foreground">
                        API key is optional for local providers
                      </p>
                    )}
                  </div>

                  {/* Test Connection Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(provider.id)}
                    disabled={testingProvider === provider.id || provider.models.length === 0}
                    className="gap-2"
                  >
                    {testingProvider === provider.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>
                </div>

                {/* Models */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Models</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addModel(provider.id)}
                      className="gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add Model
                    </Button>
                  </div>

                  {provider.models.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No models added yet. Add a model with its Model ID.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {provider.models.map((model) => {
                        const isActive = config.activeProviderId === provider.id && config.activeModelId === model.id;

                        return (
                          <div
                            key={model.id}
                            className={`p-3 rounded-lg border transition-all ${isActive
                              ? 'border-green-500 bg-green-500/5'
                              : 'border-border hover:border-primary/50'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <Cpu className={`h-4 w-4 mt-1 ${isActive ? 'text-green-500' : 'text-muted-foreground'}`} />

                              <div className="flex-1 grid gap-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Display Name</Label>
                                    <Input
                                      value={model.displayName}
                                      onChange={(e) => updateModel(provider.id, model.id, { displayName: e.target.value })}
                                      placeholder="GPT-4o"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Model ID</Label>
                                    <Input
                                      value={model.modelId}
                                      onChange={(e) => updateModel(provider.id, model.id, { modelId: e.target.value })}
                                      placeholder="gpt-4o"
                                      className="h-8 text-sm font-mono"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={model.isVisionModel}
                                      onCheckedChange={(checked) => updateModel(provider.id, model.id, { isVisionModel: checked })}
                                    />
                                    <Label className="text-xs text-muted-foreground">Vision capable</Label>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant={isActive ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => activateModel(provider.id, model.id)}
                                      className="gap-1"
                                      disabled={isActive}
                                    >
                                      {isActive ? (
                                        <>
                                          <Check className="h-3 w-3" />
                                          Active
                                        </>
                                      ) : (
                                        'Activate'
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteModel(provider.id, model.id)}
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}

      {/* Add Provider Dropdown with Search */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full border-dashed justify-start gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            <span>Add LLM Provider</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          {/* Cloud Providers */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Cloud Providers</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => addPresetProvider('openai')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> OpenAI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('anthropic')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Anthropic (Claude)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('google')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Google AI (Gemini)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('groq')} className="cursor-pointer">
            <Zap className="h-4 w-4 mr-2" /> Groq
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('mistral')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Mistral AI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('together')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Together AI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('openrouter')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> OpenRouter
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('deepseek')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> DeepSeek
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('fireworks')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Fireworks AI
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('perplexity')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Perplexity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('nebius')} className="cursor-pointer">
            <Server className="h-4 w-4 mr-2" /> Nebius Token Factory
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('sambanova')} className="cursor-pointer">
            <Zap className="h-4 w-4 mr-2" /> SambaNova Cloud
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Local Providers */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Local Providers</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => addPresetProvider('ollama')} className="cursor-pointer">
            <Cpu className="h-4 w-4 mr-2" /> Ollama (Local)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addPresetProvider('lmstudio')} className="cursor-pointer">
            <Cpu className="h-4 w-4 mr-2" /> LM Studio (Local)
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Custom */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Custom</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => addPresetProvider('custom')} className="cursor-pointer">
            <Plus className="h-4 w-4 mr-2" /> OpenAI Compatible (Custom)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {providers.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Select a provider above to get started
        </p>
      )}
    </div>
  );
}
