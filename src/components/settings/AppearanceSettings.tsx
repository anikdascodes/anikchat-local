import { forwardRef } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

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
          <RadioGroup
            value={theme}
            onValueChange={setTheme}
            className="grid grid-cols-3 gap-3"
          >
            {themeOptions.map(({ value, icon: Icon, label, desc }) => (
              <div key={value} className="relative">
                <RadioGroupItem
                  value={value}
                  id={`theme-${value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`theme-${value}`}
                  className={cn(
                    "block cursor-pointer p-4 rounded-xl border-2 transition-all text-left",
                    "border-border hover:border-primary/50 hover:bg-accent/50",
                    "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 mb-2",
                      theme === value ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
});
