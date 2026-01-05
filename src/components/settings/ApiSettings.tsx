import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { APIConfig } from '@/types/chat';
import { LLMProvidersManager } from '@/components/LLMProvidersManager';

interface ApiSettingsProps {
  config: APIConfig;
  onConfigChange: (config: APIConfig) => void;
}

export function ApiSettings({ config, onConfigChange }: ApiSettingsProps) {
  const updateConfig = (partial: Partial<APIConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  return (
    <div className="space-y-6">
      {/* Providers Management */}
      <Card>
        <CardHeader>
          <CardTitle>LLM Providers</CardTitle>
          <CardDescription>
            Configure your AI providers and models.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LLMProvidersManager config={config} onConfigChange={onConfigChange} />
        </CardContent>
      </Card>

      {/* Active Model */}
      <Card>
        <CardHeader>
          <CardTitle>Active Model</CardTitle>
          <CardDescription>Select which model to use for conversations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Select Model</Label>
            <select
              className="w-full p-2.5 rounded-md border border-border bg-background text-sm"
              value={`${config.activeProviderId}:${config.activeModelId}`}
              onChange={(e) => {
                const [providerId, modelId] = e.target.value.split(':');
                updateConfig({
                  activeProviderId: providerId || null,
                  activeModelId: modelId || null,
                });
              }}
            >
              <option value=":">Select a model...</option>
              {(config.providers || []).flatMap(provider =>
                provider.models.map(model => (
                  <option key={`${provider.id}:${model.id}`} value={`${provider.id}:${model.id}`}>
                    {provider.name} / {model.displayName} {model.isVisionModel && '👁️'}
                  </option>
                ))
              )}
            </select>
            <p className="text-xs text-muted-foreground">
              This model handles all chat interactions. Vision models (👁️) can process images directly.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
