import { useCallback, useState, useEffect, useRef } from 'react';
import { HardDrive, FolderOpen, Cloud, CheckCircle2, Loader2, Trash2, Download, AlertTriangle, Database, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Conversation, APIConfig } from '@/types/chat';
import { storageService, isFileSystemSupported, StorageType } from '@/lib/storageService';
import { toast } from 'sonner';

interface DataSettingsProps {
  conversations: Conversation[];
  onDeleteConversation: (id: string) => void;
  onClearConversations: () => void;
  onClearAllData: () => void;
  onExportAllData: () => void;
  onImportData?: (data: { config?: APIConfig; conversations?: Conversation[] }) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getConversationSize(conv: Conversation): number {
  return new Blob([JSON.stringify(conv)]).size;
}

function getStorageUsage(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('openchat-')) {
      const value = localStorage.getItem(key) || '';
      total += new Blob([value]).size;
    }
  }
  return total;
}

export function DataSettings({
  conversations,
  onDeleteConversation,
  onClearConversations,
  onClearAllData,
  onExportAllData,
  onImportData,
}: DataSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [storageType, setStorageType] = useState<StorageType>('localstorage');
  const [storageDirName, setStorageDirName] = useState<string | null>(null);
  const [isStorageLoading, setIsStorageLoading] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    const initStorage = async () => {
      await storageService.init();
      setStorageType(storageService.getStorageType());
      setStorageDirName(storageService.getDirectoryName());
      setNeedsReauth(storageService.needsReauthorization());
    };
    initStorage();
  }, []);

  const handleSelectFolder = useCallback(async () => {
    if (!isFileSystemSupported()) {
      toast.error('File System API not supported in this browser. Try Chrome or Edge.');
      return;
    }
    
    setIsStorageLoading(true);
    try {
      const success = await storageService.switchToFileSystem();
      if (success) {
        setStorageType('filesystem');
        setStorageDirName(storageService.getDirectoryName());
        setNeedsReauth(false);
        toast.success('Folder selected! Your data will be stored locally.');
      }
    } catch {
      toast.error('Failed to select folder');
    } finally {
      setIsStorageLoading(false);
    }
  }, []);

  const handleReauthorize = useCallback(async () => {
    setIsStorageLoading(true);
    try {
      const success = await storageService.reauthorize();
      if (success) {
        setNeedsReauth(false);
        setStorageDirName(storageService.getDirectoryName());
        toast.success('Folder access restored!');
      } else {
        setStorageType('indexeddb');
        toast.info('Could not access folder. Switched to browser storage.');
      }
    } catch {
      toast.error('Failed to reauthorize folder access');
    } finally {
      setIsStorageLoading(false);
    }
  }, []);

  const handleSwitchToIndexedDB = useCallback(async () => {
    setIsStorageLoading(true);
    try {
      await storageService.switchToIndexedDB();
      setStorageType('indexeddb');
      setStorageDirName(null);
      toast.success('Switched to browser storage (IndexedDB)');
    } finally {
      setIsStorageLoading(false);
    }
  }, []);

  const handleDisconnectFolder = useCallback(async () => {
    if (window.confirm('Disconnect from folder? Data in the folder will be preserved.')) {
      setIsStorageLoading(true);
      try {
        await storageService.disconnectFileSystem();
        setStorageType('indexeddb');
        setStorageDirName(null);
        toast.success('Disconnected from folder');
      } finally {
        setIsStorageLoading(false);
      }
    }
  }, []);

  const handleImportData = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Validate the data structure
        if (!data.config && !data.conversations) {
          toast.error('Invalid backup file format');
          return;
        }

        const hasConfig = data.config && typeof data.config === 'object';
        const hasConversations = Array.isArray(data.conversations);

        if (!hasConfig && !hasConversations) {
          toast.error('No valid data found in backup file');
          return;
        }

        // Confirm import
        const confirmMsg = `Import ${hasConversations ? data.conversations.length + ' conversations' : ''}${hasConfig && hasConversations ? ' and ' : ''}${hasConfig ? 'settings' : ''}? This will merge with existing data.`;
        
        if (window.confirm(confirmMsg)) {
          onImportData?.({
            config: hasConfig ? data.config : undefined,
            conversations: hasConversations ? data.conversations : undefined,
          });
          toast.success('Data imported successfully');
        }
      } catch {
        toast.error('Failed to parse backup file');
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImportData]);

  const storageUsed = getStorageUsage();

  return (
    <div className="space-y-6">
      {/* Storage Location */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <CardTitle>Storage Location</CardTitle>
          </div>
          <CardDescription>Choose where to store your chat data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {isFileSystemSupported() && (
              <div className={`p-4 rounded-lg border-2 transition-all ${
                storageType === 'filesystem' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Local Folder (SSD/HDD)</p>
                      <p className="text-xs text-muted-foreground">
                        {storageDirName 
                          ? `Connected: ${storageDirName}/anikchat-data` 
                          : 'Store data in a folder you choose'}
                      </p>
                    </div>
                  </div>
                  {storageType === 'filesystem' && needsReauth ? (
                    <Button size="sm" onClick={handleReauthorize} disabled={isStorageLoading}>
                      {isStorageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reconnect'}
                    </Button>
                  ) : storageType === 'filesystem' ? (
                    <Button variant="outline" size="sm" onClick={handleDisconnectFolder} disabled={isStorageLoading}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleSelectFolder} disabled={isStorageLoading}>
                      {isStorageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Select Folder'}
                    </Button>
                  )}
                </div>
                {storageType === 'filesystem' && needsReauth && (
                  <p className="text-xs text-amber-500 mt-2">
                    Click "Reconnect" to restore access to your saved folder
                  </p>
                )}
              </div>
            )}

            <div className={`p-4 rounded-lg border-2 transition-all ${
              storageType === 'indexeddb' 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Browser Storage (IndexedDB)</p>
                    <p className="text-xs text-muted-foreground">Large capacity, works in all browsers</p>
                  </div>
                </div>
                {storageType !== 'indexeddb' && (
                  <Button variant="outline" size="sm" onClick={handleSwitchToIndexedDB} disabled={isStorageLoading}>
                    Use This
                  </Button>
                )}
                {storageType === 'indexeddb' && (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
          </div>

          {!isFileSystemSupported() && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
              💡 Use Chrome or Edge to enable local folder storage
            </p>
          )}
        </CardContent>
      </Card>

      {/* Storage Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Overview</CardTitle>
          <CardDescription>Manage your locally stored data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-2xl font-bold">{formatBytes(storageUsed)}</div>
              <div className="text-sm text-muted-foreground">
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} stored
              </div>
            </div>
            <Database className="h-10 w-10 text-muted-foreground/50" />
          </div>
        </CardContent>
      </Card>

      {/* Conversations List */}
      <Card>
        <CardHeader>
          <CardTitle>Stored Conversations</CardTitle>
          <CardDescription>Delete individual conversations to free up space</CardDescription>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No conversations stored</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
              {conversations
                .map((conv) => ({ ...conv, size: getConversationSize(conv) }))
                .sort((a, b) => b.size - a.size)
                .map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 border border-border rounded-lg group transition-colors"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-medium truncate">{conv.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {conv.messages.length} messages · {formatBytes(conv.size)}
                        {conv.summary && ' · summarized'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-50 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={() => onDeleteConversation(conv.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Data Actions</CardTitle>
          <CardDescription>Export or clear your data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={onExportAllData}>
              <Download className="h-4 w-4" />
              Export Data
            </Button>
            
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImportData}
              className="hidden"
            />
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Import Backup
            </Button>
          </div>
          
          <Button
            variant="outline"
            className="w-full gap-2 text-orange-500 hover:text-orange-600 hover:border-orange-400"
            onClick={onClearConversations}
            disabled={conversations.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            Clear All Conversations
          </Button>

          <div className="pt-3 border-t border-border">
            <Button variant="destructive" className="w-full gap-2" onClick={onClearAllData}>
              <AlertTriangle className="h-4 w-4" />
              Delete All Data
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              This will remove all settings, conversations, and summaries
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
