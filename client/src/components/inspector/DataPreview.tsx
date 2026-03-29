import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useTablePreview } from '@/hooks/useTableDetails';
import { DataGrid, PendingChangesBar, usePendingEdits } from '@/components/data-grid';
import * as sessionState from '@/lib/session-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';
import { buildCsv, buildJson, buildXlsx, exportFile, makeFilename } from '@/lib/export-utils';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Loader2,
  Rows2,
  Rows3,
  X,
} from 'lucide-react';
import type { PendingEdit } from '@/components/data-grid/types';

const PAGE_SIZE = 100;

// Module-level cache so page survives component remounts
const pageCache = new Map<string, number>();

interface Props {
  connectionId: string;
  database: string;
  table: string;
  schema: string;
  primaryKeys?: string[];
  editable?: boolean;
  isActive?: boolean;
}

function DataPreviewSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex-1 p-1">
        {/* Header row */}
        <div className="flex gap-1 mb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 flex-1" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex gap-1 mb-1">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-6 flex-1" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageExportDropdown({ columns, rows, name }: { columns: { name: string }[]; rows: Record<string, any>[]; name: string }) {
  const [exporting, setExporting] = useState(false);

  const withLoading = (fn: () => Promise<void>) => async () => {
    setExporting(true);
    try { await fn(); } finally { setExporting(false); }
  };

  const data = { columns, rows };

  const handleCsv = withLoading(async () => {
    await exportFile(buildCsv(data), makeFilename(name, 'csv'), 'text/csv', 'CSV', ['csv']);
  });
  const handleJson = withLoading(async () => {
    await exportFile(buildJson(data), makeFilename(name, 'json'), 'application/json', 'JSON', ['json']);
  });
  const handleXlsx = withLoading(async () => {
    const buf = await buildXlsx(data);
    await exportFile(buf, makeFilename(name, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
  });

  const btnClass = 'h-5 w-5 p-0';
  const iconClass = 'h-3 w-3';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={btnClass} disabled={exporting}>
          {exporting ? <Loader2 className={`${iconClass} animate-spin`} /> : <Download className={iconClass} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleXlsx}>Excel (XLSX)</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleJson}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DataPreview({ connectionId, database, table, schema, primaryKeys = [], editable = true, isActive = true }: Props) {
  const { t } = useTranslation();
  const cacheKey = `${connectionId}-${database}-${schema}-${table}`;
  const sessionPageKey = `${connectionId}:${database}:preview_page:${schema}.${table}`;
  const sessionEditsKey = `${connectionId}:${database}:pending_edits:${schema}.${table}`;

  // React to session state becoming loaded
  const ssVersion = useSyncExternalStore(sessionState.subscribe, sessionState.getSnapshot);

  const [page, setPageRaw] = useState(() => pageCache.get(cacheKey) ?? 0);

  // Hydrate page from session state when it becomes available
  useEffect(() => {
    if (!sessionState.isLoaded()) return;
    if (pageCache.has(cacheKey)) return; // already has value from user interaction
    const persisted = sessionState.get(sessionPageKey);
    if (persisted) {
      const num = parseInt(persisted, 10);
      if (!isNaN(num) && num > 0) {
        pageCache.set(cacheKey, num);
        setPageRaw(num);
      }
    }
  }, [cacheKey, sessionPageKey, ssVersion]);

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    setPageRaw(prev => {
      const next = typeof p === 'function' ? p(prev) : p;
      pageCache.set(cacheKey, next);
      sessionState.save(sessionPageKey, String(next));
      return next;
    });
  }, [cacheKey, sessionPageKey]);
  const [goToInput, setGoToInput] = useState('');
  const { data: preview, isLoading, isFetching, isStale, dataUpdatedAt, refetch } = useTablePreview(connectionId, database, table, schema, page, PAGE_SIZE);
  const pendingEdits = usePendingEdits(cacheKey, sessionEditsKey);

  const compact = useUIStore((s) => s.compactResults);
  const toggleCompact = useUIStore((s) => s.toggleCompactResults);

  // Re-measure Glide Data Grid canvas when tab becomes active
  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }
  }, [isActive]);

  // Stale data handling
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [droppedNotice, setDroppedNotice] = useState<string | null>(null);

  // Reset dismissed state when data refreshes
  useEffect(() => { setStaleDismissed(false); }, [dataUpdatedAt]);

  // Auto-dismiss dropped notice after 5s
  useEffect(() => {
    if (!droppedNotice) return;
    const t = setTimeout(() => setDroppedNotice(null), 5000);
    return () => clearTimeout(t);
  }, [droppedNotice]);

  // Auto-refetch when stale and no pending edits
  useEffect(() => {
    if (isStale && pendingEdits.editCount === 0 && !isFetching) {
      refetch();
    }
  }, [isStale, pendingEdits.editCount, isFetching, refetch]);

  // Refresh handler with PK-based edit reconciliation
  const handleRefresh = useCallback(async () => {
    const prevRows = preview?.rows;
    const result = await refetch();
    const newRows = result.data?.rows;

    if (!prevRows || !newRows || primaryKeys.length === 0) {
      pendingEdits.clearAll();
      return;
    }

    const pkKey = (row: Record<string, any>) =>
      primaryKeys.map(k => String(row[k] ?? '')).join('\x00');

    const newRowByPK = new Map<string, { idx: number; row: Record<string, any> }>();
    newRows.forEach((row, idx) => newRowByPK.set(pkKey(row), { idx, row }));

    let droppedCount = 0;
    const reconciledEdits = new Map<string, PendingEdit>();

    for (const [, edit] of pendingEdits.edits) {
      const oldRow = prevRows[edit.rowIndex];
      if (!oldRow) { droppedCount++; continue; }

      const match = newRowByPK.get(pkKey(oldRow));
      if (!match) { droppedCount++; continue; }
      if (match.row[edit.column] !== edit.oldValue) { droppedCount++; continue; }

      const newKey = `${match.idx}:${edit.column}`;
      reconciledEdits.set(newKey, { ...edit, rowIndex: match.idx });
    }

    pendingEdits.replaceEdits(reconciledEdits);

    if (droppedCount > 0) {
      setDroppedNotice(t('inspector.changesDropped', { count: droppedCount }));
    }
    setStaleDismissed(false);
  }, [refetch, preview, primaryKeys, pendingEdits]);

  const totalPages = preview ? Math.max(1, Math.ceil(preview.total_rows / PAGE_SIZE)) : 1;

  const goToPage = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(p, totalPages - 1));
    setPage(clamped);
    pendingEdits.clearAll();
  }, [totalPages, pendingEdits]);

  const handleGoToSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(goToInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      goToPage(num - 1);
      setGoToInput('');
    }
  };

  if (isLoading) return <DataPreviewSkeleton />;
  if (!preview?.rows.length && page === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("inspector.dataNotFound")}</div>;
  }

  const startRow = page * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE + (preview?.rows.length ?? 0), preview?.total_rows ?? 0);

  const btnSize = 'h-5 w-5 p-0';
  const iconSize = 'h-3 w-3';

  const toolbar = (
    <div className="flex flex-col border-b shrink-0">
      {/* Row 1: stats + controls */}
      <div className={cn('flex items-center gap-2 px-2', 'py-1')}>
        <span className={cn('text-muted-foreground', 'text-[10px]')}>
          {t('inspector.rowRange', { start: startRow.toLocaleString(), end: endRow.toLocaleString(), total: preview!.total_rows.toLocaleString() })}
        </span>
        {isFetching && !isLoading && (
          <span className="text-[10px] text-muted-foreground animate-pulse">{t('common.loading')}</span>
        )}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={compact ? 'secondary' : 'ghost'} size="sm" className={btnSize} onClick={toggleCompact}>
                {compact ? <Rows2 className={iconSize} /> : <Rows3 className={iconSize} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {compact ? t('inspector.normalView') : t('inspector.compactView')}
            </TooltipContent>
          </Tooltip>

          {preview && preview.rows.length > 0 && (
            <PageExportDropdown columns={preview.columns} rows={preview.rows} name={table} />
          )}
        </div>

        {totalPages > 1 && (
          <>
            <div className="w-px h-3.5 bg-border mx-0.5" />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => goToPage(0)} disabled={page === 0}>
                <ChevronsLeft className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => goToPage(page - 1)} disabled={page === 0}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground px-1">
                {page + 1} / {totalPages}
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => goToPage(totalPages - 1)} disabled={page >= totalPages - 1}>
                <ChevronsRight className="h-3 w-3" />
              </Button>
              <form onSubmit={handleGoToSubmit} className="flex items-center gap-1 ml-1">
                <Input
                  value={goToInput}
                  onChange={(e) => setGoToInput(e.target.value)}
                  placeholder={t("inspector.goTo")}
                  className="h-5 w-14 text-[10px] px-1"
                />
              </form>
            </div>
          </>
        )}
      </div>

    </div>
  );

  const grid = (
    <DataGrid
      columns={preview!.columns}
      rows={preview!.rows}
      totalRows={preview!.total_rows}
      editable={editable}
      compact={compact}
      tableName={table}
      primaryKeys={primaryKeys}
      connectionId={connectionId}
      database={database}
      pendingEditsHook={editable ? pendingEdits : undefined}
    />
  );

  const changesBar = editable && (
    <PendingChangesBar
      edits={pendingEdits.edits}
      editCount={pendingEdits.editCount}
      clearAll={pendingEdits.clearAll}
      tableName={table}
      schemaName={schema}
      primaryKeys={primaryKeys}
      connectionId={connectionId}
      database={database}
      rows={preview!.rows}
      newRows={pendingEdits.newRows}
      columnTypes={Object.fromEntries((preview?.columns || []).map((c: any) => [c.name, c.type || '']))}
    />
  );

  const staleBanner = isStale && pendingEdits.editCount > 0 && !staleDismissed && (
    <div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 shrink-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="flex-1 text-xs text-amber-700 dark:text-amber-400">
        Table data may not be up to date
      </span>
      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={handleRefresh}>
        Refresh
      </Button>
      <button onClick={() => setStaleDismissed(true)}>
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );

  const droppedBanner = droppedNotice && (
    <div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 shrink-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="flex-1 text-xs text-amber-700 dark:text-amber-400">{droppedNotice}</span>
      <button onClick={() => setDroppedNotice(null)}>
        <X className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );

  const content = (
    <div className="flex h-full flex-col">
      {toolbar}
      {staleBanner}
      {droppedBanner}
      {grid}
      {changesBar}
    </div>
  );

  return content;
}
