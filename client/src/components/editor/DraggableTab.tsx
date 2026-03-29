import React, { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EditorTab } from '@/stores/editor-store';
import { Code2, Table2, Eye, FunctionSquare, Bookmark, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCachedEditCount } from '@/components/data-grid';

interface Props {
  tab: EditorTab;
  isActive: boolean;
  showClose: boolean;
  onTabClick: (tabId: string) => void;
  onTabClose: (e: React.MouseEvent, tabId: string) => void;
  onTabContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

function isTabDirty(tab: EditorTab): boolean {
  if ((tab.savedQueryId && tab.savedSqlSnapshot !== undefined && tab.sql !== tab.savedSqlSnapshot) ||
      (!tab.savedQueryId && tab.type === 'query' && tab.sql.trim().length > 0)) {
    return true;
  }
  if (tab.type === 'inspector' && tab.inspectorTarget) {
    const { connectionId, database, schema, table } = tab.inspectorTarget;
    return getCachedEditCount(`${connectionId}-${database}-${schema}-${table}`) > 0;
  }
  return false;
}

export const DraggableTab = React.memo(function DraggableTab({ tab, isActive, showClose, onTabClick, onTabClose, onTabContextMenu }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleClick = useCallback(() => onTabClick(tab.id), [tab.id, onTabClick]);
  const handleClose = useCallback((e: React.MouseEvent) => onTabClose(e, tab.id), [tab.id, onTabClose]);
  const handleContextMenu = useCallback((e: React.MouseEvent) => onTabContextMenu(e, tab.id), [tab.id, onTabContextMenu]);

  const dirty = isTabDirty(tab);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-tab-id={tab.id}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative flex items-center gap-1.5 px-3 text-xs cursor-pointer select-none transition-colors shrink-0 border-b-2',
        isActive && 'text-foreground font-medium border-primary bg-background',
        !isActive && 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent',
      )}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <TabIcon tab={tab} />
      <span className={cn('truncate max-w-[120px]', tab.isExecuting && 'text-yellow-500')}>
        {tab.title}
      </span>
      {/* VS Code-style close/dirty indicator: dot when dirty, X on hover — both in the same slot */}
      {showClose && (
        <button
          className="relative flex items-center justify-center h-4 w-4 shrink-0 rounded hover:bg-accent"
          onClick={handleClose}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {dirty && (
            <span className="h-2 w-2 rounded-full bg-yellow-500 group-hover:hidden" />
          )}
          <X className={cn('h-3 w-3', dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100')} />
        </button>
      )}
    </div>
  );
});

function TabIcon({ tab }: { tab: EditorTab }) {
  if (tab.type === 'inspector') {
    const objType = tab.inspectorTarget?.objectType;
    if (objType === 'view') return <Eye className="h-3 w-3 shrink-0 text-purple-500" />;
    if (objType === 'procedure') return <Code2 className="h-3 w-3 shrink-0 text-orange-500" />;
    if (objType === 'function') return <FunctionSquare className="h-3 w-3 shrink-0 text-teal-500" />;
    return <Table2 className="h-3 w-3 shrink-0 text-blue-500" />;
  }
  if (tab.savedQueryId) {
    return <Bookmark className="h-3 w-3 shrink-0 text-yellow-500" />;
  }
  return <Code2 className="h-3 w-3 shrink-0 text-muted-foreground" />;
}

export function DraggableTabOverlay({ tab }: { tab: EditorTab }) {
  return (
    <div className="flex items-center gap-1 border rounded bg-background px-3 py-1 text-xs shadow-lg">
      <TabIcon tab={tab} />
      <span className="truncate max-w-[120px]">{tab.title}</span>
    </div>
  );
}
