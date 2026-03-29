import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import type { QueryResult } from '@/types/query';
import { parseColumnAliases } from '@/lib/column-alias-parser';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DataGrid } from '@/components/data-grid';

interface Props {
  result: QueryResult;
  definition?: string;
  compact?: boolean;
}

export const ResultsGrid = React.memo(function ResultsGrid({ result, definition, compact }: Props) {
  const [showSourceNames, setShowSourceNames] = useState(true);

  const columnMapping = useMemo(() => parseColumnAliases(definition), [definition]);
  const hasAliases = useMemo(() => {
    if (!columnMapping || Object.keys(columnMapping).length === 0) return false;
    return result.columns.some((col) => columnMapping[col.name]);
  }, [columnMapping, result.columns]);

  const displayColumns = useMemo(() => {
    if (!showSourceNames || !hasAliases) return result.columns;
    return result.columns.map((col) => ({
      ...col,
      name: columnMapping[col.name] || col.name,
    }));
  }, [result.columns, showSourceNames, hasAliases, columnMapping]);

  const displayRows = useMemo(() => {
    if (!showSourceNames || !hasAliases) return result.rows;
    return result.rows.map((row) => {
      const mapped: Record<string, any> = {};
      for (const col of result.columns) {
        const displayName = columnMapping[col.name] || col.name;
        mapped[displayName] = row[col.name];
      }
      return mapped;
    });
  }, [result.rows, result.columns, showSourceNames, hasAliases, columnMapping]);

  const { t } = useTranslation();

  if (result.rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Query executed successfully. No rows returned.
        {result.affected_rows != null && result.affected_rows > 0 && ` ${result.affected_rows} rows affected.`}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col relative" data-tour="results-grid">
      {hasAliases && (
        <div className="absolute top-1 right-2 z-10">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showSourceNames ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-5 px-1.5 text-[10px] gap-1 opacity-70 hover:opacity-100"
                  onClick={() => setShowSourceNames((v) => !v)}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  {showSourceNames ? 'Source names' : 'Raw codes'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {showSourceNames
                  ? 'Showing real column names — switch to raw codes'
                  : 'Show raw column names — toggle display names'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <DataGrid
        columns={displayColumns}
        rows={displayRows}
        totalRows={result.row_count}
        compact={compact}
        durationMs={result.duration_ms}
      />
    </div>
  );
});
