import { useConnectionStore } from '@/stores/connection-store';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '@/stores/editor-store';
import { useConnections } from '@/hooks/useConnection';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { Database, Clock, Rows3 } from 'lucide-react';

export function StatusBar() {
  const { t } = useTranslation();
  const { activeConnectionId, activeDatabase } = useConnectionStore();
  const activeResult = useEditorStore((s) => {
    const group = s.layout.groups.find((g) => g.id === s.layout.focusedGroupId);
    if (!group?.activeTabId) return null;
    return s.tabs.find((t) => t.id === group.activeTabId)?.result ?? null;
  });
  const { data: connections } = useConnections();
  const status = useConnectionStatus(activeConnectionId);

  const activeConn = connections?.find((c) => c.id === activeConnectionId);

  const statusColor = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    checking: 'bg-yellow-500 animate-pulse',
    unknown: 'bg-gray-400',
  }[status.status];

  return (
    <div className="flex h-6 items-center gap-4 border-t bg-primary dark:bg-card px-3 text-[11px] text-primary-foreground dark:text-muted-foreground">
      {activeConn && (
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${statusColor}`} />
          <Database className="h-3 w-3" />
          {activeConn.server}{activeDatabase ? `/${activeDatabase}` : ''}
          {status.latency != null && <span className="opacity-60">({status.latency}ms)</span>}
        </span>
      )}
      <div className="flex-1" />
      {activeResult && (
        <>
          <span className="flex items-center gap-1">
            <Rows3 className="h-3 w-3" />
            {t("common.rowCount", { count: activeResult.row_count })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {activeResult.duration_ms}ms
          </span>
        </>
      )}
    </div>
  );
}
