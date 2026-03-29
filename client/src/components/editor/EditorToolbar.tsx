import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, Save, Download, AlignLeft, FileSearch, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { modKey, isMac } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SaveQueryDialog } from './SaveQueryDialog';
import { useEditorToolbarActions } from '@/hooks/useEditorToolbarActions';

interface Props {
  tabId: string;
}

export const EditorToolbar = React.memo(function EditorToolbar({ tabId }: Props) {
  const actions = useEditorToolbarActions(tabId);

  const { t } = useTranslation();

  return (
    <>
      <div className="flex h-9 items-center gap-1 border-b px-2">
        <Button
          data-tour="run-button"
          size="sm"
          className="h-7 gap-1.5 text-xs px-4 rounded-lg"
          onClick={actions.handleRun}
          disabled={!actions.canRun || actions.isExecuting}
        >
          <Play className="h-3.5 w-3.5" />
          {t('editor.execute')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={actions.handleExplain}
          disabled={!actions.canRun || actions.isExplaining}
        >
          <FileSearch className="h-3.5 w-3.5" />
          Analyze
        </Button>
        {(actions.isExecuting || actions.isExplaining) && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={actions.handleCancel}>
            <Square className="h-3.5 w-3.5 text-red-500 fill-red-500" />
            Stop
          </Button>
        )}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={actions.handleSave}
          disabled={!actions.tabSql.trim()}
        >
          <Save className="h-3.5 w-3.5" />
          {actions.savedQueryId ? t('common.save') : t('editor.saveQuery')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Download className="h-3.5 w-3.5" />
          {t('export.export')}
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={actions.triggerFormat}>
          <AlignLeft className="h-3.5 w-3.5" />
          {t('common.format')}
        </Button>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">{modKey}Enter run | {modKey}E analyze | {modKey}S save | {isMac ? '⌘⇧F' : 'Shift+Alt+F'} format</span>
      </div>

      <SaveQueryDialog
        open={actions.saveDialogOpen}
        onOpenChange={actions.setSaveDialogOpen}
        tabId={tabId}
        sql={actions.tabSql}
        connectionId={actions.activeConnectionId ?? undefined}
      />

      {/* Mutation safety warning modal */}
      {actions.safetyWarning && !actions.safetyWarning.isSafe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-lg max-w-md w-full mx-4 p-4">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold">This query may modify data</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  The following mutation operations were detected in the query:
                </p>
              </div>
            </div>
            <div className="border rounded p-2 mb-3 max-h-32 overflow-auto flex flex-wrap gap-1">
              {actions.safetyWarning.mutations.map((m, i) => (
                <Badge key={i} variant="destructive" className="text-[9px] px-1.5 py-0.5">{m}</Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mb-4">
              <code className="block bg-muted px-2 py-1.5 rounded text-[10px] break-all max-h-20 overflow-auto whitespace-pre-wrap">
                {actions.pendingSql?.slice(0, 300)}{(actions.pendingSql?.length ?? 0) > 300 ? '...' : ''}
              </code>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-muted-foreground/50"
                checked={actions.suppressWarning}
                onChange={(e) => actions.setSuppressWarning(e.target.checked)}
              />
              Don't warn for this tab
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={actions.handleCancelWarning}>{t('common.cancel')}</Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={actions.handleConfirmRun}>
                <AlertTriangle className="h-3 w-3" /> Run Anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
