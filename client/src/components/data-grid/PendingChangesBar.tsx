import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, X, Eye, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { useDialect } from '@/hooks/useDriver';
import type { PendingEdit } from './types';

interface Props {
  edits: Map<string, PendingEdit>;
  editCount: number;
  clearAll: () => void;
  tableName: string;
  schemaName: string;
  primaryKeys: string[];
  connectionId: string;
  database: string;
  rows: Record<string, any>[];
  newRows: Record<string, any>[];
  columnTypes?: Record<string, string>;
}

export function PendingChangesBar({
  edits,
  editCount,
  clearAll,
  tableName,
  schemaName,
  primaryKeys,
  connectionId,
  database,
  rows,
  newRows,
  columnTypes,
}: Props) {
  const { t } = useTranslation();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const dialect = useDialect();

  if (editCount === 0) return null;

  const hasUpdates = edits.size > 0;
  const hasPKs = primaryKeys.length > 0;
  const canCommitUpdates = hasUpdates && hasPKs;
  const updateStatements = hasPKs ? dialect.generateUpdates(tableName, schemaName, primaryKeys, edits, rows, columnTypes) : [];
  const insertStatements = dialect.generateInserts(tableName, schemaName, newRows, columnTypes);
  const statements = [...updateStatements, ...insertStatements];
  const canCommit = statements.length > 0;

  const handleCommit = async () => {
    setCommitting(true);
    setError(null);
    try {
      for (const sql of statements) {
        await api.post(`/connections/${connectionId}/databases/${database}/query`, { sql });
      }
      clearAll();
      setReviewOpen(false);
      queryClient.invalidateQueries({ queryKey: ['table-preview', connectionId, database, tableName] });
    } catch (e: any) {
      setError(e.message || t('inspector.changesSaveFailed'));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-t px-3 py-1.5 bg-muted/50">
        <Badge variant="secondary" className="text-xs">
          {t('inspector.pendingChanges', { count: editCount })}
        </Badge>
        <div className="flex-1" />
        {hasUpdates && !hasPKs && (
          <span className="flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-3 w-3" />
            {t('inspector.noPrimaryKey')}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setReviewOpen(true)} disabled={!canCommit}>
          <Eye className="h-3 w-3" />
          {t('inspector.reviewSql')}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-destructive" onClick={clearAll}>
          <X className="h-3 w-3" />
          {t('inspector.cancelChanges')}
        </Button>
        <Button variant="default" size="sm" className="h-6 text-xs gap-1" onClick={handleCommit} disabled={committing || !canCommit}>
          {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save
        </Button>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('inspector.reviewSqlStatements')}</DialogTitle>
            <DialogDescription>
              {t('inspector.sqlToExecute', { schema: schemaName, table: tableName })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded border bg-muted p-3">
            <pre className="text-xs whitespace-pre-wrap font-mono">
              {statements.join('\n\n')}
            </pre>
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCommit} disabled={committing}>
              {committing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              {t('inspector.executeStatements', { count: statements.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
