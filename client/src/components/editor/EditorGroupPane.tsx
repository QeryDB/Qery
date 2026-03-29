import { useRef, useState, useEffect, useCallback, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { modKey } from '@/lib/utils';
import { EditorGroupTabBar } from './EditorGroupTabBar';
import { QueryEditor } from './QueryEditor';
import { EditorToolbar } from './EditorToolbar';
import { ResultsGrid } from '@/components/results/ResultsGrid';
import { ResultsMessages } from '@/components/results/ResultsMessages';
import { ResultsTabBar, type ResultsView } from './ResultsTabBar';
import { ExecutionPlanViewer } from '@/components/plan/ExecutionPlanViewer';
import { DroppableEdgeZone } from './DroppableEdgeZone';
import { ResultsToolbar } from '@/components/inspector/ObjectExecutor';
import { cn } from '@/lib/utils';
import type { QueryResult } from '@/types/query';

import { ExecutingIndicator, TabInspectorContent, TabResultContent } from './TabContent';

interface Props {
  groupId: string;
  isDragging?: boolean;
  dropPreview?: number;
}

export function EditorGroupPane({ groupId, isDragging, dropPreview }: Props) {
  const { t } = useTranslation();
  const {
    activeTabId,
    activeTabType,
    isFocused,
  } = useEditorStore(useShallow((s) => {
    const g = s.layout.groups.find((g) => g.id === groupId);
    const tab = g?.activeTabId ? s.tabs.find((t) => t.id === g.activeTabId) : undefined;
    return {
      activeTabId: g?.activeTabId,
      activeTabType: tab?.type,
      isFocused: s.layout.focusedGroupId === groupId,
    };
  }));

  const queryTabIds = useEditorStore(useShallow((s) => {
    const g = s.layout.groups.find((g) => g.id === groupId);
    if (!g) return [] as string[];
    return g.tabIds.filter(id => {
      const t = s.tabs.find(t => t.id === id);
      return t && t.type !== 'inspector';
    });
  }));

  const inspectorTabIds = useEditorStore(useShallow((s) => {
    const g = s.layout.groups.find((g) => g.id === groupId);
    if (!g) return [] as string[];
    return g.tabIds.filter(id => {
      const t = s.tabs.find(t => t.id === id);
      return t && t.type === 'inspector';
    });
  }));

  const allTabIds = useEditorStore(useShallow((s) => {
    const g = s.layout.groups.find((g) => g.id === groupId);
    return g?.tabIds ?? [];
  }));

  const activeQueryTabRef = useRef<string | undefined>(undefined);
  if (activeTabId && activeTabType !== 'inspector') {
    activeQueryTabRef.current = activeTabId;
  }
  if (activeQueryTabRef.current && !queryTabIds.includes(activeQueryTabRef.current)) {
    activeQueryTabRef.current = queryTabIds[queryTabIds.length - 1];
  }
  const queryTabId = activeQueryTabRef.current;

  const { isExecuting, isExplaining, error, result, executionPlan, planXml, tabTitle, externalChange } = useEditorStore(useShallow((s) => {
    if (!queryTabId) return { isExecuting: false, isExplaining: false, error: undefined, result: undefined, executionPlan: undefined, planXml: undefined, tabTitle: '', externalChange: undefined };
    const tab = s.tabs.find((t) => t.id === queryTabId);
    return {
      isExecuting: tab?.isExecuting ?? false,
      isExplaining: tab?.isExplaining ?? false,
      error: tab?.error,
      result: tab?.result,
      executionPlan: tab?.executionPlan,
      planXml: tab?.planXml,
      tabTitle: tab?.title ?? '',
      externalChange: tab?.externalChange,
    };
  }));
  const acceptExternalChange = useEditorStore((s) => s.acceptExternalChange);
  const dismissExternalChange = useEditorStore((s) => s.dismissExternalChange);
  const deferredResult = useDeferredValue(result);

  const [resultsView, setResultsView] = useState<ResultsView>('results');
  const [fullscreen, setFullscreen] = useState(false);

  // Inspector fullscreen — stores the result data from ObjectExecutor
  const [inspectorFs, setInspectorFs] = useState<{ result: QueryResult; objectName: string; definition?: string } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Toggle: if already showing, close; otherwise open with data
      setInspectorFs((prev) => prev ? null : detail);
    };
    window.addEventListener('qery:inspector-fullscreen', handler);
    return () => window.removeEventListener('qery:inspector-fullscreen', handler);
  }, []);

  useEffect(() => {
    if (!inspectorFs) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setInspectorFs(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inspectorFs]);

  // Clear all fullscreen when switching tabs
  useEffect(() => {
    setFullscreen(false);
    setInspectorFs(null);
  }, [activeTabId]);
  const compactResults = useUIStore((s) => s.compactResults);
  const toggleCompactResults = useUIStore((s) => s.toggleCompactResults);

  const toggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // Auto-switch to plan/results view
  useEffect(() => {
    const showPlan = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId === queryTabId) setResultsView('plan');
    };
    const showResults = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId === queryTabId) setResultsView('results');
    };
    window.addEventListener('qery:show-plan', showPlan);
    window.addEventListener('qery:show-results', showResults);
    return () => {
      window.removeEventListener('qery:show-plan', showPlan);
      window.removeEventListener('qery:show-results', showResults);
    };
  }, [queryTabId]);

  const setFocusedGroup = useEditorStore((s) => s.setFocusedGroup);
  const isInspectorActive = activeTabType === 'inspector';

  // Track the active inspector tab for keepalive — keeps last inspector visible when switching to query tabs
  const activeInspectorTabRef = useRef<string | undefined>(undefined);
  if (isInspectorActive && activeTabId) {
    activeInspectorTabRef.current = activeTabId;
  }
  if (activeInspectorTabRef.current && !inspectorTabIds.includes(activeInspectorTabRef.current)) {
    activeInspectorTabRef.current = inspectorTabIds[inspectorTabIds.length - 1];
  }
  const activeInspectorTabId = activeInspectorTabRef.current;

  const resultsToolbar = (
    <ResultsTabBar
      activeView={resultsView}
      onViewChange={setResultsView}
      hasPlan={!!executionPlan}
      result={deferredResult}
      queryName={tabTitle}
      compact={compactResults}
      onToggleCompact={toggleCompactResults}
      fullscreen={fullscreen}
      onToggleFullscreen={toggleFullscreen}
    />
  );

  // Active tab result content — used only for fullscreen overlay
  const activeResultContent = (
    <>
      {resultsView === 'plan' && executionPlan ? (
        <ExecutionPlanViewer plan={executionPlan} planXml={planXml} />
      ) : isExecuting || isExplaining ? (
        <ExecutingIndicator />
      ) : error ? (
        <ResultsMessages error={error} />
      ) : deferredResult ? (
        <ResultsGrid result={deferredResult} compact={compactResults} />
      ) : !isInspectorActive ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Run a query to see results ({modKey}Enter)
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col',
        isFocused && 'ring-1 ring-primary/30 ring-inset'
      )}
      onMouseDown={() => {
        if (!isFocused) setFocusedGroup(groupId);
      }}
    >
      <EditorGroupTabBar groupId={groupId} dropIndicatorIndex={dropPreview} />
      <div className="flex-1 overflow-hidden relative">
        {activeTabId ? (
          <>
            {/* Active inspector only — no keepalive (ReactFlow canvas bleeds through invisible) */}
            {isInspectorActive && activeInspectorTabId && (
              <div className="absolute inset-0 z-10 bg-background overflow-hidden flex flex-col">
                <TabInspectorContent tabId={activeInspectorTabId} />
              </div>
            )}

            {/* Keepalive query editors */}
            {queryTabIds.length > 0 && (
              <PanelGroup direction="vertical" className={cn(isInspectorActive && 'invisible')}>
                <Panel defaultSize={50} minSize={20}>
                  <div className="flex h-full flex-col">
                    {queryTabId && <EditorToolbar tabId={queryTabId} />}
                    {queryTabId && externalChange !== undefined && (
                      <div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs shrink-0">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="flex-1 text-amber-700 dark:text-amber-400">
                          This query was updated in another tab.
                        </span>
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => acceptExternalChange(queryTabId)}>
                          Accept Changes
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => dismissExternalChange(queryTabId)}>
                          Benimkini Koru
                        </Button>
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden relative">
                      {queryTabIds.map(tId => (
                        <div
                          key={tId}
                          className={cn(
                            'absolute inset-0',
                            tId !== queryTabId && 'invisible pointer-events-none'
                          )}
                        >
                          <QueryEditor tabId={tId} />
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
                <Panel defaultSize={50} minSize={15}>
                  <div className="flex h-full flex-col overflow-hidden">
                    {resultsToolbar}
                    <div className="flex-1 overflow-hidden relative">
                      {/* Plan view overlay for active tab */}
                      {resultsView === 'plan' && executionPlan && (
                        <div className="absolute inset-0 z-10 bg-background">
                          <ExecutionPlanViewer plan={executionPlan} planXml={planXml} />
                        </div>
                      )}
                      {/* Keepalive result grids — each tab stays mounted */}
                      {queryTabIds.map(tId => (
                        <div
                          key={tId}
                          className={cn(
                            'absolute inset-0',
                            tId !== queryTabId && 'invisible pointer-events-none'
                          )}
                        >
                          <TabResultContent tabId={tId} compact={compactResults} />
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            )}

            {queryTabIds.length === 0 && !isInspectorActive && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No open tabs
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No open tabs
          </div>
        )}
        <DroppableEdgeZone groupId={groupId} isDragging={isDragging} />

        {/* Fullscreen results overlay — fills the tab content area */}
        {fullscreen && (
          <div className="absolute inset-0 z-30 bg-background flex flex-col">
            {resultsToolbar}
            <div className="flex-1 overflow-hidden">
              {activeResultContent}
            </div>
          </div>
        )}

        {/* Inspector fullscreen — shows execution results covering entire area */}
        {inspectorFs && (
          <div className="absolute inset-0 z-30 bg-background flex flex-col">
            <ResultsToolbar
              result={inspectorFs.result}
              objectName={inspectorFs.objectName}
              fullscreen
              onToggleFullscreen={() => setInspectorFs(null)}
            />
            <div className="flex-1 overflow-hidden">
              <ResultsGrid
                result={inspectorFs.result}
                definition={inspectorFs.definition}
                compact={compactResults}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
