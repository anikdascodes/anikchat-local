import { Conversation } from '@/types/chat';

export function exportAsMarkdown(conversation: Conversation): string {
  let markdown = `# ${conversation.title}\n\n`;
  markdown += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

  for (const message of conversation.messages) {
    const role = message.role === 'user' ? '**You**' : '**Assistant**';
    markdown += `${role}\n\n${message.content}\n\n---\n\n`;
  }

  return markdown;
}

export function exportAsJSON(conversation: Conversation): string {
  return JSON.stringify(conversation, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
