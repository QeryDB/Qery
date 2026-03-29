import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Copy, Check, Eye, HardDrive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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

function IndexCard({ idx }: { idx: MissingIndex }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showDDL, setShowDDL] = useState(false);
  const [estimate, setEstimate] = useState<IndexSizeEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const estimateMutation = useEstimateIndexSize();
  const dialect = useDialect();

  const ddl = generateDDL(idx, dialect);
  const allColumns = [...idx.equalityColumns, ...idx.inequalityColumns, ...idx.includeColumns];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEstimate = async () => {
    if (!activeConnectionId || !activeDatabase) return;
    setEstimateError(null);
    try {
      const result = await estimateMutation.mutateAsync({
        connectionId: activeConnectionId,
        database: activeDatabase,
        schema: idx.schema,
        table: idx.table,
        columns: allColumns,
      });
      setEstimate(result);
    } catch (err: any) {
      setEstimateError(err.message);
    }
  };

  return (
    <>
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
        <Lightbulb className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">{idx.schema}.{idx.table}</span>
            <span className="text-muted-foreground">— estimated improvement: {idx.impact.toFixed(1)}%</span>
          </div>
          {idx.equalityColumns.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">{t('plan.equality')}</span>{idx.equalityColumns.join(', ')}
            </div>
          )}
          {idx.inequalityColumns.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">{t('plan.inequality')}</span>{idx.inequalityColumns.join(', ')}
            </div>
          )}
          {idx.includeColumns.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              <span className="font-medium">{t('plan.include')}</span>{idx.includeColumns.join(', ')}
            </div>
          )}

          {/* Size estimate result inline */}
          {estimate && (
            <div className="flex items-center gap-3 text-[10px] mt-1 pt-1 border-t border-blue-200 dark:border-blue-800">
              <span><span className="font-medium">Rows:</span> {formatNumber(estimate.rowCount)}</span>
              <span><span className="font-medium">Estimated size:</span> {estimate.estimatedSizeMB < 1 ? `${Math.round(estimate.estimatedSizeMB * 1024)} KB` : `${estimate.estimatedSizeMB} MB`}</span>
              {estimate.columnDetails.length > 0 && (
                <span className="text-muted-foreground">
                  ({estimate.columnDetails.map(c => `${c.name}: ${c.maxLength}B`).join(', ')})
                </span>
              )}
            </div>
          )}
          {estimateError && (
            <div className="text-[10px] text-red-500 mt-1">{estimateError}</div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleEstimate}
            disabled={estimateMutation.isPending}
          >
            {estimateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <HardDrive className="h-3 w-3" />}
            Size
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowDDL(true)}>
            <Eye className="h-3 w-3" />
            DDL
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        </div>
      </div>

      {/* DDL Preview Modal */}
      <Dialog open={showDDL} onOpenChange={setShowDDL}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{t('plan.indexDdl', { schema: idx.schema, table: idx.table })}</DialogTitle>
            <DialogDescription className="text-xs">Estimated improvement: {idx.impact.toFixed(1)}%</DialogDescription>
          </DialogHeader>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64 select-all">
            {ddl}
          </pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowDDL(false)}>
              {t('common.close')}
            </Button>
            <Button size="sm" className="text-xs gap-1" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface Props {
  indexes: MissingIndex[];
}

export function MissingIndexCards({ indexes }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('plan.missingIndexSuggestions')}</div>
      {indexes.map((idx, i) => (
        <IndexCard key={i} idx={idx} />
      ))}
    </div>
  );
}
