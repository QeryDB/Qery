import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useTableDetails } from '@/hooks/useTableDetails';
import { useAnnotations } from '@/hooks/useAnnotations';
import { ColumnsTab } from '@/components/inspector/ColumnsTab';
import { Loader2, StickyNote } from 'lucide-react';

export function DocDrawer() {
  const docTarget = useUIStore((s) => s.docTarget);
  const closeDoc = useUIStore((s) => s.closeDoc);

  if (!docTarget) return null;

  return <DocDrawerContent target={docTarget} onClose={closeDoc} />;
}

function DocDrawerContent({ target, onClose }: {
  target: { connectionId: string; database: string; table: string; schema: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: details, isLoading } = useTableDetails(
    target.connectionId, target.database, target.table, target.schema
  );
  const { data: annotations = [] } = useAnnotations(target.connectionId, target.database, target.table);

  const tableNote = annotations.find((a) => !a.column_name);
  const columnNotes = new Map(
    annotations.filter((a) => a.column_name).map((a) => [a.column_name!, a.note])
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[15px] font-bold tracking-tight">
            {target.schema}.{target.table}
          </span>
          <span className="shrink-0 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">
            • TABLE
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : details ? (
          <div>
            {tableNote && (
              <div className="mx-4 mb-3 flex items-start gap-1.5 rounded-lg bg-accent/50 px-3 py-2">
                <StickyNote className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                <p className="text-xs whitespace-pre-wrap">{tableNote.note}</p>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/40">
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Columns
              </h4>
              <span className="text-[11px] text-muted-foreground">{details.columns.length}</span>
            </div>
            <ColumnsTab columns={details.columns} columnNotes={columnNotes} />
          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">{t("inspector.tableNotFound")}</div>
        )}
      </div>
    </div>
  );
}
