import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { APIConfig, defaultConfig } from '@/types/chat';
import { toast } from 'sonner';

interface AdvancedSettingsProps {
  config: APIConfig;
  onConfigChange: (config: APIConfig) => void;
}

const parameterConfigs = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.01, desc: 'Controls randomness. Lower = more focused, higher = more creative' },
  { key: 'maxTokens', label: 'Max Tokens', min: 256, max: 32768, step: 256, desc: 'Maximum length of the response' },
  { key: 'topP', label: 'Top P', min: 0, max: 1, step: 0.01, desc: 'Nucleus sampling. Lower = more focused vocabulary' },
  { key: 'frequencyPenalty', label: 'Frequency Penalty', min: 0, max: 2, step: 0.01, desc: 'Reduces repetition of frequent tokens' },
  { key: 'presencePenalty', label: 'Presence Penalty', min: 0, max: 2, step: 0.01, desc: 'Encourages talking about new topics' },
] as const;

export function AdvancedSettings({ config, onConfigChange }: AdvancedSettingsProps) {
  const updateConfig = (partial: Partial<APIConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      onConfigChange(defaultConfig);
      toast.success('Settings reset to defaults');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced Parameters</CardTitle>
        <CardDescription>Fine-tune the model's response generation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {parameterConfigs.map(({ key, label, min, max, step, desc }) => {
          const value = config[key as keyof typeof config];
          const numValue = typeof value === 'number' ? value : 0;
          return (
            <div key={key} className="space-y-3">
              <div className="flex justify-between">
                <div>
                  <Label>{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                  {key === 'maxTokens' ? numValue : numValue.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[numValue]}
                onValueChange={([v]) => updateConfig({ [key]: v })}
                min={min}
                max={max}
                step={step}
                className="py-2"
              />
            </div>
          );
        })}

        <div className="pt-4 border-t border-border">
          <Button variant="outline" onClick={handleReset} className="w-full">
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
