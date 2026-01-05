import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { APIConfig } from '@/types/chat';

interface SystemPromptSettingsProps {
  config: APIConfig;
  onConfigChange: (config: APIConfig) => void;
}

export function SystemPromptSettings({ config, onConfigChange }: SystemPromptSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Prompt</CardTitle>
        <CardDescription>Define the AI assistant's personality and behavior</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={config.systemPrompt}
          onChange={(e) => onConfigChange({ ...config, systemPrompt: e.target.value })}
          placeholder="You are a helpful AI assistant..."
          className="min-h-[200px] resize-none"
        />
        <p className="text-xs text-muted-foreground mt-2">
          This prompt is sent at the beginning of every conversation to set the AI's behavior
        </p>
      </CardContent>
    </Card>
  );
}
