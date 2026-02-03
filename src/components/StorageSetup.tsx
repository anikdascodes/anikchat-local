import { useState, useEffect } from 'react';
import { FolderOpen, HardDrive, Database, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storageService, isFileSystemSupported, StorageType } from '@/lib/storageService';
import { toast } from 'sonner';

interface StorageSetupProps {
  onComplete: () => void;
  isFirstTime?: boolean;
}

export function StorageSetup({ onComplete, isFirstTime = true }: StorageSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<StorageType | null>(null);
  const fsSupported = isFileSystemSupported();

  useEffect(() => {
  }, []);

  const handleSelectFolder = async () => {
    setIsLoading(true);
    try {
      const success = await storageService.switchToFileSystem();
      if (success) {
        toast.success(`Storage folder set: ${storageService.getDirectoryName()}`);
        setSelectedType('filesystem');
        setTimeout(onComplete, 500);
      } else {
        toast.error('Folder selection cancelled');
      }
    } catch (error) {
      toast.error('Failed to set storage folder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseBrowser = async () => {
    setIsLoading(true);
    try {
      await storageService.switchToIndexedDB();
      toast.success('Using browser storage');
      setSelectedType('indexeddb');
      setTimeout(onComplete, 500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isFirstTime ? 'Welcome to AnikChat' : 'Storage Settings'}
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Choose where to store your chat history and media files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File System Option - Recommended */}
          {fsSupported && (
            <button
              onClick={handleSelectFolder}
              disabled={isLoading}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedType === 'filesystem'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Local Folder</h3>
                    <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Store all data in a folder on your computer. Best for large conversations and media files.
                  </p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" /> No browser storage limits
                    </li>
                    <li className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" /> Easy backup & sync
                    </li>
                    <li className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-500" /> Works offline
                    </li>
                  </ul>
                </div>
                {selectedType === 'filesystem' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </button>
          )}

          {/* Browser Storage Option */}
          <button
            onClick={handleUseBrowser}
            disabled={isLoading}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedType === 'indexeddb'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-muted">
                <Database className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Browser Storage</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Store data in your browser. Simpler but has storage limits.
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-500" /> Limited to ~50-100MB
                  </li>
                  <li className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-yellow-500" /> Can slow browser
                  </li>
                </ul>
              </div>
              {selectedType === 'indexeddb' && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
          </button>

          {!fsSupported && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Local folder storage requires Chrome or Edge browser.
              </p>
            </div>
          )}

          {isFirstTime && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              You can change this later in Settings → Data Management
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Compact version for settings page
export function StorageSelector() {
  const [storageType, setStorageType] = useState<StorageType>('indexeddb');
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [storageSize, setStorageSize] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const fsSupported = isFileSystemSupported();

  useEffect(() => {
    const loadInfo = async () => {
      await storageService.init();
      setStorageType(storageService.getStorageType());
      setDirectoryName(storageService.getDirectoryName());
      const size = await storageService.getStorageSize();
      setStorageSize(size);
    };
    loadInfo();
  }, []);

  const handleChangeFolder = async () => {
    setIsLoading(true);
    try {
      const success = await storageService.switchToFileSystem();
      if (success) {
        setStorageType('filesystem');
        setDirectoryName(storageService.getDirectoryName());
        toast.success('Storage folder updated');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await storageService.disconnectFileSystem();
      setStorageType('indexeddb');
      setDirectoryName(null);
      toast.success('Switched to browser storage');
    } finally {
      setIsLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-3">
          {storageType === 'filesystem' ? (
            <FolderOpen className="h-5 w-5 text-primary" />
          ) : (
            <Database className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium text-sm">
              {storageType === 'filesystem' ? 'Local Folder' : 'Browser Storage'}
            </p>
            <p className="text-xs text-muted-foreground">
              {storageType === 'filesystem' && directoryName
                ? directoryName
                : `Using ${formatSize(storageSize)}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {fsSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleChangeFolder}
              disabled={isLoading}
            >
              {storageType === 'filesystem' ? 'Change' : 'Use Folder'}
            </Button>
          )}
          {storageType === 'filesystem' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={isLoading}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
