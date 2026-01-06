import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { APIConfig, defaultConfig } from '@/types/chat';
import { toast } from 'sonner';
import { setRAGEnabled, preloadEmbeddingModel, isEmbeddingModelLoaded } from '@/lib/memoryManager';

interface AdvancedSettingsProps {
  config: APIConfig;
  onConfigChange: (config: APIConfig) => void;
}

const parameterConfigs = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.01, desc: 'Controls randomness. Lower = more focused' },
  { key: 'maxTokens', label: 'Max Tokens', min: 256, max: 32768, step: 256, desc: 'Maximum response length' },
  { key: 'topP', label: 'Top P', min: 0, max: 1, step: 0.01, desc: 'Nucleus sampling threshold' },
  { key: 'frequencyPenalty', label: 'Frequency Penalty', min: 0, max: 2, step: 0.01, desc: 'Reduces repetition' },
  { key: 'presencePenalty', label: 'Presence Penalty', min: 0, max: 2, step: 0.01, desc: 'Encourages new topics' },
] as const;

export function AdvancedSettings({ config, onConfigChange }: AdvancedSettingsProps) {
  const [ragEnabled, setRagEnabled] = useState(() => 
    localStorage.getItem('anikchat-rag-enabled') === 'true'
  );
  const [ragLoading, setRagLoading] = useState(false);

  const updateConfig = (partial: Partial<APIConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      onConfigChange(defaultConfig);
      toast.success('Settings reset to defaults');
    }
  };

  const handleRAGToggle = async (enabled: boolean) => {
    setRagEnabled(enabled);
    setRAGEnabled(enabled);
    
    if (enabled && !isEmbeddingModelLoaded()) {
      setRagLoading(true);
      toast.info('Loading semantic search model...');
      const loaded = await preloadEmbeddingModel();
      setRagLoading(false);
      if (loaded) {
        toast.success('Semantic search enabled');
      } else {
        toast.error('Failed to load model. Using basic context.');
        setRagEnabled(false);
        setRAGEnabled(false);
      }
    } else if (!enabled) {
      toast.info('Semantic search disabled - using basic context');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced Settings</CardTitle>
        <CardDescription>Model parameters and features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* RAG Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <Label>Semantic Search (RAG)</Label>
            <p className="text-xs text-muted-foreground">
              Enable AI-powered context retrieval for long conversations.
              <br />
              <span className="text-yellow-600">⚠️ Loads ~800KB model, uses more memory</span>
            </p>
          </div>
          <Switch
            checked={ragEnabled}
            onCheckedChange={handleRAGToggle}
            disabled={ragLoading}
          />
        </div>

        {/* Model Parameters */}
        {parameterConfigs.map(({ key, label, min, max, step, desc }) => {
          const value = config[key as keyof typeof config];
          const numValue = typeof value === 'number' ? value : 0;
          return (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <Label className="text-sm">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {key === 'maxTokens' ? numValue : numValue.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[numValue]}
                onValueChange={([v]) => updateConfig({ [key]: v })}
                min={min}
                max={max}
                step={step}
              />
            </div>
          );
        })}

        <div className="pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="w-full">
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
