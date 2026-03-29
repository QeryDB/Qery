import { useRef, useState, useEffect, useDeferredValue, memo, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { ResultsGrid } from '@/components/results/ResultsGrid';
import { ResultsMessages } from '@/components/results/ResultsMessages';
import { InspectorSkeleton } from '@/components/inspector/InspectorSkeleton';
import { modKey } from '@/lib/utils';

/** Error boundary that catches inspector crashes and shows a recovery UI */
class InspectorErrorBoundary extends Component<{ tabId: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[InspectorErrorBoundary] Crash caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <div className="text-sm font-medium">This tab crashed</div>
          <div className="text-xs text-muted-foreground max-w-md">{this.state.error.message}</div>
          <button
            className="mt-2 text-xs text-primary hover:underline"
            onClick={() => {
              useEditorStore.getState().closeTab(this.props.tabId);
            }}
          >
            Close this tab
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TableInspector = lazy(() => import('@/components/inspector/TableInspector').then(m => ({ default: m.TableInspector })));
const ViewInspector = lazy(() => import('@/components/inspector/ViewInspector').then(m => ({ default: m.ViewInspector })));
const ProcedureInspector = lazy(() => import('@/components/inspector/ProcedureInspector').then(m => ({ default: m.ProcedureInspector })));
const FunctionInspector = lazy(() => import('@/components/inspector/FunctionInspector').then(m => ({ default: m.FunctionInspector })));
const GenericInspector = lazy(() => import('@/components/inspector/GenericInspector').then(m => ({ default: m.GenericInspector })));

export function ExecutingIndicator() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <div className="text-sm text-muted-foreground">
        Executing query...{elapsed > 0 && ` ${elapsed}s`}
      </div>
    </div>
  );
}

/** Per-tab inspector content — kept alive so Veri grid scroll/state survives tab switches */
export const TabInspectorContent = memo(function TabInspectorContent({ tabId }: { tabId: string }) {
  const { target, breadcrumb } = useEditorStore(useShallow((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    if (!tab || tab.type !== 'inspector' || !tab.inspectorTarget) {
      return { target: null as InspectorTarget | null, breadcrumb: [] as InspectorTarget[] };
    }
    return { target: tab.inspectorTarget, breadcrumb: tab.breadcrumb || [] };
  }));

  if (!target) return null;

  const { connectionId, database, table: name, schema, objectType, definition, functionType } = target;

  // Key forces React to remount when navigating to a different object (resets internal state like ReactFlow nodes)
  const inspectorKey = `${connectionId}-${database}-${schema}-${name}-${objectType}`;

  const inner = (() => {
    switch (objectType) {
      case 'view':
        return <ViewInspector connectionId={connectionId} database={database} name={name} schema={schema} definition={definition} breadcrumb={breadcrumb} tabId={tabId} />;
      case 'procedure':
        return <ProcedureInspector connectionId={connectionId} database={database} name={name} schema={schema} definition={definition} breadcrumb={breadcrumb} tabId={tabId} />;
      case 'function':
        return <FunctionInspector connectionId={connectionId} database={database} name={name} schema={schema} definition={definition} functionType={functionType} breadcrumb={breadcrumb} tabId={tabId} />;
      case 'table':
        return <TableInspector connectionId={connectionId} database={database} table={name} schema={schema} breadcrumb={breadcrumb} tabId={tabId} />;
      default:
        return <GenericInspector connectionId={connectionId} database={database} name={name} schema={schema} objectType={objectType || 'table'} definition={definition} breadcrumb={breadcrumb} tabId={tabId} />;
    }
  })();

  return (
    <InspectorErrorBoundary key={inspectorKey} tabId={tabId}>
      <Suspense fallback={<InspectorSkeleton />}>
        {inner}
      </Suspense>
    </InspectorErrorBoundary>
  );
});

/** Per-tab result content — kept alive so scroll/filters survive tab switches */
export const TabResultContent = memo(function TabResultContent({ tabId, compact }: { tabId: string; compact: boolean }) {
  const { isExecuting, isExplaining, error, result } = useEditorStore(useShallow((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    if (!tab) return { isExecuting: false, isExplaining: false, error: null as string | null, result: null as any };
    return {
      isExecuting: tab.isExecuting,
      isExplaining: tab.isExplaining ?? false,
      error: tab.error ?? null,
      result: tab.result ?? null,
    };
  }));
  const deferredResult = useDeferredValue(result);

  if (isExecuting || isExplaining) return <ExecutingIndicator />;
  if (error) return <ResultsMessages error={error} />;
  if (deferredResult) return <ResultsGrid result={deferredResult} compact={compact} />;

  return (
    <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
      <span>Run a query to see results ({modKey}Enter)</span>
    </div>
  );
});
