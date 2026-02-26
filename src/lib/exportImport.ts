/**
 * Export/Import Service
 * Backup and restore conversations
 */

import * as supabaseService from './localStorageService';
import { supabase } from '@/integrations/supabase/client';
import { APIConfig, Conversation } from '@/types/chat';
import { redactConfigForExport } from '@/lib/exportRedaction';

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const convIds = await supabaseService.listConversations();
  const conversations: Conversation[] = [];

  for (const id of convIds) {
    const conv = await supabaseService.getConversation(id);
    if (conv) conversations.push(conv);
  }

  const config = await supabaseService.getConfig(user.id);

  const exportData: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations,
    config: config ? (redactConfigForExport(config) as unknown as Record<string, unknown>) : undefined,
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const text = await file.text();
  const data = JSON.parse(text) as ExportData;

  if (data.version !== 1) {
    throw new Error('Unsupported backup version');
  }

  let imported = 0;
  let skipped = 0;

  for (const conv of data.conversations) {
    const existing = await supabaseService.getConversation(conv.id);
    if (existing) {
      skipped++;
      continue;
    }
    await supabaseService.saveConversation(conv, user.id);
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
