import { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  RefreshCw, Check, X, Search, ArrowLeft, CheckCheck, AlertTriangle,
  FileText, Hash, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection-store';
import { useUIStore } from '@/stores/ui-store';
import {
  useDescriptions,
  useDescriptionStats,
  useDescriptionObjects,
  useParseDescriptions,
  useUpdateDescription,
  useBulkUpdateDescriptions,
  type ParsedDescription,
} from '@/hooks/useDescriptions';

const ROW_HEIGHT = 40;

export function DescriptionsPage() {
  const { t } = useTranslation();
  const connectionId = useConnectionStore((s) => s.activeConnectionId);
  const database = useConnectionStore((s) => s.activeDatabase);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [statusFilter, setStatusFilter] = useState('all');
  const [objectFilter, setObjectFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(val), 200);
  };

  const filters = useMemo(() => ({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: searchDebounced || undefined,
    object: objectFilter !== 'all' ? objectFilter : undefined,
  }), [statusFilter, searchDebounced, objectFilter]);

  const { data: rows = [], isLoading } = useDescriptions(connectionId, database, filters);
  const { data: stats } = useDescriptionStats(connectionId, database);
  const { data: objects = [] } = useDescriptionObjects(connectionId, database);
  const parseMutation = useParseDescriptions();
  const updateMutation = useUpdateDescription();
  const bulkMutation = useBulkUpdateDescriptions();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const handleParse = () => {
    if (!connectionId || !database) return;
    parseMutation.mutate({ connectionId, database });
  };

  const handleConfirm = (row: ParsedDescription) => {
    if (!connectionId || !database) return;
    updateMutation.mutate({
      connectionId, database, descId: row.id, status: 'confirmed',
      confirmed_description: row.confirmed_description || row.parsed_description || row.source_column_clean || row.column_alias,
    });
  };

  const handleDismiss = (row: ParsedDescription) => {
    if (!connectionId || !database) return;
    updateMutation.mutate({ connectionId, database, descId: row.id, status: 'dismissed' });
  };

  const handleBulkConfirm = () => {
    if (!connectionId || !database || selectedIds.size === 0) return;
    bulkMutation.mutate({ connectionId, database, ids: Array.from(selectedIds), status: 'confirmed' }, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const handleBulkDismiss = () => {
    if (!connectionId || !database || selectedIds.size === 0) return;
    bulkMutation.mutate({ connectionId, database, ids: Array.from(selectedIds), status: 'dismissed' }, {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const startEdit = (row: ParsedDescription) => {
    setEditingId(row.id);
    setEditValue(row.confirmed_description || row.parsed_description || '');
  };

  const saveEdit = useCallback(() => {
    if (editingId == null || !connectionId || !database) return;
    updateMutation.mutate(
      { connectionId, database, descId: editingId, status: 'confirmed', confirmed_description: editValue },
      { onSuccess: () => setEditingId(null) }
    );
  }, [editingId, editValue, connectionId, database, updateMutation]);

  const parseFlags = (flagsJson: string): string[] => {
    try { return JSON.parse(flagsJson); } catch { return []; }
  };

  if (!connectionId || !database) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a database
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => setCurrentView('editor')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">{t("descriptions.columnDescriptions")}</h2>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleParse}
          disabled={parseMutation.isPending}
        >
          {parseMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Scan Descriptions
        </Button>
        {parseMutation.data && (
          <span className="text-xs text-muted-foreground">
            {t('descriptions.parsedInserted', { inserted: parseMutation.data.inserted, preserved: parseMutation.data.preserved })}
          </span>
        )}
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="flex items-center gap-3 border-b px-4 py-1.5 text-xs shrink-0">
          <span className="text-muted-foreground">{t('descriptions.total', { count: stats.total })}</span>
          <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-300">
            <Check className="h-2.5 w-2.5" /> {stats.confirmed} approved
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
            <FileText className="h-2.5 w-2.5" /> {stats.pending} pending
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-300">
            <AlertTriangle className="h-2.5 w-2.5" /> {stats.no_description} no description
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1 text-purple-600 border-purple-300">
            <Hash className="h-2.5 w-2.5" /> {stats.has_msg_alias} msg kodu
          </Badge>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 border-b px-4 py-2 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-xs"
            placeholder={t("descriptions.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("descriptions.all")}</SelectItem>
            <SelectItem value="pending">{t("descriptions.pendingStatus")}</SelectItem>
            <SelectItem value="confirmed">{t("descriptions.confirmedStatus")}</SelectItem>
            <SelectItem value="dismissed">{t("descriptions.dismissedStatus")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={objectFilter} onValueChange={setObjectFilter}>
          <SelectTrigger className="h-7 w-[200px] text-xs">
            <SelectValue placeholder={t("descriptions.filterObject")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("descriptions.allObjects")}</SelectItem>
            {objects.map((o) => (
              <SelectItem key={o.object_name} value={o.object_name}>
                <span className="flex items-center gap-1.5">
                  <TypeBadge type={o.object_type} />
                  <span className="truncate">{o.object_name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-muted-foreground">{t('common.selected', { count: selectedIds.size })}</span>
            <Button size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={handleBulkConfirm} disabled={bulkMutation.isPending}>
              <CheckCheck className="h-3 w-3" /> {t('descriptions.approve')}
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={handleBulkDismiss} disabled={bulkMutation.isPending}>
              <X className="h-3 w-3" /> {t('common.hide')}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-full items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm text-muted-foreground">{t("descriptions.loadingDescriptions")}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-8 w-8 opacity-40" />
          {stats?.total === 0
            ? t('descriptions.startByScanning')
            : t('descriptions.noFilterResults')}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Table header */}
          <div className="grid shrink-0 border-b bg-muted text-[10px] font-medium text-muted-foreground"
            style={{ gridTemplateColumns: '32px 1fr 1fr 1fr 1.5fr 1.5fr 80px 70px' }}>
            <div className="flex items-center justify-center px-1 py-1.5">
              <input
                type="checkbox"
                className="h-3 w-3"
                checked={selectedIds.size === rows.length && rows.length > 0}
                onChange={toggleSelectAll}
              />
            </div>
            <div className="px-2 py-1.5">{t("descriptions.objectHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.aliasHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.sourceColumnHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.parsedDescriptionHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.confirmedDescriptionHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.statusHeader")}</div>
            <div className="px-2 py-1.5">{t("descriptions.actionHeader")}</div>
          </div>

          {/* Virtualized rows */}
          <div ref={parentRef} className="flex-1 overflow-auto">
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                const flags = parseFlags(row.flags);
                const hasMsgAlias = flags.includes('has_msg_alias');
                const noDesc = flags.includes('no_description');
                const isEditing = editingId === row.id;

                return (
                  <div
                    key={row.id}
                    className={cn(
                      'grid items-center border-b border-border/50 text-xs',
                      'hover:bg-accent/50',
                      selectedIds.has(row.id) && 'bg-accent/30',
                      row.status === 'confirmed' && 'bg-green-500/5',
                      row.status === 'dismissed' && 'opacity-50',
                    )}
                    style={{
                      gridTemplateColumns: '32px 1fr 1fr 1fr 1.5fr 1.5fr 80px 70px',
                      height: `${ROW_HEIGHT}px`,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="flex items-center justify-center px-1">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                      />
                    </div>
                    <div className="px-2 truncate flex items-center gap-1">
                      <TypeBadge type={row.object_type} />
                      <span className="truncate font-mono text-[10px]">{row.object_name}</span>
                    </div>
                    <div className="px-2 truncate font-mono">
                      <span className={cn(hasMsgAlias && 'text-amber-500')}>{row.column_alias}</span>
                    </div>
                    <div className="px-2 truncate font-mono text-muted-foreground">
                      {row.source_column_clean || row.source_expression || '-'}
                    </div>
                    <div className="px-2 truncate">
                      {row.parsed_description ? (
                        <span>{row.parsed_description}</span>
                      ) : (
                        <span className={cn('italic', noDesc ? 'text-red-400' : 'text-muted-foreground')}>
                          {noDesc ? t('descriptions.noDescriptionLabel') : '-'}
                        </span>
                      )}
                    </div>
                    <div className="px-2 truncate">
                      {isEditing ? (
                        <Input
                          className="h-6 text-xs"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={saveEdit}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={cn(
                            'cursor-pointer hover:underline',
                            row.confirmed_description ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground italic'
                          )}
                          onClick={() => startEdit(row)}
                        >
                          {row.confirmed_description || t('descriptions.clickToEdit')}
                        </span>
                      )}
                    </div>
                    <div className="px-2">
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="px-2 flex items-center gap-0.5">
                      {row.status !== 'confirmed' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-5 w-5 text-green-600"
                          onClick={() => handleConfirm(row)}
                          title={t("common.confirm")}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      {row.status !== 'dismissed' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-5 w-5 text-red-500"
                          onClick={() => handleDismiss(row)}
                          title={t("common.hide")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    view: 'text-purple-500 bg-purple-500/10',
    procedure: 'text-orange-500 bg-orange-500/10',
    function: 'text-teal-500 bg-teal-500/10',
  };
  const labels: Record<string, string> = {
    view: 'V',
    procedure: 'P',
    function: 'F',
  };
  return (
    <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded shrink-0', colors[type] || '')}>
      {labels[type] || type[0]?.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === 'confirmed') return <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-600 border-green-300">{t('descriptions.confirmedBadge')}</Badge>;
  if (status === 'dismissed') return <Badge variant="outline" className="text-[9px] px-1 py-0 text-gray-500 border-gray-300">{t('descriptions.dismissedBadge')}</Badge>;
  return <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">{t("descriptions.pendingBadge")}</Badge>;
}
