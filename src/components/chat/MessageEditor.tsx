import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface MessageEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function MessageEditor({ content, onChange, onSave, onCancel }: MessageEditorProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[100px] text-sm bg-background border-border focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-xl resize-none"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} className="rounded-lg">
          Save & Submit
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="rounded-lg">
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          ⌘+Enter to save · Esc to cancel
        </span>
      </div>
      <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
        <span className="w-1 h-1 bg-muted-foreground/50 rounded-full"></span>
        Editing will regenerate the conversation from this point
      </p>
    </div>
  );
}
