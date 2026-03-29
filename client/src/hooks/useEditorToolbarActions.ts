import { useState, useEffect, useCallback, useRef } from 'react';
import { checkSqlSafety, type SqlSafetyResult } from '@/lib/sql-safety';
import { useEditorStore } from '@/stores/editor-store';
import { useConnectionStore } from '@/stores/connection-store';
import { useExecuteQuery, useExplainQuery, cancelQuery } from '@/hooks/useQuery';
import { parsePlanXml } from '@/lib/plan-parser';
import { parsePgPlan } from '@/lib/pg-plan-parser';
import { getDialect } from '@/lib/dialect';
import { useUpdateSavedQuery } from '@/hooks/useSavedQueries';
import { useShallow } from 'zustand/react/shallow';

/** Extract error message — Tauri invoke rejects with a plain string, not Error */
function errMsg(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err) || 'Unknown error';
}

export function useEditorToolbarActions(tabId: string) {
  const { tabSql, isExecuting, isExplaining, savedQueryId } = useEditorStore(useShallow((s) => {
    const tab = s.tabs.find((t) => t.id === tabId);
    return {
      tabSql: tab?.sql ?? '',
      isExecuting: tab?.isExecuting ?? false,
      isExplaining: tab?.isExplaining ?? false,
      savedQueryId: tab?.savedQueryId,
    };
  }));
  const setTabResult = useEditorStore((s) => s.setTabResult);
  const setTabExecuting = useEditorStore((s) => s.setTabExecuting);
  const setTabPlan = useEditorStore((s) => s.setTabPlan);
  const setTabExplaining = useEditorStore((s) => s.setTabExplaining);
  const triggerFormat = useEditorStore((s) => s.triggerFormat);
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const executeMutation = useExecuteQuery();
  const explainMutation = useExplainQuery();
  const updateMutation = useUpdateSavedQuery();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [safetyWarning, setSafetyWarning] = useState<SqlSafetyResult | null>(null);
  const [suppressWarning, setSuppressWarning] = useState(false);
  const pendingSqlRef = useRef<string | null>(null);

  const handleExplain = useCallback(async () => {
    const currentSql = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.sql ?? '';
    if (!activeConnectionId || !activeDatabase || !currentSql.trim()) return;

    setTabExplaining(tabId, true);
    try {
      const result = await explainMutation.mutateAsync({
        connectionId: activeConnectionId,
        database: activeDatabase,
        sql: currentSql,
      });

      const dbType = useConnectionStore.getState().activeDatabaseType || 'mssql';
      const dialect = getDialect(dbType);

      if (dialect.planFormat === 'json') {
        // PG returns JSON plan as rows from EXPLAIN (FORMAT JSON)
        const planRows = Array.isArray(result) ? result : (result as any).planXml ? null : [result];
        if (planRows) {
          const plan = parsePgPlan(planRows);
          const planJson = JSON.stringify(planRows, null, 2);
          setTabPlan(tabId, plan, null, planJson);
        } else {
          setTabPlan(tabId, null, 'Could not parse PostgreSQL plan');
        }
      } else {
        // MSSQL returns XML plan
        const planXml = (result as any).planXml || (typeof result === 'string' ? result : '');
        const plan = parsePlanXml(planXml);
        setTabPlan(tabId, plan, null, planXml);
      }
      window.dispatchEvent(new CustomEvent('qery:show-plan', { detail: { tabId } }));
    } catch (error: any) {
      const raw = errMsg(error);
      const msg = raw.toLowerCase();
      const hint = msg.includes('showplan') || msg.includes('permission')
        ? `${raw}\n\nFix: GRANT SHOWPLAN TO [USERNAME];`
        : raw;
      setTabPlan(tabId, null, hint);
    }
  }, [tabId, activeConnectionId, activeDatabase]);

  // Listen for Ctrl+E keyboard shortcut event
  useEffect(() => {
    const explainHandler = () => { handleExplain(); };
    window.addEventListener('qery:explain-query', explainHandler);
    return () => window.removeEventListener('qery:explain-query', explainHandler);
  }, [handleExplain]);

  const notifyExternalChange = useEditorStore((s) => s.notifyExternalChange);

  const updateSnapshot = useCallback(() => {
    const state = useEditorStore.getState();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    useEditorStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, savedSqlSnapshot: t.sql } : t)),
    }));
    if (tab.savedQueryId) {
      notifyExternalChange(tab.savedQueryId, tab.sql, tabId);
    }
  }, [tabId, notifyExternalChange]);

  // Listen for Ctrl+S keyboard shortcut event
  useEffect(() => {
    const handler = () => {
      const currentSql = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.sql ?? '';
      const currentSavedQueryId = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.savedQueryId;
      if (currentSavedQueryId) {
        updateMutation.mutate({ id: currentSavedQueryId, sql_text: currentSql }, { onSuccess: updateSnapshot });
      } else {
        setSaveDialogOpen(true);
      }
    };
    window.addEventListener('qery:save-query', handler);
    return () => window.removeEventListener('qery:save-query', handler);
  }, [tabId, updateSnapshot]);

  const activeQueryIdRef = useRef<string | null>(null);

  const executeQuery = useCallback(async (sql: string) => {
    if (!activeConnectionId || !activeDatabase) return;
    const queryId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeQueryIdRef.current = queryId;
    setTabExecuting(tabId, true);
    try {
      const result = await executeMutation.mutateAsync({
        connectionId: activeConnectionId,
        database: activeDatabase,
        sql,
        queryId,
      });
      setTabResult(tabId, result);
      window.dispatchEvent(new CustomEvent('qery:show-results', { detail: { tabId } }));
    } catch (error: unknown) {
      setTabResult(tabId, null, errMsg(error));
      window.dispatchEvent(new CustomEvent('qery:show-results', { detail: { tabId } }));
    } finally {
      activeQueryIdRef.current = null;
    }
  }, [tabId, activeConnectionId, activeDatabase]);

  const handleRun = useCallback(async () => {
    const currentSql = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.sql ?? '';
    if (!activeConnectionId || !activeDatabase || !currentSql.trim()) return;

    if (!suppressWarning) {
      const safety = checkSqlSafety(currentSql);
      if (!safety.isSafe) {
        pendingSqlRef.current = currentSql;
        setSafetyWarning(safety);
        return;
      }
    }

    executeQuery(currentSql);
  }, [tabId, activeConnectionId, activeDatabase, suppressWarning, executeQuery]);

  const handleConfirmRun = useCallback(() => {
    const sql = pendingSqlRef.current;
    setSafetyWarning(null);
    pendingSqlRef.current = null;
    if (sql) executeQuery(sql);
  }, [executeQuery]);

  const handleCancelWarning = useCallback(() => {
    setSafetyWarning(null);
    pendingSqlRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    const qid = activeQueryIdRef.current;
    if (qid) {
      cancelQuery(qid).catch(() => {});
    }
  }, []);

  const handleSave = useCallback(() => {
    const currentSql = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.sql ?? '';
    const currentSavedQueryId = useEditorStore.getState().tabs.find((t) => t.id === tabId)?.savedQueryId;
    if (currentSavedQueryId) {
      updateMutation.mutate({ id: currentSavedQueryId, sql_text: currentSql }, { onSuccess: updateSnapshot });
    } else {
      setSaveDialogOpen(true);
    }
  }, [tabId, updateSnapshot]);

  const canRun = !!(tabSql.trim() && activeConnectionId && activeDatabase);

  return {
    tabSql,
    isExecuting,
    isExplaining,
    savedQueryId,
    canRun,
    handleRun,
    handleExplain,
    handleCancel,
    handleSave,
    triggerFormat,
    activeConnectionId,
    // Safety warning state
    safetyWarning,
    suppressWarning,
    setSuppressWarning,
    handleConfirmRun,
    handleCancelWarning,
    pendingSql: pendingSqlRef.current,
    // Save dialog state
    saveDialogOpen,
    setSaveDialogOpen,
    updateSnapshot,
  };
}
