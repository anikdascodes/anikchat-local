import { memo, useMemo, forwardRef } from 'react';
import { ChevronDown, Cpu, Check, Zap, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { APIConfig, getActiveProviderAndModel } from '@/types/chat';
import { cn } from '@/lib/utils';

interface ModelSelectorProps {
  config: APIConfig;
  onModelChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
}

export const ModelSelector = memo(forwardRef<HTMLDivElement, ModelSelectorProps>(
  function ModelSelector({ config, onModelChange, disabled = false }, ref) {
    const providers = config.providers ?? [];
    const { provider: activeProvider, model: activeModel } = getActiveProviderAndModel(config);

    // Group models by provider - allow local providers without API key
    const providerModels = useMemo(() => {
      return providers
        .filter(p => {
          const isLocal = p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1');
          return (p.apiKey || isLocal) && p.models.length > 0;
        })
        .map(provider => ({
          provider,
          models: provider.models,
        }));
    }, [providers]);

    const hasModels = providerModels.some(p => p.models.length > 0);
    const isVisionModel = activeModel?.isVisionModel ?? false;

    if (!hasModels) {
      return (
        <div ref={ref}>
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground border-dashed"
            disabled
          >
            <Cpu className="h-4 w-4 mr-2 text-orange-400" />
            <span className="hidden sm:inline">Configure model →</span>
            <span className="sm:hidden">No model</span>
          </Button>
        </div>
      );
    }

    return (
      <div ref={ref}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "gap-2 max-w-[320px] border transition-all",
                activeModel
                  ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                  : "border-dashed"
              )}
              disabled={disabled}
            >
              {/* Status indicator dot */}
              <span className={cn(
                "h-2 w-2 rounded-full shrink-0",
                activeModel ? "bg-green-500 animate-pulse" : "bg-orange-400"
              )} />

              <span className="truncate">
                {activeModel
                  ? (
                    <span className="flex items-center gap-1.5">
                      <span className="hidden sm:inline font-medium text-foreground">
                        {activeModel.displayName}
                      </span>
                      <span className="sm:hidden text-foreground">
                        {activeModel.displayName.slice(0, 12)}...
                      </span>
                      {isVisionModel && (
                        <Eye className="h-3 w-3 text-blue-400" />
                      )}
                    </span>
                  )
                  : 'Select Model'}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 bg-popover z-50">
            {providerModels.map(({ provider, models }, idx) => (
              <div key={provider.id}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  {provider.name}
                  <span className="ml-auto text-xs opacity-50">{models.length} models</span>
                </DropdownMenuLabel>
                {models.map(model => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => onModelChange(provider.id, model.id)}
                    className={cn(
                      "cursor-pointer flex items-center gap-2",
                      config.activeProviderId === provider.id &&
                      config.activeModelId === model.id && "bg-primary/10"
                    )}
                  >
                    <span className="flex-1 truncate">{model.displayName}</span>
                    {model.isVisionModel && (
                      <Eye className="h-3 w-3 text-blue-400 shrink-0" />
                    )}
                    {config.activeProviderId === provider.id &&
                      config.activeModelId === model.id && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
));
