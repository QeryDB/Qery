import { Plus, LayoutGrid, History, Bookmark, Trash2, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState, useCallback, useRef } from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu';
import { useConnections, useDeleteConnection, useReorderConnections } from '@/hooks/useConnection';
import { useConnectionStore } from '@/stores/connection-store';
import { useUIStore } from '@/stores/ui-store';
import { DiscoveryDialog } from '@/components/connection/DiscoveryDialog';
import { ConnectionSettingsDialog } from '@/components/connection/ConnectionSettingsDialog';
import { cn, getContrastColor, hslToHex, generateColor } from '@/lib/utils';
import type { Connection } from '@/types/connection';

// Database type logo paths (real SVG icons in public/icons/)
const dbTypeIcons: Record<string, string> = {
  mssql: '/icons/mssql.svg',
  postgres: '/icons/pg.svg',
  sqlite: '/icons/sqlite.svg',
};

export function ActivityBar() {
  const { t } = useTranslation();
  const { data: connections } = useConnections();
  const reorderMutation = useReorderConnections();
  const deleteMutation = useDeleteConnection();
  const { activeConnectionId, setActiveConnection } = useConnectionStore();
  const [showDiscoveryDialog, setShowDiscoveryDialog] = useState(false);
  const [settingsConn, setSettingsConn] = useState<Connection | null>(null);
  const { activeSidebarPanel, setSidebarPanel } = useUIStore();

  // DnD state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const handleSelect = (conn: Connection) => {
    setActiveConnection(conn.id, conn.database_name);
  };

  const onDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, dropIdx: number) => {
      e.preventDefault();
      const fromIdx = dragRef.current;
      if (fromIdx === null || fromIdx === dropIdx || !connections) return;

      const reordered = [...connections];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(dropIdx, 0, moved);
      reorderMutation.mutate(reordered.map((c) => c.id));

      setDragIdx(null);
      setOverIdx(null);
      dragRef.current = null;
    },
    [connections, reorderMutation]
  );

  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = null;
  }, []);

  const dbPanelItems = [
    { panel: 'schema' as const, icon: LayoutGrid, label: t('schema.schema') },
    { panel: 'history' as const, icon: History, label: t('schema.history') },
  ];

  return (
    <div className="flex h-full w-12 flex-col items-center border-r bg-muted/30 py-2 gap-1">
      <div className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-1 py-0.5">
        {connections?.map((conn, idx) => {
          const bgColor = conn.color || hslToHex(generateColor(conn.name));
          const textColor = getContrastColor(bgColor);
          const isActive = activeConnectionId === conn.id;
          const isDragging = dragIdx === idx;
          const isOver = overIdx === idx && dragIdx !== idx;
          const dbType = conn.database_type || 'mssql';
          const dbIcon = dbTypeIcons[dbType] || dbTypeIcons.mssql;

          return (
            <ContextMenu key={conn.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    'relative',
                    isDragging && 'opacity-40',
                    isOver && 'ring-2 ring-primary rounded-md'
                  )}
                  draggable
                  onDragStart={(e) => onDragStart(e, idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDrop={(e) => onDrop(e, idx)}
                  onDragEnd={onDragEnd}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSelect(conn)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-md transition-all',
                          isActive
                            ? 'ring-2 ring-foreground/70'
                            : 'opacity-55 hover:opacity-100'
                        )}
                        style={{ backgroundColor: bgColor, color: textColor }}
                      >
                        <img src={dbIcon} alt={dbType} className="h-5 w-5 brightness-0 invert" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs max-w-[220px]">
                      <p className="font-semibold">{conn.name}</p>
                      <p className="text-muted-foreground/60 text-[10px]">{
                        dbType === 'sqlite' ? 'SQLite' : dbType === 'postgres' ? 'PostgreSQL' : 'SQL Server'
                      }</p>
                      {dbType === 'sqlite' ? (
                        <p className="text-muted-foreground truncate">{conn.server}</p>
                      ) : (
                        <>
                          <p className="text-muted-foreground">{conn.server}:{conn.port}</p>
                          {conn.database_name && (
                            <p className="text-muted-foreground">DB: {conn.database_name}</p>
                          )}
                          {conn.auth_type === 'integrated' ? (
                            <p className="text-muted-foreground">{t('connection.windowsAuth')}</p>
                          ) : conn.username ? (
                            <p className="text-muted-foreground">{conn.username}</p>
                          ) : null}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem
                  className="text-xs gap-2"
                  onClick={() => setSettingsConn(conn)}
                >
                  <Settings className="h-3 w-3" />
                  {t('common.settings')}
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-xs gap-2 text-destructive focus:text-destructive"
                  onClick={() => {
                    if (activeConnectionId === conn.id) {
                      setActiveConnection(null);
                    }
                    deleteMutation.mutate(conn.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  {t('common.remove')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      {activeConnectionId && (
        <>
          <div className="w-6 border-t my-1" />
          {dbPanelItems.map(({ panel, icon: Icon, label }) => (
            <button
              key={panel}
              onClick={() => setSidebarPanel(panel)}
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                activeSidebarPanel === panel
                  ? 'text-foreground'
                  : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent'
              )}
              title={label}
            >
              {activeSidebarPanel === panel && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />
              )}
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </>
      )}

      <div className="w-6 border-t my-1" />
      <button
        onClick={() => setSidebarPanel('saved')}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          activeSidebarPanel === 'saved'
            ? 'text-foreground'
            : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent'
        )}
        title={t("layout.savedQueries")}
      >
        {activeSidebarPanel === 'saved' && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />
        )}
        <Bookmark className="h-4 w-4" />
      </button>

      <div className="w-6 border-t my-1" />

      <button
        data-tour="add-connection"
        onClick={() => setShowDiscoveryDialog(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground cursor-pointer"
        style={{ border: '1.5px dashed var(--tw-border-opacity, hsl(var(--border)))' }}
        title={t("connection.addConnection")}
      >
        <Plus className="h-4 w-4" />
      </button>

      <DiscoveryDialog open={showDiscoveryDialog} onOpenChange={setShowDiscoveryDialog} />
      {settingsConn && (
        <ConnectionSettingsDialog
          open={!!settingsConn}
          onOpenChange={(open) => { if (!open) setSettingsConn(null); }}
          connection={settingsConn}
        />
      )}
    </div>
  );
}
