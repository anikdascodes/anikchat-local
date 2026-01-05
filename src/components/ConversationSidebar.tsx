import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, MessageSquare, Trash2, Settings, Download, Menu, X, 
  Pencil, Check, XCircle, Search, FolderPlus, ChevronRight, 
  ChevronDown, Folder, MoreHorizontal, FolderOpen
} from 'lucide-react';
import { Conversation, ConversationFolder, generateId } from '@/types/chat';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

const FOLDER_COLORS = [
  { name: 'Blue', value: 'bg-blue-500' },
  { name: 'Green', value: 'bg-green-500' },
  { name: 'Purple', value: 'bg-purple-500' },
  { name: 'Orange', value: 'bg-orange-500' },
  { name: 'Red', value: 'bg-red-500' },
  { name: 'Cyan', value: 'bg-cyan-500' },
];

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onExport: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onSearchOpen?: () => void;
  folders: ConversationFolder[];
  onCreateFolder: (name: string, color: string) => void;
  onDeleteFolder: (id: string) => void;
  onAssignFolder: (conversationId: string, folderId: string | null) => void;
}

// Draggable conversation item
function DraggableConversation({ 
  conv, 
  isActive, 
  isEditing,
  editValue,
  onEditChange,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onExport,
  onKeyDown,
  inputRef,
  folders,
  onAssignFolder,
}: {
  conv: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onExport: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  folders: ConversationFolder[];
  onAssignFolder: (folderId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: conv.id,
    data: { type: 'conversation', conversation: conv },
  });

  return (
    <div
      ref={setNodeRef}
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 text-sm ${
        isActive 
          ? 'bg-sidebar-accent shadow-sm' 
          : 'hover:bg-sidebar-accent/50'
      } ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => !isEditing && onSelect()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !isEditing && onSelect()}
      aria-current={isActive ? 'true' : undefined}
      {...attributes}
      {...listeners}
    >
      <MessageSquare 
        className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`} 
        aria-hidden="true" 
      />
      
      <div className="flex-1 min-w-0 relative">
        <span 
          className={`block truncate transition-all duration-200 ${
            isEditing ? 'opacity-0 invisible' : 'opacity-100 visible'
          }`}
        >
          {conv.title}
        </span>
        
        <div 
          className={`absolute inset-0 flex items-center transition-all duration-200 ${
            isEditing 
              ? 'opacity-100 visible' 
              : 'opacity-0 invisible pointer-events-none'
          }`}
        >
          <input
            ref={isEditing ? inputRef : null}
            type="text"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
            onClick={(e) => e.stopPropagation()}
            placeholder="Chat name..."
          />
        </div>
      </div>

      <div 
        className={`flex items-center gap-0.5 transition-all duration-200 ${
          isEditing 
            ? 'opacity-100' 
            : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isEditing ? (
          <>
            <button
              className="p-1.5 hover:bg-primary/20 rounded-md transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                onSaveEdit();
              }}
              aria-label="Save"
            >
              <Check className="h-3.5 w-3.5 text-primary" />
            </button>
            <button
              className="p-1.5 hover:bg-destructive/20 rounded-md transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                onCancelEdit();
              }}
              aria-label="Cancel"
            >
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 hover:bg-background rounded-md transition-colors duration-150"
                onClick={(e) => e.stopPropagation()}
                aria-label="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStartEdit(); }}>
                <Pencil className="h-4 w-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(); }}>
                <Download className="h-4 w-4 mr-2" /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {folders.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Move to folder</div>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssignFolder(null); }}>
                    <X className="h-4 w-4 mr-2" /> No folder
                    {!conv.folderId && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                  {folders.map(folder => (
                    <DropdownMenuItem 
                      key={folder.id} 
                      onClick={(e) => { e.stopPropagation(); onAssignFolder(folder.id); }}
                    >
                      <div className={`w-3 h-3 rounded-full ${folder.color} mr-2`} />
                      {folder.name}
                      {conv.folderId === folder.id && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// Droppable folder
function DroppableFolder({
  folder,
  conversations,
  isExpanded,
  onToggle,
  onDelete,
  activeConvId,
  onSelectConv,
  children,
}: {
  folder: ConversationFolder;
  conversations: Conversation[];
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  activeConvId: string | null;
  onSelectConv: (id: string) => void;
  children?: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  const folderConvs = conversations.filter(c => c.folderId === folder.id);

  return (
    <div ref={setNodeRef} className="mb-1">
      <div
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-all duration-200 group ${
          isOver ? 'bg-primary/20 ring-2 ring-primary/50' : 'hover:bg-sidebar-accent/50'
        }`}
        onClick={onToggle}
      >
        <button className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <div className={`w-3 h-3 rounded-full ${folder.color}`} />
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Folder className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground">{folderConvs.length}</span>
        <button
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded transition-all"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete folder "${folder.name}"? Conversations will be moved to uncategorized.`)) {
              onDelete();
            }
          }}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
      
      {isExpanded && (
        <div className="ml-4 pl-3 border-l border-border/50 space-y-1 py-1">
          {children}
          {folderConvs.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 px-2">
              Drag chats here
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Root drop zone (uncategorized)
function RootDropZone({ children, isOver }: { children: React.ReactNode; isOver: boolean }) {
  return (
    <div className={`space-y-1 ${isOver ? 'bg-primary/10 rounded-lg' : ''}`}>
      {children}
    </div>
  );
}

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onExport,
  isOpen,
  onToggle,
  onSearchOpen,
  folders,
  onCreateFolder,
  onDeleteFolder,
  onAssignFolder,
}: ConversationSidebarProps) {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0].value);
  const [draggedConv, setDraggedConv] = useState<Conversation | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (editingId && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editingId]);

  useEffect(() => {
    if (isCreatingFolder && folderInputRef.current) {
      folderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('Delete this conversation?')) {
      onDelete(id);
    }
  }, [onDelete]);

  const startEditing = useCallback((conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, onRename]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  const toggleFolder = useCallback((folderId: string) => {
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

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  }, [newFolderName, newFolderColor, onCreateFolder]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const conv = conversations.find(c => c.id === active.id);
    if (conv) {
      setDraggedConv(conv);
    }
  }, [conversations]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedConv(null);

    if (!over) return;

    const convId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith('folder-')) {
      const folderId = overId.replace('folder-', '');
      onAssignFolder(convId, folderId);
    } else if (overId === 'root') {
      onAssignFolder(convId, null);
    }
  }, [onAssignFolder]);

  // Get uncategorized conversations
  const uncategorizedConvs = conversations.filter(c => !c.folderId);

  // Droppable root zone
  const { isOver: isOverRoot, setNodeRef: setRootRef } = useDroppable({
    id: 'root',
    data: { type: 'root' },
  });

  const renderConversation = (conv: Conversation) => (
    <DraggableConversation
      key={conv.id}
      conv={conv}
      isActive={activeId === conv.id}
      isEditing={editingId === conv.id}
      editValue={editValue}
      onEditChange={setEditValue}
      onSelect={() => onSelect(conv.id)}
      onStartEdit={() => startEditing(conv)}
      onSaveEdit={saveEdit}
      onCancelEdit={cancelEdit}
      onDelete={() => handleDelete(conv.id)}
      onExport={() => onExport(conv.id)}
      onKeyDown={handleKeyDown}
      inputRef={inputRef}
      folders={folders}
      onAssignFolder={(folderId) => onAssignFolder(conv.id, folderId)}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Mobile Toggle Button */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-card border border-border rounded-lg transition-all duration-200 hover:bg-accent"
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 w-64 h-full md:h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        aria-label="Conversation sidebar"
      >
        {/* Top Actions Block */}
        <div className="flex-shrink-0 p-3 space-y-1.5 border-b border-sidebar-border">
          <button
            onClick={onNew}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            aria-label="Start new chat"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
          
          {onSearchOpen && (
            <button
              onClick={onSearchOpen}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              aria-label="Search conversations"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">Search</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-sidebar-accent rounded font-mono text-muted-foreground">⌘K</kbd>
            </button>
          )}
        </div>

        {/* Conversations Block - Scrollable */}
        <nav 
          ref={setRootRef}
          className={`flex-1 overflow-y-auto scrollbar-thin py-3 ${
            isOverRoot ? 'bg-primary/5' : ''
          }`} 
          aria-label="Conversations"
        >
          {/* Folders Section */}
          {(folders.length > 0 || isCreatingFolder) && (
            <div className="px-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Folders</h3>
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="p-1 hover:bg-sidebar-accent rounded transition-colors"
                  aria-label="Create folder"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Create Folder Form */}
              {isCreatingFolder && (
                <div className="mb-2 p-3 bg-sidebar-accent/80 rounded-xl space-y-3 border border-sidebar-border">
                  <Input
                    ref={folderInputRef}
                    type="text"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') setIsCreatingFolder(false);
                    }}
                    className="h-9 text-sm bg-background border-border focus:border-primary"
                  />
                  <div className="flex items-center gap-2">
                    {FOLDER_COLORS.map(color => (
                      <button
                        key={color.value}
                        className={`w-6 h-6 rounded-full ${color.value} transition-all ${
                          newFolderColor === color.value ? 'ring-2 ring-offset-2 ring-offset-sidebar-accent ring-primary scale-110' : 'hover:scale-110'
                        }`}
                        onClick={() => setNewFolderColor(color.value)}
                        title={color.name}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      className="flex-1 px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create Folder
                    </button>
                    <button
                      onClick={() => setIsCreatingFolder(false)}
                      className="px-3 py-2 text-xs hover:bg-background rounded-lg transition-colors text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Folder List */}
              <div className="space-y-1">
                {folders.map(folder => (
                  <DroppableFolder
                    key={folder.id}
                    folder={folder}
                    conversations={conversations}
                    isExpanded={expandedFolders.has(folder.id)}
                    onToggle={() => toggleFolder(folder.id)}
                    onDelete={() => onDeleteFolder(folder.id)}
                    activeConvId={activeId}
                    onSelectConv={onSelect}
                  >
                    {conversations
                      .filter(c => c.folderId === folder.id)
                      .map(conv => renderConversation(conv))}
                  </DroppableFolder>
                ))}
              </div>
            </div>
          )}

          {/* Chats Section */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {folders.length > 0 ? 'Chats' : 'Recent'}
              </h3>
              {folders.length === 0 && (
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="p-1 hover:bg-sidebar-accent rounded transition-colors"
                  aria-label="Create folder"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              {uncategorizedConvs.length === 0 && folders.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-sidebar-accent flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Click "New chat" to start</p>
                </div>
              ) : (
                uncategorizedConvs.map(conv => renderConversation(conv))
              )}
            </div>
          </div>
        </nav>

        {/* Bottom Block - Settings */}
        <div className="flex-shrink-0 p-3 border-t border-sidebar-border">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-sidebar-accent transition-colors text-sidebar-foreground group"
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span className="flex-1 text-left text-muted-foreground group-hover:text-foreground transition-colors">Settings</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-sidebar-accent rounded font-mono text-muted-foreground">⌘,</kbd>
          </button>
        </div>
      </aside>

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedConv && (
          <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg shadow-lg text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="truncate max-w-48">{draggedConv.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
});
