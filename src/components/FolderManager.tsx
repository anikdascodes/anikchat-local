import { useState, useCallback, memo } from 'react';
import { Folder, Plus, X, Check, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { ConversationFolder, Conversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const FOLDER_COLORS = [
  { name: 'Blue', value: 'bg-blue-500' },
  { name: 'Green', value: 'bg-green-500' },
  { name: 'Purple', value: 'bg-purple-500' },
  { name: 'Orange', value: 'bg-orange-500' },
  { name: 'Red', value: 'bg-red-500' },
  { name: 'Cyan', value: 'bg-cyan-500' },
  { name: 'Pink', value: 'bg-pink-500' },
];

interface FolderManagerProps {
  folders: ConversationFolder[];
  conversations: Conversation[];
  activeFolder: string | null;
  onCreateFolder: (name: string, color: string) => void;
  onDeleteFolder: (id: string) => void;
  onSelectFolder: (id: string | null) => void;
  onAssignFolder: (conversationId: string, folderId: string | null) => void;
}

export const FolderManager = memo(function FolderManager({
  folders,
  conversations,
  activeFolder,
  onCreateFolder,
  onDeleteFolder,
  onSelectFolder,
  onAssignFolder,
}: FolderManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0].value);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName('');
      setIsCreating(false);
    }
  }, [newFolderName, newFolderColor, onCreateFolder]);

  const toggleExpanded = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const getFolderConversations = useCallback((folderId: string) => {
    return conversations.filter(c => c.folderId === folderId);
  }, [conversations]);

  const getUnfolderedConversations = useCallback(() => {
    return conversations.filter(c => !c.folderId);
  }, [conversations]);

  const confirmDeleteFolder = useCallback(() => {
    if (!deleteFolderId) return;
    onDeleteFolder(deleteFolderId);
    setDeleteFolderId(null);
  }, [deleteFolderId, onDeleteFolder]);

  const folderToDelete = deleteFolderId
    ? folders.find(f => f.id === deleteFolderId)
    : null;

  return (
    <div className="space-y-1">
      <ConfirmDialog
        open={!!deleteFolderId}
        onOpenChange={(open) => {
          if (!open) setDeleteFolderId(null);
        }}
        title="Delete folder?"
        description={
          folderToDelete
            ? `Delete "${folderToDelete.name}"?`
            : 'This will delete the selected folder.'
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDeleteFolder}
      />
      {/* All Chats */}
      <Button
        variant="ghost"
        className={`w-full justify-start gap-2 px-3 py-2 text-sm rounded-lg ${
          activeFolder === null
            ? 'bg-sidebar-accent text-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/50'
        }`}
        onClick={() => onSelectFolder(null)}
      >
        <Folder className="h-4 w-4" />
        <span>All Chats</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {conversations.length}
        </span>
      </Button>

      {/* Folders */}
      {folders.map(folder => {
        const isExpanded = expandedFolders.has(folder.id);
        const folderConvs = getFolderConversations(folder.id);
        
        return (
          <div key={folder.id}>
            <div
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors group ${
                activeFolder === folder.id
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleExpanded(folder.id)}
                className="h-6 w-6"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
              <div className={`w-3 h-3 rounded-full ${folder.color}`} />
              <Button
                variant="ghost"
                className="flex-1 justify-start h-auto p-0 text-left truncate"
                onClick={() => onSelectFolder(folder.id)}
              >
                {folder.name}
              </Button>
              <span className="text-xs text-muted-foreground">
                {folderConvs.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteFolderId(folder.id);
                }}
              >
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            
            {isExpanded && folderConvs.length > 0 && (
              <div className="ml-6 pl-2 border-l border-border space-y-0.5 py-1">
                {folderConvs.slice(0, 5).map(conv => (
                  <div
                    key={conv.id}
                    className="text-xs text-muted-foreground truncate py-1 px-2 hover:bg-muted/50 rounded"
                  >
                    {conv.title}
                  </div>
                ))}
                {folderConvs.length > 5 && (
                  <div className="text-xs text-muted-foreground px-2">
                    +{folderConvs.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unfoldered indicator */}
      {folders.length > 0 && getUnfolderedConversations().length > 0 && (
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-3 py-2 text-sm rounded-lg text-muted-foreground hover:bg-sidebar-accent/50"
          onClick={() => onSelectFolder('uncategorized')}
        >
          <Tag className="h-4 w-4" />
          <span>Uncategorized</span>
          <span className="ml-auto text-xs">
            {getUnfolderedConversations().length}
          </span>
        </Button>
      )}

      {/* Create Folder */}
      {isCreating ? (
        <div className="px-2 py-2 space-y-2">
          <Input
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
            }}
            autoFocus
            className="h-8 text-sm"
          />
          <div className="flex items-center gap-1">
            {FOLDER_COLORS.map(color => (
              <Button
                key={color.value}
                variant="ghost"
                size="icon"
                className={`w-5 h-5 rounded-full ${color.value} ${
                  newFolderColor === color.value ? 'ring-2 ring-offset-2 ring-primary' : ''
                }`}
                onClick={() => setNewFolderColor(color.value)}
                title={color.name}
                aria-label={`Folder color ${color.name}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} className="flex-1 h-7">
              <Check className="h-3 w-3 mr-1" /> Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)} className="h-7">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 rounded-lg"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="h-4 w-4" />
          New Folder
        </Button>
      )}
    </div>
  );
});

// Dropdown for assigning conversation to folder
interface FolderAssignDropdownProps {
  folders: ConversationFolder[];
  currentFolderId?: string;
  onAssign: (folderId: string | null) => void;
  trigger: React.ReactNode;
}

export function FolderAssignDropdown({
  folders,
  currentFolderId,
  onAssign,
  trigger,
}: FolderAssignDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onAssign(null)}>
          <X className="h-4 w-4 mr-2" />
          No Folder
          {!currentFolderId && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {folders.map(folder => (
          <DropdownMenuItem
            key={folder.id}
            onClick={() => onAssign(folder.id)}
          >
            <div className={`w-3 h-3 rounded-full ${folder.color} mr-2`} />
            {folder.name}
            {currentFolderId === folder.id && <Check className="h-4 w-4 ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
