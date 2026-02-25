/**
 * DataSettings — Cloud storage management
 *
 * All data lives in Supabase. No local folder or IndexedDB selectors needed.
 */

import { useCallback, useRef, useState } from 'react';
import { Cloud, CheckCircle2, Trash2, Download, AlertTriangle, Database, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Conversation, APIConfig } from '@/types/chat';
import { logger } from '@/lib/logger';
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
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function getConversationSize(conv: Conversation): number {
  return new Blob([JSON.stringify(conv)]).size;
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
  const [importDialogOpen, setImportDialogOpen]     = useState(false);
  const [pendingImport,    setPendingImport]         = useState<{ config?: APIConfig; conversations?: Conversation[] } | null>(null);
  const [pendingImportSummary, setPendingImportSummary] = useState('');

  // ── Import handling ──────────────────────────────────────

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw  = ev.target?.result as string;
        const data = JSON.parse(raw) as { config?: APIConfig; conversations?: Conversation[] };

        const convCount = data.conversations?.length ?? 0;
        const summary   = [
          convCount > 0 ? `${convCount} conversation${convCount !== 1 ? 's' : ''}` : '',
          data.config   ? 'settings'    : '',
        ].filter(Boolean).join(', ');

        setPendingImport(data);
        setPendingImportSummary(summary || 'no recognizable data');
        setImportDialogOpen(true);
      } catch (err) {
        logger.debug('Failed to parse import file:', err);
        toast.error('Invalid backup file — not valid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const confirmImport = useCallback(() => {
    if (pendingImport && onImportData) {
      onImportData(pendingImport);
      toast.success('Data imported successfully');
    }
    setImportDialogOpen(false);
    setPendingImport(null);
  }, [pendingImport, onImportData]);

  // ── Storage usage ────────────────────────────────────────

  const totalSize = conversations.reduce((sum, c) => sum + getConversationSize(c), 0);

  return (
    <div className="space-y-6">

      {/* Cloud Storage Status */}
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>Your data is stored securely in Supabase cloud</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 rounded-lg border-2 border-primary bg-primary/5">
            <Cloud className="h-6 w-6 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">Supabase Cloud</p>
              <p className="text-xs text-muted-foreground">
                Encrypted at rest · Secured by Row-Level Security · Accessible on any device
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
          </div>
        </CardContent>
      </Card>

      {/* Storage Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Overview</CardTitle>
          <CardDescription>Summary of your cloud data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
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
                .map(conv => ({ ...conv, size: getConversationSize(conv) }))
                .sort((a, b) => b.size - a.size)
                .map(conv => (
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

      {/* Data Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Data Actions</CardTitle>
          <CardDescription>Export a backup or clear your data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2" onClick={onExportAllData}>
              <Download className="h-4 w-4" />
              Export Backup
            </Button>

            <Input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleImportFile}
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
              Removes all conversations, settings, and API keys from the cloud
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Import confirmation dialog */}
      <ConfirmDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Import backup?"
        description={`This will add ${pendingImportSummary} to your account. Existing data is not replaced.`}
        confirmLabel="Import"
        onConfirm={confirmImport}
      />
    </div>
  );
}
