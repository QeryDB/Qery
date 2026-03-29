import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEditorStore } from '@/stores/editor-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useDialect } from '@/hooks/useDriver';
import { useExecuteQuery } from '@/hooks/useQuery';
import { useUIStore } from '@/stores/ui-store';
import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { getOrBuildSchemaCompletion, isSchemaCompletionCached } from './schema-completion';
import { useSchema } from '@/hooks/useSchema';
import {
  schemaTooltipExtension,
  schemaDataFacet,
  schemaCallbacksFacet,
  buildLookupMap,
  type SchemaTooltipCallbacks,
} from './schema-tooltip-extension';
import { qeryLightTheme } from './qery-light-theme';
import { qeryDarkTheme } from './qery-dark-theme';
import { isMac } from '@/lib/utils';
import { useRelationshipOverrides } from '@/hooks/useGhostFKs';
import { preloadParser } from './sql-ast-service';

interface Props {
  tabId: string;
}

export const QueryEditor = React.memo(function QueryEditor({ tabId }: Props) {
  const tabSql = useEditorStore((s) => s.tabs.find((t) => t.id === tabId)?.sql ?? '');
  const updateTabSql = useEditorStore((s) => s.updateTabSql);
  const setTabResult = useEditorStore((s) => s.setTabResult);
  const setTabExecuting = useEditorStore((s) => s.setTabExecuting);
  const formatSignal = useEditorStore((s) => s.formatSignal);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const activeDialect = useDialect();
  const theme = useUIStore((s) => s.theme);
  const executeMutation = useExecuteQuery();
  const { data: schemaData } = useSchema(activeConnectionId, activeDatabase);
  // Relationship overrides read from local SQLite — no live DB needed
  const { data: relOverrides } = useRelationshipOverrides(activeConnectionId, activeDatabase);
  const manualRels = relOverrides?.manual;
  const dismissedKeys = relOverrides?.dismissed;
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const executeQueryRef = useRef<() => void>(() => {});
  const formatSQLRef = useRef<() => void>(() => {});

  // Per-editor compartments for deferred schema completion + dialect switching
  const schemaCompartmentRef = useRef(new Compartment());
  const dialectCompartmentRef = useRef(new Compartment());
  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);

  // Stable callbacks for schema tooltips — read latest state from stores.
  // Uses navigateInspector when an inspector tab is active (builds breadcrumbs),
  // falls back to addInspectorTab for the first navigation.
  const schemaCallbacks = useMemo<SchemaTooltipCallbacks>(() => {
    const navigate = (target: import('@/stores/editor-store').InspectorTarget) => {
      const state = useEditorStore.getState();
      const focusedGroup = state.layout.groups.find((g) => g.id === state.layout.focusedGroupId);
      const activeTab = focusedGroup?.activeTabId
        ? state.tabs.find((t) => t.id === focusedGroup.activeTabId)
        : null;

      // If an inspector tab is focused, chain via navigateInspector (breadcrumbs)
      if (activeTab?.type === 'inspector' && activeTab.inspectorTarget) {
        state.navigateInspector(activeTab.id, target);
      } else {
        state.addInspectorTab(target);
      }
    };

    return {
      onInspectTable: (schema, table) => {
        const connId = useConnectionStore.getState().activeConnectionId;
        const db = useConnectionStore.getState().activeDatabase;
        if (!connId || !db) return;
        navigate({ connectionId: connId, database: db, table, schema, objectType: 'table' });
      },
      onOpenDefinition: (type, name, schema, definition) => {
        const connId = useConnectionStore.getState().activeConnectionId;
        const db = useConnectionStore.getState().activeDatabase;
        if (!connId || !db) return;
        navigate({
          connectionId: connId, database: db, table: name, schema,
          objectType: type.toLowerCase() as 'view' | 'procedure' | 'function',
          definition,
        });
      },
      onOpenDocumentation: (schema, table) => {
        const connId = useConnectionStore.getState().activeConnectionId;
        const db = useConnectionStore.getState().activeDatabase;
        if (!connId || !db) return;
        navigate({ connectionId: connId, database: db, table, schema, objectType: 'table' });
      },
    };
  }, []);

  // Loading state — only true during the brief build phase (cache cold)
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(false);
  const loadedSchemaRef = useRef<unknown>(null);

  // Ref-stable loader — called from CM focus handler
  const loadSchemaRef = useRef<() => void>(() => {});
  loadSchemaRef.current = () => {
    const view = editorRef.current?.view;
    if (!view || !schemaData || schemaData === loadedSchemaRef.current) return;

    // Cache warm → load instantly, no indicator
    if (isSchemaCompletionCached(schemaData)) {
      const ext = getOrBuildSchemaCompletion(schemaData, manualRels, dismissedKeys, activeDialect.codeMirrorDialect, activeDialect.defaultSchema);
      const lookupMap = buildLookupMap(schemaData);
      view.dispatch({ effects: schemaCompartmentRef.current.reconfigure([ext, schemaDataFacet.of(lookupMap)]) });
      loadedSchemaRef.current = schemaData;
      return;
    }

    // Cache cold → show loading bar, yield to paint, then build
    setIsLoadingCompletions(true);
    setTimeout(() => {
      const v = editorRef.current?.view;
      if (!v || !schemaData) { setIsLoadingCompletions(false); return; }
      const ext = getOrBuildSchemaCompletion(schemaData, manualRels, dismissedKeys, activeDialect.codeMirrorDialect, activeDialect.defaultSchema);
      const lookupMap = buildLookupMap(schemaData);
      v.dispatch({ effects: schemaCompartmentRef.current.reconfigure([ext, schemaDataFacet.of(lookupMap)]) });
      loadedSchemaRef.current = schemaData;
      setIsLoadingCompletions(false);
    }, 16);
  };

  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); preloadParser(); }, []);

  // Auto-load completions when schema data arrives (fixes race: focus before data)
  useEffect(() => {
    if (!schemaData || schemaData === loadedSchemaRef.current) return;
    loadSchemaRef.current();
    const timer = setTimeout(() => loadSchemaRef.current(), 100);
    return () => clearTimeout(timer);
  }, [schemaData]);

  // Rebuild completions when manual relationships or dismissed keys change (non-blocking)
  useEffect(() => {
    if (!schemaData || !manualRels) return;
    const timer = setTimeout(() => {
      const view = editorRef.current?.view;
      if (!view || !schemaData) return;
      const ext = getOrBuildSchemaCompletion(schemaData, manualRels, dismissedKeys, activeDialect.codeMirrorDialect, activeDialect.defaultSchema);
      const lookupMap = buildLookupMap(schemaData);
      view.dispatch({ effects: schemaCompartmentRef.current.reconfigure([ext, schemaDataFacet.of(lookupMap)]) });
    }, 16);
    return () => clearTimeout(timer);
  }, [manualRels, dismissedKeys]);

  // Update dialect when connection type changes
  const prevDialectRef = useRef(activeDialect);
  useEffect(() => {
    if (prevDialectRef.current !== activeDialect) {
      prevDialectRef.current = activeDialect;
      const view = editorRef.current?.view;
      if (view) {
        view.dispatch({
          effects: dialectCompartmentRef.current.reconfigure(
            sql({ dialect: activeDialect.codeMirrorDialect, upperCaseKeywords: true })
          ),
        });
        loadedSchemaRef.current = null;
        loadSchemaRef.current();
      }
    }
  }, [activeDialect]);

  const executeQuery = useCallback(async () => {
    const currentSql = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.sql ?? '';
    if (!activeConnectionId || !activeDatabase || !currentSql.trim()) return;
    setTabExecuting(tabId, true);
    try {
      const result = await executeMutation.mutateAsync({
        connectionId: activeConnectionId,
        database: activeDatabase,
        sql: currentSql,
      });
      setTabResult(tabId, result);
      window.dispatchEvent(new CustomEvent('qery:show-results', { detail: { tabId } }));
    } catch (error: any) {
      setTabResult(tabId, null, error.message);
      window.dispatchEvent(new CustomEvent('qery:show-results', { detail: { tabId } }));
    }
  }, [activeConnectionId, activeDatabase, tabId]);

  executeQueryRef.current = executeQuery;

  const handleFormat = useCallback(async () => {
    const view = editorRef.current?.view;
    if (!view) return;
    const currentSQL = view.state.doc.toString();
    if (!currentSQL.trim()) return;
    try {
      const { formatDialect } = await import('sql-formatter');
      const formatted = formatDialect(currentSQL, { dialect: activeDialect.formatterDialect, tabWidth: 2, keywordCase: 'upper' });
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
    } catch { /* invalid SQL */ }
  }, []);

  formatSQLRef.current = handleFormat;

  useEffect(() => {
    if (formatSignal > 0) handleFormat();
  }, [formatSignal, handleFormat]);

  // Global keyboard shortcuts — capture phase runs before CodeMirror's keymap
  // system, which prevents autocompletion from swallowing Cmd+Enter on Mac.
  // Also works when focus is outside the editor (e.g. results grid).
  useEffect(() => {
    const isActiveTab = () =>
      useEditorStore.getState().layout.groups.some((g) => g.activeTabId === tabId);

    const handler = (e: KeyboardEvent) => {
      if (!isActiveTab()) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        executeQueryRef.current();
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        executeQueryRef.current();
        return;
      }
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        formatSQLRef.current();
        return;
      }
      if (!e.shiftKey && mod && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event('qery:explain-query'));
        return;
      }
      if (!e.shiftKey && mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event('qery:save-query'));
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [tabId]);

  // Extensions — schema completion starts empty, activated on editor focus
  const extensions = useMemo(() => [
    dialectCompartmentRef.current.of(sql({ dialect: activeDialect.codeMirrorDialect, upperCaseKeywords: true })),
    EditorView.domEventHandlers({
      focus: () => { loadSchemaRef.current(); },
    }),
    EditorView.theme({
      '.cm-completionIcon-property::after': { content: '"◇"' },
    }),
    // Schema tooltips: hover + Cmd/Ctrl+Click
    ...schemaTooltipExtension(),
    schemaCallbacksFacet.of(schemaCallbacks),
    schemaCompartmentRef.current.of([]),
  ], []);

  if (!ready) {
    return (
      <pre className="h-full overflow-auto bg-background p-4 font-mono text-sm whitespace-pre-wrap">{tabSql || '\n'}</pre>
    );
  }

  return (
    <div className="h-full relative" data-tour="query-editor">
      <CodeMirror
        ref={editorRef}
        value={tabSql}
        onChange={(value) => updateTabSql(tabId, value)}
        extensions={extensions}
        theme={theme === 'dark' ? qeryDarkTheme : qeryLightTheme}
        className="h-full"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          autocompletion: true,
        }}
      />
      {isLoadingCompletions && (
        <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none">
          <div className="h-[2px] overflow-hidden bg-primary/10">
            <div
              className="h-full rounded-full bg-primary/50"
              style={{ width: '30%', animation: 'indeterminate 1.5s ease-in-out infinite' }}
            />
          </div>
        </div>
      )}
    </div>
  );
});
