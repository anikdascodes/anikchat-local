import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
            <Select
              value={
                config.activeProviderId && config.activeModelId
                  ? `${config.activeProviderId}:${config.activeModelId}`
                  : "__none__"
              }
              onValueChange={(value) => {
                if (value === "__none__") {
                  updateConfig({ activeProviderId: null, activeModelId: null });
                  return;
                }
                const [providerId, modelId] = value.split(':');
                updateConfig({
                  activeProviderId: providerId || null,
                  activeModelId: modelId || null,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a model...</SelectItem>
                <SelectSeparator />
                {(config.providers || [])
                  .filter(provider => provider.models.length > 0)
                  .map(provider => (
                    <SelectGroup key={provider.id}>
                      <SelectLabel>{provider.name}</SelectLabel>
                      {provider.models.map(model => (
                        <SelectItem key={`${provider.id}:${model.id}`} value={`${provider.id}:${model.id}`}>
                          {model.displayName} {model.isVisionModel && '👁️'}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This model handles all chat interactions. Vision models (👁️) can process images directly.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
