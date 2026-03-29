import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, AlertTriangle, Loader2, ShieldAlert, ShieldCheck, Rows2, Rows3, Download, Maximize2, Minimize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ResultsGrid } from '@/components/results/ResultsGrid';
import { ResultsMessages } from '@/components/results/ResultsMessages';
import { useExecuteQuery, cancelQuery } from '@/hooks/useQuery';
import { useSafetyAnalysis, type SafetyAnalysis } from '@/hooks/useObjectDetails';
import { useUIStore } from '@/stores/ui-store';
import { buildCsv, buildJson, buildXlsx, exportFile, makeFilename } from '@/lib/export-utils';
import type { ObjectParameter } from '@/types/schema';
import type { QueryResult } from '@/types/query';
import { useDialect } from '@/hooks/useDriver';

function errMsg(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err) || 'Unknown error';
}

// Delegated to ObjectSqlBuilder class

interface Props {
  connectionId: string;
  database: string;
  objectName: string;
  schema: string;
  objectType: 'view' | 'procedure' | 'function';
  parameters?: ObjectParameter[];
  functionType?: string;
  definition?: string;
}

export function ObjectExecutor({ connectionId, database, objectName, schema, objectType, parameters = [], functionType, definition }: Props) {
  const { t } = useTranslation();
  const dialect = useDialect();
  const isTriggerFunction = functionType === 'TRIGGER';
  const inputParams = useMemo(() => parameters.filter((p) => p.ordinal_position > 0 && !p.is_output), [parameters]);
  const parsedDefaults = useMemo(() => dialect.parseDefaults(definition), [definition, dialect]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSql, setLastSql] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const executeMutation = useExecuteQuery();

  // Reset state when switching to a different object
  const objectKey = `${connectionId}:${database}:${schema}.${objectName}`;
  const prevKey = useRef(objectKey);
  useEffect(() => {
    if (prevKey.current !== objectKey) {
      prevKey.current = objectKey;
      setParamValues({});
      setResult(null);
      setError(null);
      setShowConfirm(false);
    }
  }, [objectKey]);

  const { data: safety, isLoading: safetyLoading } = useSafetyAnalysis(
    objectType !== 'view' ? connectionId : null,
    objectType !== 'view' ? database : null,
    objectType !== 'view' ? objectName : null,
    schema
  );

  const isReadonly = objectType === 'view' || safety?.is_readonly === true;

  const buildSQL = (): string => {
    return dialect.buildExecSql(schema, objectName, objectType, functionType, inputParams, paramValues, parsedDefaults);
  };

  const activeQueryIdRef = useRef<string | null>(null);

  const handleExecute = () => {
    if (!isReadonly && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    setShowConfirm(false);
    setError(null);
    setResult(null);

    const queryId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeQueryIdRef.current = queryId;

    const sql = buildSQL();
    setLastSql(sql);
    executeMutation.mutate(
      { connectionId, database, sql, queryId },
      {
        onSuccess: (data) => { setResult(data); activeQueryIdRef.current = null; },
        onError: (err: unknown) => { setError(errMsg(err)); activeQueryIdRef.current = null; },
      }
    );
  };

  const handleCancelQuery = useCallback(() => {
    const qid = activeQueryIdRef.current;
    if (qid) cancelQuery(qid).catch(() => {});
  }, []);

  const handleCancelConfirm = () => setShowConfirm(false);

  if (isTriggerFunction) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Trigger functions can only be invoked by their associated trigger, not executed directly.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Parameter form */}
      {inputParams.length > 0 && (
        <div className="border-b p-3 space-y-2 shrink-0">
          <div className="text-xs font-semibold text-muted-foreground mb-1">Parameters</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {inputParams.map((p) => (
              <div key={p.name} className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <span className="font-mono font-semibold">{p.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">{dialect.formatParamType(p)}</Badge>
                  {p.has_default_value && <span className="text-muted-foreground text-[9px]">optional</span>}
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  placeholder={(() => {
                    const defVal = parsedDefaults[p.name] ?? p.default_value;
                    if (defVal != null) return `default: ${defVal}`;
                    if (p.has_default_value) return `has default (check definition)`;
                    return `${p.data_type} (required)`;
                  })()}
                  value={paramValues[p.name] || ''}
                  onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleExecute}
          disabled={executeMutation.isPending}
        >
          {executeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {objectType === 'view' ? 'Execute View' : 'Execute'}
        </Button>

        {executeMutation.isPending && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCancelQuery}>
            <Square className="h-3.5 w-3.5 text-red-500 fill-red-500" />
            Stop
          </Button>
        )}

        {/* Safety badge */}
        {objectType !== 'view' && (
          safetyLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : isReadonly ? (
            <Badge variant="outline" className="gap-1 text-[10px] text-green-600 border-green-300">
              <ShieldCheck className="h-3 w-3" /> Read-only
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 border-amber-300">
              <ShieldAlert className="h-3 w-3" /> Contains mutations
            </Badge>
          )
        )}

      </div>

      {/* Mutation confirmation modal */}
      {showConfirm && safety && !safety.is_readonly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-lg max-w-md w-full mx-4 p-4">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold">This object may modify data</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  The following mutation operations were detected in its definition or dependencies:
                </p>
              </div>
            </div>
            <div className="border rounded p-2 mb-4 max-h-40 overflow-auto space-y-1">
              {safety.mutations.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">{m.pattern}</Badge>
                  <span className="font-mono text-muted-foreground truncate">
                    {m.depth === 0 ? objectName : `${m.schema}.${m.object}`}
                    {m.depth > 0 && <span className="text-[9px]"> (depth {m.depth})</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              SQL to execute: <code className="bg-muted px-1 py-0.5 rounded text-[10px] break-all">{buildSQL()}</code>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCancelConfirm}>{t('common.cancel')}</Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={handleExecute}>
                <AlertTriangle className="h-3 w-3" /> Run Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results toolbar + grid */}
      {result && !error && !executeMutation.isPending && (
        <ResultsToolbar
          result={result}
          objectName={objectName}
          onToggleFullscreen={() => window.dispatchEvent(new CustomEvent('qery:inspector-fullscreen', { detail: { result, objectName, definition } }))}
        />
      )}
      <div className="flex-1 overflow-hidden">
        {executeMutation.isPending ? (
          <div className="flex h-full items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-sm text-muted-foreground">Executing...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col h-full">
            <ResultsMessages error={error} />
            {lastSql && (
              <div className="px-3 pb-3">
                <div className="text-[10px] text-muted-foreground mb-1">Executed SQL:</div>
                <pre className="text-[11px] font-mono bg-muted rounded px-2 py-1.5 select-all overflow-auto max-h-24 whitespace-pre-wrap break-all">{lastSql}</pre>
              </div>
            )}
          </div>
        ) : result ? (
          <ResultsGridWithCompact result={result} definition={definition} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {objectType === 'view'
              ? 'Click "Execute View" to see results'
              : inputParams.length > 0
                ? 'Fill in parameters and click "Execute"'
                : 'Click "Execute" to run'}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsGridWithCompact({ result, definition }: { result: QueryResult; definition?: string }) {
  const compact = useUIStore((s) => s.compactResults);
  return <ResultsGrid result={result} definition={definition} compact={compact} />;
}

export function ResultsToolbar({ result, objectName, fullscreen, onToggleFullscreen }: { result: QueryResult; objectName: string; fullscreen?: boolean; onToggleFullscreen?: () => void }) {
  const compact = useUIStore((s) => s.compactResults);
  const toggleCompact = useUIStore((s) => s.toggleCompactResults);
  const [exporting, setExporting] = useState(false);

  const data = { columns: result.columns, rows: result.rows };

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    setExporting(true);
    try {
      if (format === 'csv') {
        await exportFile(buildCsv(data), makeFilename(objectName, 'csv'), 'text/csv', 'CSV', ['csv']);
      } else if (format === 'json') {
        await exportFile(buildJson(data), makeFilename(objectName, 'json'), 'application/json', 'JSON', ['json']);
      } else {
        const buf = await buildXlsx(data);
        await exportFile(buf, makeFilename(objectName, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b shrink-0">
      <span className="text-[10px] text-muted-foreground">
        {result.row_count} rows &middot; {result.duration_ms}ms
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={compact ? 'secondary' : 'ghost'} size="sm" className="h-5 w-5 p-0" onClick={toggleCompact}>
              {compact ? <Rows2 className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {compact ? 'Normal view' : 'Compact view'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={fullscreen ? 'secondary' : 'ghost'} size="sm" className="h-5 w-5 p-0" onClick={onToggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {fullscreen ? 'Normal view (Esc)' : 'Fullscreen'}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" disabled={exporting}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleExport('csv')}>CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport('xlsx')}>Excel (XLSX)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport('json')}>JSON</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {fullscreen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-0.5" onClick={onToggleFullscreen}>
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Close (Esc)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

