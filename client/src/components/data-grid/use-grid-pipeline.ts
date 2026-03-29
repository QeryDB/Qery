import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { FilterItem } from './types';

interface UseGridPipelineInput {
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
  /** When set, hiddenColumns + filters are persisted to localStorage under this key. */
  persistKey?: string;
}

/* ── localStorage helpers ── */
interface GridPrefs {
  hiddenColumns: string[];
  filters: FilterItem[];
}

function loadGridPrefs(key: string): GridPrefs | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveGridPrefs(key: string, hidden: Set<string>, filters: Map<string, FilterItem>) {
  const data: GridPrefs = {
    hiddenColumns: Array.from(hidden),
    filters: Array.from(filters.values()),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

/* ── Module-level cache so pipeline state survives component remounts ── */
interface PipelineCache {
  hiddenColumns: Set<string>;
  filters: Map<string, FilterItem>;
}
const pipelineStateCache = new Map<string, PipelineCache>();

interface SearchMatch {
  col: number;
  row: number;
}

function evaluateFilter(filter: FilterItem, cellValue: any): boolean {
  if (filter.operator === 'is_null') return cellValue === null || cellValue === undefined;
  if (filter.operator === 'is_not_null') return cellValue !== null && cellValue !== undefined;

  if (cellValue === null || cellValue === undefined) return false;

  const filterValue = filter.value ?? '';
  const numCell = Number(cellValue);
  const numFilter = Number(filterValue);
  const bothNumeric = !isNaN(numCell) && !isNaN(numFilter) && filterValue !== '';

  switch (filter.operator) {
    case 'eq':
      return bothNumeric ? numCell === numFilter : String(cellValue) === filterValue;
    case 'neq':
      return bothNumeric ? numCell !== numFilter : String(cellValue) !== filterValue;
    case 'gt':
      return bothNumeric ? numCell > numFilter : String(cellValue) > filterValue;
    case 'lt':
      return bothNumeric ? numCell < numFilter : String(cellValue) < filterValue;
    case 'gte':
      return bothNumeric ? numCell >= numFilter : String(cellValue) >= filterValue;
    case 'lte':
      return bothNumeric ? numCell <= numFilter : String(cellValue) <= filterValue;
    case 'contains':
      return String(cellValue).toLowerCase().includes(filterValue.toLowerCase());
    default:
      return true;
  }
}

/* ── Turkish / diacritic normalization ── */
const TR_MAP: Record<string, string> = {
  'ı': 'i', 'İ': 'I',
  'ö': 'o', 'Ö': 'O',
  'ü': 'u', 'Ü': 'U',
  'ç': 'c', 'Ç': 'C',
  'ş': 's', 'Ş': 'S',
  'ğ': 'g', 'Ğ': 'G',
};
const TR_RE = /[ıİöÖüÜçÇşŞğĞ]/g;

function normalizeTurkish(s: string): string {
  return s.replace(TR_RE, (ch) => TR_MAP[ch] ?? ch);
}

/* ── Unicode-aware whole-word match ── */
const WORD_RE = /[\p{L}\p{N}_]/u;

function containsWholeWord(haystack: string, needle: string): boolean {
  let idx = 0;
  while (idx <= haystack.length - needle.length) {
    const pos = haystack.indexOf(needle, idx);
    if (pos === -1) return false;
    const beforeOk = pos === 0 || !WORD_RE.test(haystack[pos - 1]);
    const afterPos = pos + needle.length;
    const afterOk = afterPos >= haystack.length || !WORD_RE.test(haystack[afterPos]);
    if (beforeOk && afterOk) return true;
    idx = pos + 1;
  }
  return false;
}

export function useGridPipeline({ columns, rows, persistKey }: UseGridPipelineInput) {
  const colNames = useMemo(() => new Set(columns.map((c) => c.name)), [columns]);

  const resetKey = persistKey ?? columns.map((c) => c.name).join('\x00');

  /* ── Column visibility ── */
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    // 1. Module-level cache (survives remount within session)
    const cached = pipelineStateCache.get(resetKey);
    if (cached) return new Set([...cached.hiddenColumns].filter((n) => colNames.has(n)));
    // 2. localStorage (survives page refresh, only for persistent grids)
    if (persistKey) {
      const prefs = loadGridPrefs(persistKey);
      if (prefs) return new Set(prefs.hiddenColumns.filter((n) => colNames.has(n)));
    }
    return new Set();
  });

  const toggleColumn = useCallback((colName: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  }, []);

  const showAll = useCallback(() => setHiddenColumns(new Set()), []);
  const hideAll = useCallback(() => {
    setHiddenColumns(new Set(columns.map((c) => c.name)));
  }, [columns]);

  /* ── Filtering ── */
  const [filters, setFiltersState] = useState<Map<string, FilterItem>>(() => {
    // 1. Module-level cache
    const cached = pipelineStateCache.get(resetKey);
    if (cached?.filters?.size) return new Map([...cached.filters].filter(([col]) => colNames.has(col)));
    // 2. localStorage
    if (persistKey) {
      const prefs = loadGridPrefs(persistKey);
      if (prefs?.filters?.length) return new Map(prefs.filters.filter((f) => colNames.has(f.column)).map((f) => [f.column, f]));
    }
    return new Map();
  });

  const setFilter = useCallback((filter: FilterItem) => {
    setFiltersState((prev) => {
      const next = new Map(prev);
      next.set(filter.column, filter);
      return next;
    });
  }, []);

  const removeFilter = useCallback((column: string) => {
    setFiltersState((prev) => {
      const next = new Map(prev);
      next.delete(column);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setFiltersState(new Map()), []);

  /* ── Search ── */
  const [searchTerm, setSearchTermRaw] = useState('');
  const [showSearch, setShowSearchRaw] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchNormalize, setSearchNormalize] = useState(true); // default ON for Turkish

  const setSearchTerm = useCallback((term: string) => {
    setSearchTermRaw(term);
    setCurrentMatchIdx(0);
  }, []);

  const setShowSearch = useCallback((show: boolean) => {
    setShowSearchRaw(show);
    if (!show) {
      setSearchTermRaw('');
      setCurrentMatchIdx(0);
    }
  }, []);

  /* ── Reset / reload on context change ── */
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (prevResetKeyRef.current === resetKey) return;
    prevResetKeyRef.current = resetKey;

    const valid = new Set(columns.map((c) => c.name));

    // 1. Try module-level cache first
    const cached = pipelineStateCache.get(resetKey);
    if (cached) {
      setHiddenColumns(new Set([...cached.hiddenColumns].filter((n) => valid.has(n))));
      setFiltersState(
        cached.filters.size > 0
          ? new Map([...cached.filters].filter(([col]) => valid.has(col)))
          : new Map(),
      );
    } else if (persistKey) {
      // 2. Fall back to localStorage
      const prefs = loadGridPrefs(persistKey);
      setHiddenColumns(prefs ? new Set(prefs.hiddenColumns.filter((n) => valid.has(n))) : new Set());
      setFiltersState(
        prefs?.filters?.length
          ? new Map(prefs.filters.filter((f) => valid.has(f.column)).map((f) => [f.column, f]))
          : new Map(),
      );
    } else {
      setHiddenColumns(new Set());
      setFiltersState(new Map());
    }

    // Always reset search
    setSearchTermRaw('');
    setShowSearchRaw(false);
    setCurrentMatchIdx(0);
  }, [resetKey, persistKey, columns]);

  /* ── Persist to localStorage + module cache on change ── */
  useEffect(() => {
    // Always update module-level cache (survives remounts)
    pipelineStateCache.set(resetKey, { hiddenColumns, filters });
    // Also persist to localStorage if we have a persistKey
    if (persistKey) {
      saveGridPrefs(persistKey, hiddenColumns, filters);
    }
  }, [resetKey, persistKey, hiddenColumns, filters]);

  /* ── Processed columns (visibility) ── */
  const processedColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.name)),
    [columns, hiddenColumns],
  );

  /* ── Processed rows (filtering) + index mapping ── */
  const { processedRows, filteredToOriginal } = useMemo(() => {
    if (filters.size === 0) {
      return {
        processedRows: rows,
        filteredToOriginal: rows.map((_, i) => i),
      };
    }

    const activeFilters = Array.from(filters.values());
    const filtered: Record<string, any>[] = [];
    const mapping: number[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pass = activeFilters.every((f) => evaluateFilter(f, row[f.column]));
      if (pass) {
        filtered.push(row);
        mapping.push(i);
      }
    }

    return { processedRows: filtered, filteredToOriginal: mapping };
  }, [rows, filters]);

  /* ── Search matches ── */
  const searchMatches = useMemo<SearchMatch[]>(() => {
    if (!searchTerm || !showSearch) return [];

    const prepare = (s: string) => {
      let v = s;
      if (searchNormalize) v = normalizeTurkish(v);
      if (!searchCaseSensitive) v = v.toLowerCase();
      return v;
    };

    const term = prepare(searchTerm);
    const matches: SearchMatch[] = [];

    for (let rowIdx = 0; rowIdx < processedRows.length; rowIdx++) {
      const row = processedRows[rowIdx];
      for (let colIdx = 0; colIdx < processedColumns.length; colIdx++) {
        const val = row[processedColumns[colIdx].name];
        if (val === null || val === undefined) continue;
        const hay = prepare(String(val));
        const hit = searchWholeWord ? containsWholeWord(hay, term) : hay.includes(term);
        if (hit) {
          matches.push({ col: colIdx, row: rowIdx });
        }
      }
    }

    return matches;
  }, [searchTerm, showSearch, processedRows, processedColumns, searchCaseSensitive, searchWholeWord, searchNormalize]);

  /* ── Highlight regions for Glide ── */
  const highlightRegions = useMemo(() => {
    if (searchMatches.length === 0) return undefined;

    return searchMatches.map((match, i) => ({
      color: i === currentMatchIdx ? '#fbbf2480' : '#fbbf2430',
      range: { x: match.col, y: match.row, width: 1, height: 1 },
      style: (i === currentMatchIdx ? 'solid' : 'no-outline') as 'solid' | 'no-outline',
    }));
  }, [searchMatches, currentMatchIdx]);

  const nextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const prevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

  /* ── Row index mapping ── */
  const originalRowIndex = useCallback(
    (filteredIdx: number) => filteredToOriginal[filteredIdx] ?? filteredIdx,
    [filteredToOriginal],
  );

  const visibleColumns = useMemo(
    () => new Set(processedColumns.map((c) => c.name)),
    [processedColumns],
  );

  return {
    // Column visibility
    visibleColumns,
    hiddenColumns,
    toggleColumn,
    showAll,
    hideAll,

    // Filtering
    filters,
    setFilter,
    removeFilter,
    clearFilters,

    // Search
    searchTerm,
    setSearchTerm,
    showSearch,
    setShowSearch,
    searchCaseSensitive,
    setSearchCaseSensitive,
    searchWholeWord,
    setSearchWholeWord,
    searchNormalize,
    setSearchNormalize,
    searchMatches,
    currentMatchIdx,
    nextMatch,
    prevMatch,

    // Processed data
    processedColumns,
    processedRows,
    originalRowIndex,

    // Highlight regions
    highlightRegions,
  };
}
