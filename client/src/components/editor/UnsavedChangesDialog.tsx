import { useEditorStore } from '@/stores/editor-store';
import { useTranslation } from 'react-i18next';
import { useUpdateSavedQuery } from '@/hooks/useSavedQueries';
import { getCachedEditCount } from '@/components/data-grid';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export function UnsavedChangesDialog() {
  const { t } = useTranslation();
  const pendingCloseTabId = useEditorStore((s) => s.pendingCloseTabId);
  const tab = useEditorStore((s) =>
    s.pendingCloseTabId ? s.tabs.find((t) => t.id === s.pendingCloseTabId) : undefined
  );
  const confirmCloseTab = useEditorStore((s) => s.confirmCloseTab);
  const cancelCloseTab = useEditorStore((s) => s.cancelCloseTab);
  const updateMutation = useUpdateSavedQuery();

  if (!pendingCloseTabId || !tab) return null;

  const isInspector = tab.type === 'inspector';
  const inspectorEditCount = isInspector && tab.inspectorTarget
    ? getCachedEditCount(`${tab.inspectorTarget.connectionId}-${tab.inspectorTarget.database}-${tab.inspectorTarget.schema}-${tab.inspectorTarget.table}`)
    : 0;

  const handleSaveAndClose = () => {
    if (tab.savedQueryId) {
      updateMutation.mutate(
        { id: tab.savedQueryId, sql_text: tab.sql },
        { onSuccess: () => confirmCloseTab() }
      );
    }
  };

  return (
    <Dialog open={!!pendingCloseTabId} onOpenChange={(open) => { if (!open) cancelCloseTab(); }}>
      <DialogContent className="max-w-xs gap-3 p-5 [&>button:last-child]:hidden">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <DialogTitle className="text-sm font-semibold">
              {isInspector ? t('editor.unsavedEdits') : t('editor.unsavedChanges')}
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isInspector ? (
              <>
                {t('editor.unsavedEditsMessage', { title: tab.title, count: inspectorEditCount })}
              </>
            ) : (
              <>
                {t('editor.unsavedChangesMessage', { title: tab.title })}
              </>
            )}
          </p>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:gap-2 pt-1">
          <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs" onClick={cancelCloseTab}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-destructive hover:text-destructive" onClick={confirmCloseTab}>
            {isInspector ? t('editor.discardEdits') : t('editor.dontSave')}
          </Button>
          {tab.savedQueryId && !isInspector && (
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSaveAndClose} disabled={updateMutation.isPending}>
              {t('editor.saveAndClose')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
