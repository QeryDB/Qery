import { Search, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUIStore } from '@/stores/ui-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useEditorStore } from '@/stores/editor-store';
import { useConnections, useDatabases } from '@/hooks/useConnection';
import { modKey, hslToHex, generateColor, isMac } from '@/lib/utils';
import { WindowControls } from './WindowControls';
import { UserAvatar } from '@/components/shared/UserAvatar';

export function TopBar() {
  const { t } = useTranslation();
  const { setCommandPaletteOpen } = useUIStore();
  const { activeConnectionId, activeDatabase, setActiveDatabase, setActiveConnection } = useConnectionStore();
  const { data: connections } = useConnections();
  const { data: databases } = useDatabases(activeConnectionId);

  const activeConn = connections?.find((c) => c.id === activeConnectionId);

  // Get the focused tab's context for inspector tabs
  const focusedTab = useEditorStore((s) => {
    const focusedGroupId = s.layout.focusedGroupId;
    const group = s.layout.groups.find((g) => g.id === focusedGroupId);
    if (!group?.activeTabId) return null;
    return s.tabs.find((t) => t.id === group.activeTabId) ?? null;
  });

  const isInspectorTab = focusedTab?.type === 'inspector';
  const inspectorTarget = isInspectorTab ? focusedTab?.inspectorTarget : null;

  // For inspector tabs, show their specific connection context
  const displayConn = inspectorTarget
    ? connections?.find((c) => c.id === inspectorTarget.connectionId)
    : activeConn;
  const displayDb = inspectorTarget ? inspectorTarget.database : activeDatabase;

  const connColor = displayConn?.color || (displayConn ? hslToHex(generateColor(displayConn.name)) : undefined);

  return (
    <div data-tauri-drag-region className="flex h-14 items-center gap-4 border-b bg-background px-2">
      {/* Logo */}
      <div className="flex items-center shrink-0 pl-2">
        <img src="/qery-logo.png" alt="Qery" className="h-8 dark:hidden" />
        <img src="/qery-logo-dark.png" alt="Qery" className="h-8 hidden dark:block" />
      </div>

      <div className="flex-1" />

      {/* Search */}
      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex w-[260px] h-[30px] items-center gap-2 rounded-lg border bg-muted/30 px-2.5 text-xs text-muted-foreground hover:bg-accent transition-colors shrink-0"
      >
        <Search className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left truncate">{t('editor.commandOrSearch')}</span>
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground opacity-70 shrink-0">
          {modKey}K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* Connection + Database context */}
      <div className="flex items-center gap-1.5 shrink-0">
        {displayConn && (
          <>
            {/* Connection chip */}
            <Tooltip>
              <TooltipTrigger asChild>
                {!isInspectorTab && connections && connections.length > 1 ? (
                  <Select value={activeConnectionId || ''} onValueChange={(id) => {
                    const conn = connections.find(c => c.id === id);
                    setActiveConnection(id, conn?.database_name || null);
                  }}>
                    <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent gap-1 px-1.5 w-auto max-w-[140px] focus:ring-0 focus:ring-offset-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: connColor }} />
                        <span className="truncate">{displayConn.name}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map(c => {
                        const color = c.color || hslToHex(generateColor(c.name));
                        return (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              {c.name}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: connColor }} />
                    <span className="truncate max-w-[120px]">{displayConn.name}</span>
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {displayConn.server}:{displayConn.port}
                {displayConn.auth_type === 'integrated' ? ' (Windows)' : ` (${displayConn.username})`}
              </TooltipContent>
            </Tooltip>

            <span className="text-muted-foreground/30 text-[10px]">/</span>

            {/* Database chip */}
            {!isInspectorTab && databases && databases.length > 0 ? (
              <Select value={displayDb || ''} onValueChange={setActiveDatabase}>
                <SelectTrigger className="h-6 text-[11px] border-0 bg-transparent gap-1 px-1.5 w-auto max-w-[160px] focus:ring-0 focus:ring-offset-0">
                  <div className="flex items-center gap-1 truncate">
                    <Database className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{displayDb || t('connection.selectDatabase')}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {databases.map(db => {
                    const name = typeof db === 'string' ? db : (db as any).name || String(db);
                    return (
                      <SelectItem key={name} value={name} className="text-xs">
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              displayDb && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground">
                  <Database className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{displayDb}</span>
                </span>
              )
            )}
          </>
        )}
      </div>

      {/* Separator */}
      {displayConn && <div className="h-5 w-px bg-border shrink-0" />}

      {/* User avatar (theme toggle moved to UserAvatar dropdown) */}
      <UserAvatar />

      {!isMac && (
        <>
          <div className="h-5 w-px bg-border shrink-0" />
          <WindowControls />
        </>
      )}
    </div>
  );
}

