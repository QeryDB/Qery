import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Columns, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { FilterItem } from './types';

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=',
  neq: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  contains: '∋',
  is_null: 'NULL',
  is_not_null: 'NOT NULL',
};

interface Props {
  columns: { name: string; type: string }[];
  hiddenColumns: Set<string>;
  filters: Map<string, FilterItem>;
  onToggleColumn: (colName: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onRemoveFilter: (column: string) => void;
  onClearFilters: () => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  totalRows: number;
  filteredRows: number;
}

export function GridToolbar({
  columns,
  hiddenColumns,
  filters,
  onToggleColumn,
  onShowAll,
  onHideAll,
  onRemoveFilter,
  onClearFilters,
  showSearch,
  onToggleSearch,
  totalRows,
  filteredRows,
}: Props) {
  const { t } = useTranslation();
  const isFiltered = filteredRows !== totalRows;
  const [colSearch, setColSearch] = useState('');
  const [colTab, setColTab] = useState<'all' | 'visible'>('all');

  const visibleCount = columns.length - hiddenColumns.size;

  const listCols = useMemo(() => {
    let base = colTab === 'visible'
      ? columns.filter((c) => !hiddenColumns.has(c.name))
      : columns;
    if (colSearch) {
      base = base.filter((c) => c.name.toLowerCase().includes(colSearch.toLowerCase()));
    }
    return base;
  }, [columns, hiddenColumns, colTab, colSearch]);

  return (
    <div className="flex items-center gap-1 border-b px-1.5 py-0.5 bg-muted/20">
      {/* Search toggle */}
      <Button
        size="icon-sm"
        variant={showSearch ? 'secondary' : 'ghost'}
        className="h-6 w-6"
        onClick={onToggleSearch}
        title={t("grid.search")}
      >
        <Search className="h-3.5 w-3.5" />
      </Button>

      {/* Column visibility */}
      <DropdownMenu onOpenChange={(open) => { if (!open) { setColSearch(''); setColTab('all'); } }}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant={hiddenColumns.size > 0 ? 'secondary' : 'ghost'}
            className="h-6 w-6"
            title={t("grid.columns")}
          >
            <Columns className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {/* Tabs */}
          <div className="flex border-b mx-1 mb-1">
            <button
              type="button"
              onClick={() => setColTab('all')}
              className={cn(
                'flex-1 py-1 text-xs font-medium transition-colors',
                colTab === 'all'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('grid.allColumns', { count: columns.length })}
            </button>
            <button
              type="button"
              onClick={() => setColTab('visible')}
              className={cn(
                'flex-1 py-1 text-xs font-medium transition-colors',
                colTab === 'visible'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('grid.visibleColumns', { count: visibleCount })}
            </button>
          </div>

          {/* Column search input */}
          <div className="px-2 py-1">
            <input
              value={colSearch}
              onChange={(e) => setColSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={t("grid.searchColumns")}
              className="w-full h-6 rounded-sm border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-1 px-2 pb-1">
            <Button size="sm" variant="ghost" className="h-5 text-xs px-1.5" onClick={onShowAll}>
              {t('grid.showAll')}
            </Button>
            <Button size="sm" variant="ghost" className="h-5 text-xs px-1.5" onClick={onHideAll}>
              {t('grid.hideAll')}
            </Button>
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-52 overflow-y-auto">
            {listCols.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.name}
                checked={!hiddenColumns.has(col.name)}
                onCheckedChange={() => onToggleColumn(col.name)}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                {col.name}
              </DropdownMenuCheckboxItem>
            ))}
            {listCols.length === 0 && (
              <div className="px-2 py-3 text-xs text-center text-muted-foreground">
                {colTab === 'visible' ? t('grid.noVisibleColumns') : t('grid.noColumnsFound')}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active filter chips */}
      {filters.size > 0 && (
        <div className="flex items-center gap-1 ml-1">
          {Array.from(filters.values()).map((f) => (
            <Badge key={f.column} variant="secondary" className="h-5 text-xs px-1.5 gap-1 font-normal rounded-sm">
              <span className="font-medium">{f.column}</span>
              <span>{OPERATOR_LABELS[f.operator] || f.operator}</span>
              {f.value !== undefined && <span className="truncate max-w-[80px]">"{f.value}"</span>}
              <button className="ml-0.5 hover:text-destructive" onClick={() => onRemoveFilter(f.column)}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
          {filters.size > 1 && (
            <button className="text-xs text-muted-foreground hover:text-foreground ml-0.5" onClick={onClearFilters}>
              {t('common.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Row count */}
      <span className="text-xs text-muted-foreground pr-1">
        {isFiltered ? t('grid.filteredRowCount', { filtered: filteredRows, total: totalRows }) : t('grid.totalRowCount', { total: totalRows })}
      </span>
    </div>
  );
}
