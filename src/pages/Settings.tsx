import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, Key, MessageSquare, Sliders, Database, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { APIConfig, Conversation, defaultConfig } from '@/types/chat';
import { useConfig } from '@/hooks/useConfig';
import { storageService } from '@/lib/storageService';
import { toast } from 'sonner';
import { redactConfigForExport } from '@/lib/exportRedaction';
import { logger } from '@/lib/logger';
import {
  AppearanceSettings,
  ApiSettings,
  SystemPromptSettings,
  AdvancedSettings,
  DataSettings,
} from '@/components/settings';

function Settings() {
  const safeLocalStorageGet = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      logger.debug('localStorage get failed:', error);
      return null;
    }
  };

  const safeLocalStorageRemove = (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logger.debug('localStorage remove failed:', error);
    }
  };

  const navigate = useNavigate();
  const [config, setConfig] = useConfig<APIConfig>(defaultConfig);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [saved, setSaved] = useState(false);
  const [deleteConversationId, setDeleteConversationId] = useState<string | null>(null);
  const [clearConversationsOpen, setClearConversationsOpen] = useState(false);
  const [clearAllDataOpen, setClearAllDataOpen] = useState(false);

  // Load conversations from storageService
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const ids = await storageService.listConversations();
        
        // Optimization: Parallel load conversations
        const convs = (await Promise.all(
          ids.map(id => storageService.getConversation<Conversation>(id))
        )).filter((c): c is Conversation => !!c);

        convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setConversations(convs);
      } catch (error) {
        logger.debug('Failed to load conversations from storage, falling back to localStorage:', error);
        // Fallback to localStorage
        const local = safeLocalStorageGet('openchat-conversations');
        if (local) setConversations(JSON.parse(local));
      }
    };
    loadConversations();
  }, []);

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
      config: redactConfigForExport(config),
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
    toast.success('Data exported (API keys not included)');
  }, [config, conversations]);

  const handleDeleteConversation = useCallback((id: string) => {
    setDeleteConversationId(id);
  }, []);

  const handleClearConversations = useCallback(() => {
    setClearConversationsOpen(true);
  }, []);

  const handleClearAllData = useCallback(() => {
    setClearAllDataOpen(true);
  }, []);

  const confirmDeleteConversation = useCallback(async () => {
    if (!deleteConversationId) return;
    await storageService.deleteConversation(deleteConversationId);
    setConversations((prev) => prev.filter((c) => c.id !== deleteConversationId));
    setDeleteConversationId(null);
    toast.success('Conversation deleted');
  }, [deleteConversationId]);

  const confirmClearConversations = useCallback(async () => {
    for (const conv of conversations) {
      await storageService.deleteConversation(conv.id);
    }
    setConversations([]);
    setClearConversationsOpen(false);
    toast.success('All conversations deleted');
  }, [conversations]);

  const confirmClearAllData = useCallback(async () => {
    await storageService.clearAll();
    safeLocalStorageRemove('openchat-config');
    safeLocalStorageRemove('openchat-conversations');
    setClearAllDataOpen(false);
    toast.success('All data cleared');
    window.location.reload();
  }, []);

  const conversationToDelete = deleteConversationId
    ? conversations.find((c) => c.id === deleteConversationId)
    : null;

  const handleImportData = useCallback(async (data: { config?: APIConfig; conversations?: Conversation[] }) => {
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
      const existingIds = new Set(conversations.map(c => c.id));
      const newConvs = data.conversations.filter(c => !existingIds.has(c.id));
      
      // Save new conversations to storage
      for (const conv of newConvs) {
        await storageService.saveConversation(conv.id, conv);
      }
      
      setConversations(prev => [...newConvs, ...prev]);
    }
  }, [setConfig, conversations]);

  return (
    <div className="min-h-screen bg-background">
      <ConfirmDialog
        open={!!deleteConversationId}
        onOpenChange={(open) => {
          if (!open) setDeleteConversationId(null);
        }}
        title="Delete conversation?"
        description={
          conversationToDelete
            ? `This will permanently delete "${conversationToDelete.title}".`
            : 'This will permanently delete the selected conversation.'
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDeleteConversation}
      />
      <ConfirmDialog
        open={clearConversationsOpen}
        onOpenChange={setClearConversationsOpen}
        title="Delete all conversations?"
        description="This cannot be undone."
        confirmLabel="Delete All"
        confirmVariant="destructive"
        onConfirm={confirmClearConversations}
      />
      <ConfirmDialog
        open={clearAllDataOpen}
        onOpenChange={setClearAllDataOpen}
        title="Delete ALL data?"
        description="This removes settings, conversations, and summaries. This cannot be undone."
        confirmLabel="Delete All Data"
        confirmVariant="destructive"
        onConfirm={confirmClearAllData}
      />
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
