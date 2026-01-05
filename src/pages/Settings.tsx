import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, Key, MessageSquare, Sliders, Database, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { APIConfig, Conversation, defaultConfig } from '@/types/chat';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { toast } from 'sonner';
import {
  AppearanceSettings,
  ApiSettings,
  SystemPromptSettings,
  AdvancedSettings,
  DataSettings,
} from '@/components/settings';

function Settings() {
  const navigate = useNavigate();
  const [config, setConfig] = useLocalStorage<APIConfig>('openchat-config', defaultConfig);
  const [conversations, setConversations] = useLocalStorage<Conversation[]>('openchat-conversations', []);
  const [saved, setSaved] = useState(false);

  const handleConfigChange = useCallback((newConfig: APIConfig) => {
    setConfig(newConfig);
  }, [setConfig]);

  const handleSave = useCallback(() => {
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleExportAllData = useCallback(() => {
    const data = {
      config,
      conversations,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anikchat-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  }, [config, conversations]);

  const handleDeleteConversation = useCallback((id: string) => {
    if (window.confirm('Delete this conversation?')) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      toast.success('Conversation deleted');
    }
  }, [setConversations]);

  const handleClearConversations = useCallback(() => {
    if (window.confirm('Delete all conversations? This cannot be undone.')) {
      setConversations([]);
      toast.success('All conversations deleted');
    }
  }, [setConversations]);

  const handleClearAllData = useCallback(() => {
    if (window.confirm('⚠️ Delete ALL data? This cannot be undone!')) {
      localStorage.removeItem('openchat-config');
      localStorage.removeItem('openchat-conversations');
      toast.success('All data cleared');
      window.location.reload();
    }
  }, []);

  const handleImportData = useCallback((data: { config?: APIConfig; conversations?: Conversation[] }) => {
    if (data.config) {
      // Merge config - keep existing providers, add new ones
      setConfig(prev => ({
        ...prev,
        ...data.config,
        providers: [
          ...prev.providers,
          ...(data.config?.providers || []).filter(
            newP => !prev.providers.some(existingP => existingP.id === newP.id)
          ),
        ],
      }));
    }
    
    if (data.conversations) {
      // Merge conversations - add new ones, skip duplicates
      setConversations(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newConvs = data.conversations!.filter(c => !existingIds.has(c.id));
        return [...newConvs, ...prev];
      });
    }
  }, [setConfig, setConversations]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Settings</h1>
          <div className="flex-1" />
          <Button onClick={handleSave} className="gap-2">
            {saved && <Check className="h-4 w-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="appearance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 h-auto p-1">
            <TabsTrigger value="appearance" className="gap-2 py-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2 py-2">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="prompt" className="gap-2 py-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Prompt</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2 py-2">
              <Sliders className="h-4 w-4" />
              <span className="hidden sm:inline">Advanced</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-2 py-2">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Data</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance">
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="api">
            <ApiSettings config={config} onConfigChange={handleConfigChange} />
          </TabsContent>

          <TabsContent value="prompt">
            <SystemPromptSettings config={config} onConfigChange={handleConfigChange} />
          </TabsContent>

          <TabsContent value="advanced">
            <AdvancedSettings config={config} onConfigChange={handleConfigChange} />
          </TabsContent>

          <TabsContent value="data">
            <DataSettings
              conversations={conversations}
              onDeleteConversation={handleDeleteConversation}
              onClearConversations={handleClearConversations}
              onClearAllData={handleClearAllData}
              onExportAllData={handleExportAllData}
              onImportData={handleImportData}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default Settings;
