import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, HardDrive, Loader2, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConnectionStore } from '@/stores/connection-store';
import { useEstimateIndexSize, type IndexSizeEstimate } from '@/hooks/useQuery';
import type { MissingIndex } from '@/types/execution-plan';
import { useDialect } from '@/hooks/useDriver';

function generateDDL(idx: MissingIndex, dialect: import('@/lib/dialect').DialectConfig): string {
  const allKeyCols = [...idx.equalityColumns, ...idx.inequalityColumns];
  const indexName = `IX_${idx.table}_${allKeyCols.join('_')}`.replace(/\s/g, '');
  return dialect.createIndex(idx.schema, idx.table, indexName, allKeyCols, idx.includeColumns);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/* ── Tab 1: Indexes (Overview) ── */

export function IndexOverviewTab({ indexes }: { indexes: MissingIndex[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">#</th>
            <th className="pb-2 font-medium">{t("plan.tableHeader")}</th>
            <th className="pb-2 font-medium">{t("plan.equality")}</th>
            <th className="pb-2 font-medium">{t("plan.inequality")}</th>
            <th className="pb-2 font-medium">{t("plan.include")}</th>
            <th className="pb-2 font-medium text-right">{t("plan.improvement")}</th>
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2.5 text-muted-foreground font-mono">{i + 1}</td>
              <td className="py-2.5 font-medium">{idx.schema}.{idx.table}</td>
              <td className="py-2.5 font-mono text-[11px]">
                {idx.equalityColumns.length > 0 ? idx.equalityColumns.join(', ') : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 font-mono text-[11px]">
                {idx.inequalityColumns.length > 0 ? idx.inequalityColumns.join(', ') : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 font-mono text-[11px]">
                {idx.includeColumns.length > 0 ? idx.includeColumns.join(', ') : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                +{idx.impact.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Tab 2: Size Estimate ── */

function SizeRow({ idx, index }: { idx: MissingIndex; index: number }) {
  const { t } = useTranslation();
  const [estimate, setEstimate] = useState<IndexSizeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const mutation = useEstimateIndexSize();

  const allColumns = [...idx.equalityColumns, ...idx.inequalityColumns, ...idx.includeColumns];

  const handleEstimate = async () => {
    if (!activeConnectionId || !activeDatabase) return;
    setError(null);
    try {
      const result = await mutation.mutateAsync({
        connectionId: activeConnectionId,
        database: activeDatabase,
        schema: idx.schema,
        table: idx.table,
        columns: allColumns,
      });
      setEstimate(result);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">#{index + 1}</span>
          <span className="text-sm font-medium">{idx.schema}.{idx.table}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleEstimate}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <HardDrive className="h-3 w-3" />}
          Calculate
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {t('plan.columnsHeader')}: <span className="font-mono">{allColumns.join(', ')}</span>
      </div>

      {estimate && (
        <div className="rounded-md bg-muted/50 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('plan.rowCountLabel')}</div>
              <div className="font-medium">{formatNumber(estimate.rowCount)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('plan.estimatedSize')}</div>
              <div className="font-medium">
                {estimate.estimatedSizeMB < 1
                  ? `${Math.round(estimate.estimatedSizeMB * 1024)} KB`
                  : `${estimate.estimatedSizeMB} MB`}
              </div>
            </div>
          </div>
          {estimate.columnDetails.length > 0 && (
            <div className="border-t pt-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('plan.columnDetails')}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {estimate.columnDetails.map((c) => (
                  <div key={c.name} className="flex justify-between font-mono">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">{c.maxLength} B</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}

export function SizeEstimateTab({ indexes }: { indexes: MissingIndex[] }) {
  return (
    <div className="space-y-3">
      {indexes.map((idx, i) => (
        <SizeRow key={i} idx={idx} index={i} />
      ))}
    </div>
  );
}

/* ── Tab 3: DDL ── */

function DDLBlock({ idx, index }: { idx: MissingIndex; index: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const dialect = useDialect();
  const ddl = generateDDL(idx, dialect);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">#{index + 1}</span>
          <span className="font-medium">{idx.schema}.{idx.table}</span>
          <span className="text-emerald-600 dark:text-emerald-400">+{idx.impact.toFixed(1)}%</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap select-all bg-muted/20">
        {ddl}
      </pre>
    </div>
  );
}

export function DDLTab({ indexes }: { indexes: MissingIndex[] }) {
  const { t } = useTranslation();
  const [allCopied, setAllCopied] = useState(false);
  const dialect = useDialect();

  const handleCopyAll = async () => {
    const allDDL = indexes.map((idx) => generateDDL(idx, dialect)).join('\n\n');
    await navigator.clipboard.writeText(allDDL);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      {indexes.length > 1 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopyAll}>
            {allCopied ? <Check className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
            {allCopied ? t('common.copied') : t('common.copyAll')}
          </Button>
        </div>
      )}
      {indexes.map((idx, i) => (
        <DDLBlock key={i} idx={idx} index={i} />
      ))}
    </div>
  );
}
