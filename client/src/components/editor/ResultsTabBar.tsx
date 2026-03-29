import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Rows3, Rows2, Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { buildCsv, buildJson, buildXlsx, exportFile, makeFilename, type ExportableData } from '@/lib/export-utils';
import type { QueryResult } from '@/types/query';

export type ResultsView = 'results' | 'plan';

interface Props {
  activeView: ResultsView;
  onViewChange: (view: ResultsView) => void;
  hasPlan: boolean;
  result?: QueryResult | null;
  queryName?: string;
  compact: boolean;
  onToggleCompact: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

function ExportDropdown({ result, queryName }: { result: ExportableData; queryName: string }) {
  const [exporting, setExporting] = useState(false);

  const withLoading = (fn: () => Promise<void>) => async () => {
    setExporting(true);
    try { await fn(); } finally { setExporting(false); }
  };

  const handleCsv = withLoading(async () => {
    const csv = buildCsv(result);
    await exportFile(csv, makeFilename(queryName, 'csv'), 'text/csv', 'CSV', ['csv']);
  });

  const handleJson = withLoading(async () => {
    const json = buildJson(result);
    await exportFile(json, makeFilename(queryName, 'json'), 'application/json', 'JSON', ['json']);
  });

  const handleXlsx = withLoading(async () => {
    const data = await buildXlsx(result);
    await exportFile(data, makeFilename(queryName, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
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

export function ResultsTabBar({
  activeView,
  onViewChange,
  hasPlan,
  result,
  queryName = '',
  compact,
  onToggleCompact,
  fullscreen,
  onToggleFullscreen,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex items-center border-b bg-muted/30 px-2 gap-1 shrink-0', 'h-8')}>
      {/* Tabs */}
      <button
        className={cn(
          'text-xs px-3 py-1 rounded-md transition-colors',
          activeView === 'results' && 'bg-background shadow-sm font-medium',
        )}
        onClick={() => onViewChange('results')}
      >
        {t('editor.results')}
      </button>
      {hasPlan && (
        <button
          className={cn(
            'text-xs px-3 py-1 rounded-md transition-colors',
            activeView === 'plan' && 'bg-background shadow-sm font-medium',
          )}
          onClick={() => onViewChange('plan')}
        >
          Plan
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {result && result.rows.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mr-2">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-medium text-foreground">{result.row_count}</span>
            <span>{t('common.rows')}</span>
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span>{result.duration_ms}ms</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={compact ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onToggleCompact}
              >
                {compact ? <Rows2 className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {compact ? t('inspector.normalView') : t('inspector.compactView')}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={fullscreen ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onToggleFullscreen}
              >
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {fullscreen ? t('inspector.normalView') : t('plan.fullscreen')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {result && result.rows.length > 0 && (
          <ExportDropdown result={result} queryName={queryName} />
        )}

        {fullscreen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-1" onClick={onToggleFullscreen}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Close (Esc)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
