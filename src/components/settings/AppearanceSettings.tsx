import { forwardRef } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';

const themeOptions = [
  { value: 'light', icon: Sun, label: 'Light', desc: 'Bright and clean' },
  { value: 'dark', icon: Moon, label: 'Dark', desc: 'Easy on the eyes' },
  { value: 'system', icon: Monitor, label: 'System', desc: 'Match device' },
] as const;

export const AppearanceSettings = forwardRef<HTMLDivElement>(function AppearanceSettings(_, ref) {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Customize the look and feel of the application</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Theme</Label>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map(({ value, icon: Icon, label, desc }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                }`}
              >
                <Icon className={`h-6 w-6 mb-2 ${theme === value ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
