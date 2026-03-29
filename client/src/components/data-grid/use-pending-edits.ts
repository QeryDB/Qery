import { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import type { PendingEdit } from './types';
import * as sessionState from '@/lib/session-state';

function editKey(rowIndex: number, column: string): string {
  return `${rowIndex}:${column}`;
}

// Module-level cache so edits survive component remounts
const editsCache = new Map<string, { edits: Map<string, PendingEdit>; newRows: Record<string, any>[] }>();

/** Check if a given cacheKey has any pending edits (non-hook, sync read from module cache). */
export function getCachedEditCount(cacheKey: string): number {
  const cached = editsCache.get(cacheKey);
  if (!cached) return 0;
  const newRowCount = cached.newRows.filter(r => Object.keys(r).length > 0).length;
  return cached.edits.size + newRowCount;
}

function serializeEdits(edits: Map<string, PendingEdit>, newRows: Record<string, any>[]): string {
  const editsArr = Array.from(edits.entries()).map(([k, v]) => ({ k, ...v }));
  return JSON.stringify({ edits: editsArr, newRows });
}

function deserializeEdits(json: string): { edits: Map<string, PendingEdit>; newRows: Record<string, any>[] } | null {
  try {
    const data = JSON.parse(json);
    const edits = new Map<string, PendingEdit>();
    for (const item of data.edits || []) {
      const { k, ...edit } = item;
      edits.set(k, edit);
    }
    return { edits, newRows: data.newRows || [] };
  } catch {
    return null;
  }
}

/**
 * @param cacheKey  Key for in-memory cache (survives remounts within session)
 * @param sessionKey  Full key for SQLite session state (must start with `{connId}:{db}:` prefix).
 *                    If omitted, session state persistence is disabled.
 */
export function usePendingEdits(cacheKey?: string, sessionKey?: string) {
  const cached = cacheKey ? editsCache.get(cacheKey) : undefined;
  const [edits, setEdits] = useState<Map<string, PendingEdit>>(() => cached?.edits ?? new Map());
  const [newRows, setNewRows] = useState<Record<string, any>[]>(() => cached?.newRows ?? []);

  // React to session state becoming loaded
  const ssVersion = useSyncExternalStore(sessionState.subscribe, sessionState.getSnapshot);

  // Hydrate from session state when it becomes available
  useEffect(() => {
    if (!cacheKey || !sessionKey || !sessionState.isLoaded()) return;
    // Don't overwrite if we already have data in the module cache
    if (editsCache.has(cacheKey) && editsCache.get(cacheKey)!.edits.size > 0) return;

    const persisted = sessionState.get(sessionKey);
    if (persisted) {
      const restored = deserializeEdits(persisted);
      if (restored && (restored.edits.size > 0 || restored.newRows.length > 0)) {
        editsCache.set(cacheKey, restored);
        setEdits(restored.edits);
        setNewRows(restored.newRows);
      }
    }
  }, [cacheKey, sessionKey, ssVersion]);

  // Sync state back to cache and session state on every change
  useEffect(() => {
    if (cacheKey) {
      editsCache.set(cacheKey, { edits, newRows });
      // Persist to session state (debounced)
      if (sessionKey && (edits.size > 0 || newRows.length > 0)) {
        sessionState.save(sessionKey, serializeEdits(edits, newRows));
      }
    }
  }, [cacheKey, sessionKey, edits, newRows]);

  const addEdit = useCallback((rowIndex: number, column: string, oldValue: any, newValue: any) => {
    const key = editKey(rowIndex, column);
    setEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(key);
      const original = existing ? existing.oldValue : oldValue;
      // eslint-disable-next-line eqeqeq
      if (newValue == original || (newValue === '' && original === null)) {
        next.delete(key);
      } else {
        next.set(key, { rowIndex, column, oldValue: original, newValue });
      }
      return next;
    });
  }, []);

  const addNewRowEdit = useCallback((newRowIndex: number, column: string, value: any) => {
    setNewRows(prev => {
      const next = [...prev];
      while (next.length <= newRowIndex) {
        next.push({});
      }
      if (value === '' || value === null || value === undefined) {
        const { [column]: _, ...rest } = next[newRowIndex];
        next[newRowIndex] = rest;
      } else {
        next[newRowIndex] = { ...next[newRowIndex], [column]: value };
      }
      while (next.length > 0 && Object.keys(next[next.length - 1]).length === 0) {
        next.pop();
      }
      return next;
    });
  }, []);

  const removeEdit = useCallback((key: string) => {
    setEdits(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setEdits(new Map());
    setNewRows([]);
    if (cacheKey) {
      editsCache.delete(cacheKey);
    }
    if (sessionKey) {
      sessionState.remove(sessionKey);
    }
  }, [cacheKey, sessionKey]);

  const replaceEdits = useCallback((newEdits: Map<string, PendingEdit>) => {
    setEdits(newEdits);
  }, []);

  const hasEdit = useCallback((rowIndex: number, column: string): boolean => {
    return edits.has(editKey(rowIndex, column));
  }, [edits]);

  const getEditedValue = useCallback((rowIndex: number, column: string): any | undefined => {
    const edit = edits.get(editKey(rowIndex, column));
    return edit?.newValue;
  }, [edits]);

  const hasNewRowData = useCallback((newRowIndex: number): boolean => {
    return newRowIndex >= 0 && newRowIndex < newRows.length && Object.keys(newRows[newRowIndex]).length > 0;
  }, [newRows]);

  const getNewRowValue = useCallback((newRowIndex: number, column: string): any => {
    if (newRowIndex >= 0 && newRowIndex < newRows.length) {
      return newRows[newRowIndex][column] ?? null;
    }
    return null;
  }, [newRows]);

  const newRowSlots = useMemo(() => newRows.length + 1, [newRows]);

  const newRowCount = useMemo(() => newRows.filter(r => Object.keys(r).length > 0).length, [newRows]);

  const editCount = useMemo(() => edits.size + newRowCount, [edits, newRowCount]);

  return {
    edits,
    newRows,
    addEdit,
    addNewRowEdit,
    removeEdit,
    clearAll,
    replaceEdits,
    editCount,
    hasEdit,
    getEditedValue,
    hasNewRowData,
    getNewRowValue,
    newRowSlots,
    newRowCount,
  };
}
