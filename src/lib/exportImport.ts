/**
 * Export/Import Service
 * Backup and restore conversations
 */

import { storageService } from './storageService';
import { Conversation } from '@/types/chat';

export interface ExportData {
  version: 1;
  exportedAt: string;
  conversations: Conversation[];
  config?: Record<string, unknown>;
}

/**
 * Export all conversations as JSON
 */
export async function exportAllData(): Promise<void> {
  const convIds = await storageService.listConversations();
  const conversations: Conversation[] = [];

  for (const id of convIds) {
    const conv = await storageService.getConversation<Conversation>(id);
    if (conv) conversations.push(conv);
  }

  const config = await storageService.getConfig();

  const exportData: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations,
    config: config as Record<string, unknown> | undefined,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `anikchat-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Export single conversation as Markdown
 */
export async function exportAsMarkdown(conversation: Conversation): Promise<void> {
  let md = `# ${conversation.title || 'Untitled Chat'}\n\n`;
  md += `*Exported: ${new Date().toLocaleString()}*\n\n---\n\n`;

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? '**You**' : '**Assistant**';
    md += `${role}:\n\n${msg.content}\n\n---\n\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${conversation.title || 'chat'}-${conversation.id.slice(0, 8)}.md`;
  a.click();
  
  URL.revokeObjectURL(url);
}

/**
 * Import conversations from JSON backup
 */
export async function importData(file: File): Promise<{ imported: number; skipped: number }> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportData;

  if (data.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  let imported = 0;
  let skipped = 0;

  for (const conv of data.conversations) {
    const existing = await storageService.getConversation(conv.id);
    if (existing) {
      skipped++;
      continue;
    }
    await storageService.saveConversation(conv.id, conv);
    imported++;
  }

  return { imported, skipped };
}

/**
 * Trigger file picker for import
 */
export function pickImportFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
