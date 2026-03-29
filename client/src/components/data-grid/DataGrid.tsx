import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DataEditor, {
  GridCellKind,
  type GridColumn,
  type GridCell,
  type Item,
  type EditableGridCell,
  type DrawHeaderCallback,
  type DrawCellCallback,
  type DataEditorRef,
} from '@glideapps/glide-data-grid';
import { useUIStore } from '@/stores/ui-store';
import { buildGridTheme } from './theme';
import { mssqlTypeToKind, jsTypeToKind, valueToCellContent, cellValueToRaw, coerceToColumnType, isJsonString } from './cell-mapping';
import { usePendingEdits } from './use-pending-edits';
import { useGridPipeline } from './use-grid-pipeline';
import { GridToolbar } from './GridToolbar';
import { SearchBar } from './SearchBar';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { JsonViewerDialog } from '@/components/results/JsonViewerDialog';
import type { DataGridConfig, SortState } from './types';

interface Props extends DataGridConfig {
  pendingEditsHook?: ReturnType<typeof usePendingEdits>;
  durationMs?: number;
}

const CHAR_WIDTH = 7.5;
const MIN_COL_WIDTH = 80;
const MAX_COL_WIDTH = 400;
const COL_PADDING = 32;

function computeAutoWidths(
  dataCols: { name: string; type: string }[],
  rows: Record<string, any>[],
  sampleSize = 50
): Record<string, number> {
  const widths: Record<string, number> = {};
  const sampleRows = rows.slice(0, sampleSize);

  for (const col of dataCols) {
    let maxLen = col.name.length;
    for (const row of sampleRows) {
      const val = row[col.name];
      const len = val === null || val === undefined ? 4 : String(val).length;
      if (len > maxLen) maxLen = len;
    }
    widths[col.name] = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxLen * CHAR_WIDTH + COL_PADDING));
  }

  return widths;
}

export function DataGrid({
  columns: dataCols,
  rows,
  totalRows,
  editable = false,
  compact = false,
  onSort,
  pendingEditsHook,
  tableName,
  connectionId,
  database,
  durationMs,
}: Props) {
  const theme = useUIStore((s) => s.theme);
  const [gridTheme, setGridTheme] = useState(() => buildGridTheme(theme === 'dark', compact));
  useEffect(() => {
    requestAnimationFrame(() => {
      setGridTheme(buildGridTheme(theme === 'dark', compact));
    });
  }, [theme, compact]);
  const stripeBg = theme === 'dark' ? '#18181b' : '#f8f9fa';
  const getRowThemeOverride = useCallback(
    (row: number) => (row % 2 === 1 ? { bgCell: stripeBg } : undefined),
    [stripeBg],
  );

  const [sort, setSort] = useState<SortState | null>(null);
  const [jsonViewer, setJsonViewer] = useState<{ value: string; column: string } | null>(null);

  const autoWidths = useMemo(() => computeAutoWidths(dataCols, rows), [dataCols, rows]);
  const [userWidths, setUserWidths] = useState<Record<string, number>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const pendingEdits = pendingEditsHook;

  /* ── Pipeline ── */
  const persistKey = tableName && database
    ? `grid-prefs:${connectionId ?? 'local'}:${database}:${tableName}`
    : undefined;
  const pipeline = useGridPipeline({ columns: dataCols, rows, persistKey });

  const {
    processedColumns,
    processedRows,
    originalRowIndex,
    highlightRegions,
    hiddenColumns,
    filters,
    showSearch,
    searchTerm,
    searchMatches,
    currentMatchIdx,
  } = pipeline;

  /* ── Scroll to current search match ── */
  useEffect(() => {
    if (searchMatches.length === 0 || !gridRef.current) return;
    const match = searchMatches[currentMatchIdx];
    if (!match) return;
    gridRef.current.scrollTo(match.col, match.row);
  }, [currentMatchIdx, searchMatches]);

  /* ── Filter popover state ── */
  const [filterPopover, setFilterPopover] = useState<{
    column: string;
    x: number;
    y: number;
  } | null>(null);

  // Close filter popover on outside click or Escape
  useEffect(() => {
    if (!filterPopover) return;
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-filter-popover]')) return;
      setFilterPopover(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterPopover(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [filterPopover]);

  /* ── Ctrl+F to open search ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        pipeline.setShowSearch(true);
      }
    };
    el.addEventListener('keydown', handler, true);
    return () => el.removeEventListener('keydown', handler, true);
  }, [pipeline.setShowSearch]);

  /* ── Grid columns ── */
  const gridColumns: GridColumn[] = useMemo(() => {
    return processedColumns.map((col) => ({
      id: col.name,
      title: col.name.toUpperCase(),
      width: userWidths[col.name] ?? autoWidths[col.name] ?? 120,
      grow: 0,
    }));
  }, [processedColumns, autoWidths, userWidths]);

  /* ── Row count ── */
  const hasActiveFilters = filters.size > 0;
  const showNewRowSlots = editable && pendingEdits && !hasActiveFilters;
  const displayRowCount =
    processedRows.length + (showNewRowSlots ? pendingEdits.newRowSlots : 0);

  /* ── Cell content ── */
  const getCellContent = useCallback(
    ([colIdx, rowIdx]: Item): GridCell => {
      const col = processedColumns[colIdx];
      if (!col) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false, readonly: true };
      }

      // New row area
      if (editable && pendingEdits && rowIdx >= processedRows.length) {
        const newRowIndex = rowIdx - processedRows.length;
        if (pendingEdits.hasNewRowData(newRowIndex)) {
          const value = pendingEdits.getNewRowValue(newRowIndex, col.name);
          if (value !== null) {
            const kind = col.type ? mssqlTypeToKind(col.type) : jsTypeToKind(value);
            const cell = valueToCellContent(value, kind, true);
            return {
              ...cell,
              themeOverride: {
                ...(cell.themeOverride || {}),
                bgCell: theme === 'dark' ? '#1a3a1a' : '#f0fdf4',
              },
            } as GridCell;
          }
        }
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          allowOverlay: true,
          readonly: false,
        };
      }

      if (rowIdx >= processedRows.length) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false, readonly: true };
      }

      // Map to original row index for pending edits
      const origIdx = originalRowIndex(rowIdx);

      if (pendingEdits?.hasEdit(origIdx, col.name)) {
        const editedValue = pendingEdits.getEditedValue(origIdx, col.name);
        const kind = col.type ? mssqlTypeToKind(col.type) : jsTypeToKind(editedValue);
        const cell = valueToCellContent(editedValue, kind, editable);
        return {
          ...cell,
          themeOverride: {
            ...(cell.themeOverride || {}),
            bgCell: theme === 'dark' ? '#1a2744' : '#eff6ff',
          },
        } as GridCell;
      }

      const value = processedRows[rowIdx][col.name];
      const kind = col.type ? mssqlTypeToKind(col.type) : jsTypeToKind(value);
      return valueToCellContent(value, kind, editable);
    },
    [processedColumns, processedRows, editable, pendingEdits, theme, originalRowIndex],
  );

  /* ── Cell editing ── */
  const onCellEdited = useCallback(
    ([colIdx, rowIdx]: Item, newCell: EditableGridCell) => {
      if (!pendingEdits) return;
      const col = processedColumns[colIdx];
      if (!col) return;

      const rawValue = cellValueToRaw(newCell);
      const { valid, value: newValue } = col.type
        ? coerceToColumnType(rawValue, col.type)
        : { valid: true, value: rawValue };
      if (!valid) return; // reject invalid type

      if (rowIdx >= processedRows.length) {
        const newRowIndex = rowIdx - processedRows.length;
        pendingEdits.addNewRowEdit(newRowIndex, col.name, newValue);
        return;
      }

      const origIdx = originalRowIndex(rowIdx);
      const oldValue = rows[origIdx][col.name];
      pendingEdits.addEdit(origIdx, col.name, oldValue, newValue);
    },
    [processedColumns, processedRows, rows, pendingEdits, originalRowIndex],
  );

  /* ── Paste ── */
  const onPasteHandler = useCallback(
    (target: Item, values: readonly (readonly string[])[]): boolean => {
      if (!pendingEdits || !editable) return false;

      const [startCol, startRow] = target;

      for (let rowOffset = 0; rowOffset < values.length; rowOffset++) {
        const rowIdx = startRow + rowOffset;
        const rowValues = values[rowOffset];

        for (let colOffset = 0; colOffset < rowValues.length; colOffset++) {
          const colIdx = startCol + colOffset;
          const col = processedColumns[colIdx];
          if (!col) continue;

          const pastedStr = rowValues[colOffset];
          const { valid, value } = col.type
            ? coerceToColumnType(pastedStr, col.type)
            : { valid: true, value: pastedStr };
          if (!valid) continue; // skip invalid pasted values

          if (rowIdx >= processedRows.length) {
            const newRowIndex = rowIdx - processedRows.length;
            pendingEdits.addNewRowEdit(newRowIndex, col.name, value);
          } else {
            const origIdx = originalRowIndex(rowIdx);
            const oldValue = rows[origIdx][col.name];
            pendingEdits.addEdit(origIdx, col.name, oldValue, value);
          }
        }
      }

      return false;
    },
    [pendingEdits, editable, processedColumns, processedRows, rows, originalRowIndex],
  );

  /* ── Cell activation (JSON viewer) ── */
  const onCellActivated = useCallback(
    ([colIdx, rowIdx]: Item) => {
      if (rowIdx >= processedRows.length) return;
      const col = processedColumns[colIdx];
      if (!col) return;
      const origIdx = originalRowIndex(rowIdx);
      const value = pendingEdits?.hasEdit(origIdx, col.name)
        ? pendingEdits.getEditedValue(origIdx, col.name)
        : processedRows[rowIdx][col.name];
      const isObj = value !== null && typeof value === 'object';
      if (isObj || isJsonString(value)) {
        setJsonViewer({ value: isObj ? JSON.stringify(value) : String(value), column: col.name });
      }
    },
    [processedColumns, processedRows, pendingEdits, originalRowIndex],
  );

  /* ── Column resize ── */
  const onColumnResize = useCallback(
    (col: GridColumn, newSize: number) => {
      setUserWidths((prev) => ({ ...prev, [col.id as string]: newSize }));
    },
    [],
  );

  /* ── Sort ── */
  const onHeaderClicked = useCallback(
    (colIdx: number) => {
      if (!onSort) return;
      const col = processedColumns[colIdx];
      if (!col) return;
      setSort((prev) => {
        let next: SortState | null;
        if (prev?.column === col.name) {
          if (prev.direction === 'asc') next = { column: col.name, direction: 'desc' };
          else next = null;
        } else {
          next = { column: col.name, direction: 'asc' };
        }
        onSort(next);
        return next;
      });
    },
    [processedColumns, onSort],
  );

  /* ── Header context menu → filter popover ── */
  const handleHeaderContextMenu = useCallback(
    (colIdx: number, event: any) => {
      event.preventDefault();
      const col = processedColumns[colIdx];
      if (!col) return;
      const bounds = event.bounds;
      const wrapper = gridWrapperRef.current;
      if (!wrapper || !bounds) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      setFilterPopover({
        column: col.name,
        x: wrapperRect.left + bounds.x,
        y: wrapperRect.top + bounds.y + bounds.height,
      });
    },
    [processedColumns],
  );

  /* ── Draw header (sort arrow + filter dot) ── */
  const filteredColumnsSet = useMemo(() => new Set(filters.keys()), [filters]);

  const drawHeader: DrawHeaderCallback = useCallback(
    (args, drawContent) => {
      drawContent();

      const { ctx, rect, column, theme: cellTheme } = args;
      const colId = column.id as string;

      // Filter indicator dot
      if (filteredColumnsSet.has(colId)) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(rect.x + 8, rect.y + rect.height / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sort arrow
      if (sort && sort.column === colId) {
        const arrow = sort.direction === 'asc' ? '\u25B2' : '\u25BC';
        ctx.fillStyle = cellTheme.textHeader;
        ctx.font = '10px sans-serif';
        const arrowWidth = ctx.measureText(arrow).width;
        ctx.fillText(arrow, rect.x + rect.width - arrowWidth - 8, rect.y + rect.height / 2 + 4);
      }
    },
    [sort, filteredColumnsSet],
  );

  /* ── Draw cell (JSON badge) ── */
  const drawCell: DrawCellCallback = useCallback(
    (args, drawContent) => {
      const { ctx, rect, cell } = args;
      if (cell.kind !== GridCellKind.Text || !cell.data || !isJsonString(cell.data)) {
        drawContent();
        return;
      }

      const badgeText = 'JSON';
      const badgeFont = 'bold 8px sans-serif';
      const badgePadX = 4;
      const badgeH = 14;
      const badgeRadius = 3;
      const gap = 6;

      ctx.save();
      ctx.font = badgeFont;
      const textWidth = ctx.measureText(badgeText).width;
      const badgeW = textWidth + badgePadX * 2;

      const bx = rect.x + 8;
      const by = rect.y + (rect.height - badgeH) / 2;

      ctx.beginPath();
      ctx.roundRect(bx, by, badgeW, badgeH, badgeRadius);
      const isDark = gridTheme.bgCell !== '#ffffff' && gridTheme.bgCell !== '#fff';
      ctx.fillStyle = isDark ? '#2d3a52' : '#e0e7ff';
      ctx.fill();

      ctx.fillStyle = isDark ? '#93a3f8' : '#4f5fad';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + badgeW / 2, by + badgeH / 2);
      ctx.restore();

      const offset = badgeW + gap;
      const clipped = { ...rect, x: rect.x + offset, width: rect.width - offset };
      ctx.save();
      ctx.beginPath();
      ctx.rect(clipped.x, clipped.y, clipped.width, clipped.height);
      ctx.clip();

      ctx.font = '12px JetBrains Mono, Fira Code, monospace';
      ctx.fillStyle = gridTheme.textDark ?? '#333';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.displayData, clipped.x + 2, rect.y + rect.height / 2);
      ctx.restore();

      return true;
    },
    [gridTheme],
  );

  /* ── Truly empty (no raw data at all) ── */
  if (rows.length === 0 && (!editable || !pendingEdits)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 overflow-hidden"
      style={{ minHeight: 0 }}
      tabIndex={-1}
    >
      <GridToolbar
        columns={dataCols}
        hiddenColumns={hiddenColumns}
        filters={filters}
        onToggleColumn={pipeline.toggleColumn}
        onShowAll={pipeline.showAll}
        onHideAll={pipeline.hideAll}
        onRemoveFilter={pipeline.removeFilter}
        onClearFilters={pipeline.clearFilters}
        showSearch={showSearch}
        onToggleSearch={() => pipeline.setShowSearch(!showSearch)}
        totalRows={rows.length}
        filteredRows={processedRows.length}
      />

      {showSearch && (
        <SearchBar
          searchTerm={searchTerm}
          onSearchChange={pipeline.setSearchTerm}
          matchCount={searchMatches.length}
          currentMatchIdx={currentMatchIdx}
          onNext={pipeline.nextMatch}
          onPrev={pipeline.prevMatch}
          onClose={() => pipeline.setShowSearch(false)}
          caseSensitive={pipeline.searchCaseSensitive}
          onToggleCaseSensitive={() => pipeline.setSearchCaseSensitive(!pipeline.searchCaseSensitive)}
          wholeWord={pipeline.searchWholeWord}
          onToggleWholeWord={() => pipeline.setSearchWholeWord(!pipeline.searchWholeWord)}
          normalize={pipeline.searchNormalize}
          onToggleNormalize={() => pipeline.setSearchNormalize(!pipeline.searchNormalize)}
        />
      )}

      {displayRowCount === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No filter results found
        </div>
      ) : (
        <div ref={gridWrapperRef} className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <DataEditor
            ref={gridRef}
            columns={gridColumns}
            rows={displayRowCount}
            getCellContent={getCellContent}
            getCellsForSelection={true}
            onPaste={editable ? onPasteHandler : true}
            theme={gridTheme}
            width="100%"
            height="100%"
            smoothScrollX
            smoothScrollY
            getRowThemeOverride={getRowThemeOverride}
            rowMarkers="none"
            rowHeight={compact ? 28 : 44}
            headerHeight={compact ? 30 : 44}
            onColumnResize={onColumnResize}
            onHeaderClicked={onHeaderClicked}
            onHeaderContextMenu={handleHeaderContextMenu}
            drawHeader={drawHeader}
            drawCell={drawCell}
            onCellEdited={editable ? onCellEdited : undefined}
            onCellActivated={onCellActivated}
            cellActivationBehavior={editable ? 'second-click' : 'double-click'}
            highlightRegions={highlightRegions}
          />
        </div>
      )}

      {jsonViewer && (
        <JsonViewerDialog
          open
          onOpenChange={() => setJsonViewer(null)}
          value={jsonViewer.value}
          columnName={jsonViewer.column}
        />
      )}

      {filterPopover && (
        <div
          data-filter-popover
          className="fixed z-50"
          style={{ left: filterPopover.x, top: filterPopover.y }}
        >
          <ColumnFilterPopover
            columnName={filterPopover.column}
            activeFilter={filters.get(filterPopover.column)}
            onApply={(f) => {
              pipeline.setFilter(f);
              setFilterPopover(null);
            }}
            onClear={() => {
              pipeline.removeFilter(filterPopover.column);
              setFilterPopover(null);
            }}
            onClose={() => setFilterPopover(null)}
          />
        </div>
      )}

    </div>
  );
}
