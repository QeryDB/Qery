import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSchema } from '@/hooks/useSchema';
import { useSchemaStore } from '@/stores/schema-store';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { useDialect } from '@/hooks/useDriver';
import { ColumnNode } from './ColumnNode';
import { Table2, Eye, Code2, FunctionSquare, Layers, Hash, List, Zap, Database, Loader2, RefreshCw, PanelRight, ChevronRight, ChevronDown, Star } from 'lucide-react';
import { useRefreshSchema } from '@/hooks/useSchema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TableInfo, ViewInfo } from '@/types/schema';
import { generateSelect, generateInsert, generateUpdate, generateDelete } from '@/lib/sql-templates';
import { useFavorites, useToggleFavorite } from '@/hooks/useFavorites';

interface ContextMenuItem {
  label: string;
  action: () => void;
  icon?: ReactNode;
  separator?: boolean;
  destructive?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// Flat row types for virtualization
type FlatRow =
  | { type: 'section'; key: string; label: string; icon: ReactNode; count: number; expanded: boolean }
  | { type: 'schema-group'; key: string; label: string; count: number; expanded: boolean }
  | { type: 'table'; key: string; table: TableInfo; matchingColumns: TableInfo['columns'] | null; shallow?: boolean }
  | { type: 'column'; key: string; column: NonNullable<TableInfo['columns']>[number]; parentTable: string; shallow?: boolean }
  | { type: 'view'; key: string; view: ViewInfo }
  | { type: 'proc'; key: string; item: { name: string; schema: string; definition?: string } }
  | { type: 'func'; key: string; item: { name: string; schema: string; definition?: string; type?: string } }
  | { type: 'generic'; key: string; objectType: string; item: { name: string; schema: string; [k: string]: any } };

const ROW_HEIGHT = 26;
const COLUMN_ROW_HEIGHT = 22;
const SECTION_ROW_HEIGHT = 34; // section headers get extra space (gap before first child)

interface Props {
  connectionId: string;
  database: string;
  onInspect?: (target: InspectorTarget) => void;
}

export function SchemaTree({ connectionId, database, onInspect }: Props) {
  const { t } = useTranslation();
  const { data: schema, isLoading } = useSchema(connectionId, database);
  const { expandedNodes, toggleNode, searchQuery } = useSchemaStore();
  const refreshMutation = useRefreshSchema();
  const addTab = useEditorStore((s) => s.addTab);
  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);
  const openDoc = useUIStore((s) => s.openDoc);

  // Breadcrumb-aware navigation: chains from active inspector tab if one is focused
  const inspectObject = useCallback((target: import('@/stores/editor-store').InspectorTarget) => {
    const state = useEditorStore.getState();
    const focusedGroup = state.layout.groups.find(g => g.id === state.layout.focusedGroupId);
    const activeTab = focusedGroup?.activeTabId
      ? state.tabs.find(t => t.id === focusedGroup.activeTabId)
      : null;
    if (activeTab?.type === 'inspector' && activeTab.inspectorTarget) {
      state.navigateInspector(activeTab.id, target);
    } else {
      state.addInspectorTab(target);
    }
  }, []);
  const dialect = useDialect();
  const { data: favorites = [] } = useFavorites(connectionId, database);
  const toggleFavorite = useToggleFavorite();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track sections the user explicitly collapsed while searching
  const [collapsedWhileSearching, setCollapsedWhileSearching] = useState<Set<string>>(new Set());

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

  // Reset collapsed overrides when search query changes
  const prevFilter = useRef(searchQuery);
  if (prevFilter.current !== searchQuery) {
    prevFilter.current = searchQuery;
    if (collapsedWhileSearching.size > 0) setCollapsedWhileSearching(new Set());
  }

  const filter = searchQuery.toLowerCase();

  // Section expand logic: auto-open when filter has results, but respect user collapse
  // Favorites section defaults to expanded (opt-out via toggle)
  const isSectionExpanded = (key: string, hasResults: boolean) => {
    if (filter && hasResults) {
      return !collapsedWhileSearching.has(key);
    }
    if (key === 'favorites') {
      // Favorites default to open; only close if user explicitly toggled it off
      return !expandedNodes.has('favorites-collapsed');
    }
    return expandedNodes.has(key);
  };

  const toggleSection = (key: string, currentlyExpanded: boolean) => {
    if (filter) {
      // During search, track explicit collapse/expand
      setCollapsedWhileSearching((prev) => {
        const next = new Set(prev);
        if (currentlyExpanded) next.add(key);
        else next.delete(key);
        return next;
      });
    } else if (key === 'favorites') {
      // Favorites use inverted logic (default open)
      toggleNode('favorites-collapsed');
    } else {
      toggleNode(key);
    }
  };

  const filteredTables = useMemo(() => {
    if (!schema) return [];
    if (!filter) return schema.tables.map((t) => ({ table: t, matchingColumns: null as TableInfo['columns'] | null }));
    const results: { table: TableInfo; matchingColumns: TableInfo['columns'] | null }[] = [];
    for (const t of schema.tables) {
      const nameMatch = t.name.toLowerCase().includes(filter);
      const colMatches = t.columns?.filter((c) => c.name.toLowerCase().includes(filter)) || [];
      if (nameMatch) results.push({ table: t, matchingColumns: null });
      else if (colMatches.length > 0) results.push({ table: t, matchingColumns: colMatches });
    }
    return results;
  }, [schema, searchQuery]);

  const views = useMemo(() => {
    if (!schema) return [];
    return filter ? schema.views.filter((i) => i.name.toLowerCase().includes(filter)) : schema.views;
  }, [schema, searchQuery]);
  const procedures = useMemo(() => {
    if (!schema) return [];
    return filter ? schema.procedures.filter((i) => i.name.toLowerCase().includes(filter)) : schema.procedures;
  }, [schema, searchQuery]);
  const functions = useMemo(() => {
    if (!schema) return [];
    return filter ? schema.functions.filter((i) => i.name.toLowerCase().includes(filter)) : schema.functions;
  }, [schema, searchQuery]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  // Detect multiple schemas — if >1 schema, render grouped by schema
  const uniqueSchemas = useMemo(() => {
    if (!schema) return [];
    const schemaSet = new Set<string>();
    for (const t of schema.tables) schemaSet.add(t.schema);
    for (const v of schema.views) schemaSet.add(v.schema);
    for (const p of schema.procedures) schemaSet.add(p.schema);
    for (const f of schema.functions) schemaSet.add(f.schema);
    if (schema.objects) {
      for (const [, items] of Object.entries(schema.objects)) {
        if (Array.isArray(items)) {
          for (const item of items) if (item.schema) schemaSet.add(item.schema);
        }
      }
    }
    return Array.from(schemaSet).sort();
  }, [schema]);
  // Icon map for all object types
  const typeIconMap: Record<string, ReactNode> = {
    table: <Table2 className="h-4 w-4 text-blue-500" />,
    view: <Eye className="h-4 w-4 text-purple-500" />,
    procedure: <Code2 className="h-4 w-4 text-orange-500" />,
    function: <FunctionSquare className="h-4 w-4 text-teal-500" />,
    materialized_view: <Layers className="h-4 w-4 text-indigo-500" />,
    sequence: <Hash className="h-4 w-4 text-cyan-500" />,
    enum: <List className="h-4 w-4 text-pink-500" />,
    trigger: <Zap className="h-4 w-4 text-amber-500" />,
  };

  // Whether to use by-schema grouping (used by addTableRows and renderRow)
  const bySchema = dialect.treeGrouping === 'by-schema' && uniqueSchemas.length > 1;

  const addTableRows = (tables: typeof filteredTables, rows: FlatRow[], shallow = false) => {
    const prefix = shallow ? 'fav-' : '';
    for (const { table: tbl, matchingColumns } of tables) {
      const nodeKey = `${prefix}${bySchema ? `table-${tbl.schema}.${tbl.name}` : `table-${tbl.name}`}`;
      const tableExpanded = matchingColumns !== null
        ? !collapsedWhileSearching.has(nodeKey)
        : expandedNodes.has(nodeKey);
      rows.push({ type: 'table', key: nodeKey, table: tbl, matchingColumns, shallow });
      if (tableExpanded) {
        const cols = matchingColumns || tbl.columns;
        if (cols) {
          for (const col of cols) {
            rows.push({ type: 'column', key: `col-${prefix}${nodeKey}-${col.name}`, column: col, parentTable: tbl.name, shallow });
          }
        }
      }
    }
  };

  // Collect all objects as a unified list for by-schema grouping
  const allObjects = useMemo(() => {
    if (!schema) return [];
    const items: { objectType: string; item: any }[] = [];
    for (const tbl of schema.tables) items.push({ objectType: 'table', item: tbl });
    for (const v of schema.views) items.push({ objectType: 'view', item: v });
    for (const p of schema.procedures) items.push({ objectType: 'procedure', item: p });
    for (const f of schema.functions) items.push({ objectType: 'function', item: f });
    if (schema.objects) {
      const handled = new Set(['table', 'view', 'procedure', 'function']);
      for (const [key, arr] of Object.entries(schema.objects)) {
        if (!handled.has(key) && Array.isArray(arr)) {
          for (const item of arr) items.push({ objectType: key, item });
        }
      }
    }
    return items;
  }, [schema]);

  // Flatten tree into rows for virtualization
  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];

    if (dialect.treeGrouping === 'by-schema' && uniqueSchemas.length > 1) {
      // ── BY-SCHEMA GROUPING ──

      // Favorites section (top-level, always expanded by default)
      if (favoriteSet.size > 0) {
        const favTables = filteredTables.filter((ft) => favoriteSet.has(`${ft.table.schema}.${ft.table.name}`));
        if (favTables.length > 0) {
          const favExpanded = isSectionExpanded('favorites', true);
          rows.push({ type: 'section', key: 'favorites', label: t('schema.favorites'), icon: <Star className="h-4 w-4 text-yellow-500" />, count: favTables.length, expanded: favExpanded });
          if (favExpanded) addTableRows(favTables, rows, true);
        }
      }

      // Group all objects by schema, then by type within each schema
      for (const schemaName of uniqueSchemas) {
        const schemaItems = allObjects.filter(o => {
          if (o.item.schema !== schemaName) return false;
          if (!filter) return true;
          // Match by name
          if (o.item.name?.toLowerCase().includes(filter)) return true;
          // For tables, also match by column names
          if (o.objectType === 'table' && o.item.columns) {
            return o.item.columns.some((c: any) => c.name.toLowerCase().includes(filter));
          }
          return false;
        });
        if (schemaItems.length === 0 && !filter) continue;

        const schemaKey = `schema-${schemaName}`;
        const schemaExpanded = isSectionExpanded(schemaKey, schemaItems.length > 0);
        rows.push({ type: 'schema-group', key: schemaKey, label: schemaName, count: schemaItems.length, expanded: schemaExpanded });

        if (schemaExpanded) {
          // Group by object type within schema
          const objectTypes = schema?.object_types?.sort((a: any, b: any) => a.order - b.order) || [];
          const typeOrder = objectTypes.map((ot: any) => ot.key);
          // Add known types first, then any remaining
          const knownTypes = ['table', 'view', 'procedure', 'function'];
          const allTypes = [...new Set([...knownTypes, ...typeOrder])];

          for (const objType of allTypes) {
            const typeItems = schemaItems.filter(o => o.objectType === objType);
            if (typeItems.length === 0) continue;

            const otDesc = objectTypes.find((ot: any) => ot.key === objType);
            const typeLabel = otDesc?.label || (objType.charAt(0).toUpperCase() + objType.slice(1).replace(/_/g, ' ') + 's');
            const typeSectionKey = `${schemaKey}-${objType}`;
            const typeExpanded = isSectionExpanded(typeSectionKey, typeItems.length > 0);

            rows.push({
              type: 'section', key: typeSectionKey,
              label: typeLabel,
              icon: typeIconMap[objType] || <Code2 className="h-4 w-4 text-gray-500" />,
              count: typeItems.length, expanded: typeExpanded,
            });

            if (typeExpanded) {
              if (objType === 'table') {
                const tableFTs = typeItems.map(o => {
                  const matchingColumns = filter
                    ? (o.item.columns?.filter((c: any) => c.name.toLowerCase().includes(filter)) || null)
                    : null;
                  return { table: o.item, matchingColumns };
                });
                addTableRows(tableFTs, rows);
              } else if (objType === 'view') {
                for (const o of typeItems) rows.push({ type: 'view', key: `view-${schemaName}.${o.item.name}`, view: o.item });
              } else if (objType === 'procedure') {
                for (const o of typeItems) rows.push({ type: 'proc', key: `proc-${schemaName}.${o.item.name}`, item: o.item });
              } else if (objType === 'function') {
                for (const o of typeItems) rows.push({ type: 'func', key: `func-${schemaName}.${o.item.name}`, item: o.item });
              } else {
                for (const o of typeItems) rows.push({ type: 'generic', key: `${objType}-${schemaName}.${o.item.name}`, objectType: objType, item: o.item });
              }
            }
          }
        }
      }
    } else {
      // ── BY-TYPE GROUPING (default, MSSQL-style) ──

      // Favorites
      if (favoriteSet.size > 0) {
        const allTables = filteredTables;
        const pinnedTables = allTables.filter((ft) => favoriteSet.has(`${ft.table.schema}.${ft.table.name}`));
        const unpinnedTables = allTables.filter((ft) => !favoriteSet.has(`${ft.table.schema}.${ft.table.name}`));

        if (pinnedTables.length > 0) {
          const favExpanded = isSectionExpanded('favorites', true);
          rows.push({ type: 'section', key: 'favorites', label: t('schema.favorites'), icon: <Star className="h-4 w-4 text-yellow-500" />, count: pinnedTables.length, expanded: favExpanded });
          if (favExpanded) addTableRows(pinnedTables, rows);
        }

        const tablesExpanded = isSectionExpanded('tables', unpinnedTables.length > 0);
        rows.push({ type: 'section', key: 'tables', label: t('schema.tables'), icon: <Table2 className="h-4 w-4 text-blue-500" />, count: unpinnedTables.length, expanded: tablesExpanded });
        if (tablesExpanded) addTableRows(unpinnedTables, rows);
      } else {
        const tablesExpanded = isSectionExpanded('tables', filteredTables.length > 0);
        rows.push({ type: 'section', key: 'tables', label: t('schema.tables'), icon: <Table2 className="h-4 w-4 text-blue-500" />, count: filteredTables.length, expanded: tablesExpanded });
        if (tablesExpanded) addTableRows(filteredTables, rows);
      }

      // All non-table sections — driven by object_types metadata
      // Fallback map for legacy schemas that have views/procedures/functions at top level
      const objectData: Record<string, any[]> = {
        ...(schema?.objects || {}),
        view: schema?.objects?.['view'] || schema?.views || [],
        procedure: schema?.objects?.['procedure'] || schema?.procedures || [],
        function: schema?.objects?.['function'] || schema?.functions || [],
      };

      // Use object_types if available, otherwise build default sections
      const sectionTypes = schema?.object_types
        ? schema.object_types.filter((o: any) => o.key !== 'table').sort((a: any, b: any) => a.order - b.order)
        : [
            { key: 'view', label: 'Views', order: 2 },
            { key: 'procedure', label: 'Procedures', order: 3 },
            { key: 'function', label: 'Functions', order: 4 },
          ];

      for (const ot of sectionTypes) {
        const items: any[] = (objectData[ot.key] || []).filter((item: any) => !filter || item.name?.toLowerCase().includes(filter));
        if (items.length === 0 && !filter) continue;
        const sectionKey = ot.key;
        const expanded = isSectionExpanded(sectionKey, items.length > 0);
        rows.push({ type: 'section', key: sectionKey, label: ot.label, icon: typeIconMap[ot.key] || <Code2 className="h-4 w-4 text-gray-500" />, count: items.length, expanded });
        if (expanded) {
          for (const item of items) {
            switch (ot.key) {
              case 'view': rows.push({ type: 'view', key: `view-${item.name}`, view: item }); break;
              case 'procedure': rows.push({ type: 'proc', key: `proc-${item.name}`, item }); break;
              case 'function': rows.push({ type: 'func', key: `func-${item.name}`, item }); break;
              default: rows.push({ type: 'generic', key: `${ot.key}-${item.name}`, objectType: ot.key, item }); break;
            }
          }
        }
      }
    }

    return rows;
  }, [filteredTables, views, procedures, functions, expandedNodes, filter, collapsedWhileSearching, favoriteSet, schema, dialect, uniqueSchemas, allObjects]);

  // Track section header positions for sticky behavior
  const sectionMeta = useMemo(() => {
    const sections: { index: number; offset: number }[] = [];
    let offset = 0;
    for (let i = 0; i < flatRows.length; i++) {
      if (flatRows[i].type === 'section' || flatRows[i].type === 'schema-group') sections.push({ index: i, offset });
      const rowType = flatRows[i].type;
      offset += rowType === 'column' ? COLUMN_ROW_HEIGHT : (rowType === 'section' || rowType === 'schema-group') ? SECTION_ROW_HEIGHT : ROW_HEIGHT;
    }
    return sections;
  }, [flatRows]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const t = flatRows[i].type;
      return t === 'column' ? COLUMN_ROW_HEIGHT : (t === 'section' || t === 'schema-group') ? SECTION_ROW_HEIGHT : ROW_HEIGHT;
    },
    overscan: 15,
  });

  // Determine which section header should be pinned
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  let pinnedSectionIndex: number | null = null;
  for (let i = sectionMeta.length - 1; i >= 0; i--) {
    if (scrollOffset > sectionMeta[i].offset) {
      pinnedSectionIndex = sectionMeta[i].index;
      break;
    }
  }

  if (isLoading) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('schema.schemaLoading')}</div>;
  if (!schema) return <div className="p-4 text-sm text-muted-foreground">{t('schema.schemaNotFound')}</div>;

  const handleSelectTop = (table: TableInfo) => {
    addTab({ title: table.name, sql: dialect.selectTop(table.schema, table.name) });
  };

  const handleViewDefinition = (type: string, name: string, schemaName: string, definition?: string) => {
    const defSql = definition || `-- Definition unavailable: ${dialect.qualifiedTable(schemaName, name)}\n-- The user may not have permission to view this definition.`;
    addTab({ title: `${type}: ${name}`, sql: defSql });
  };

  const handleViewSelectTop = (view: ViewInfo) => {
    addTab({ title: view.name, sql: dialect.selectTop(view.schema, view.name) });
  };

  const openContextMenu = (e: MouseEvent, items: ContextMenuState['items']) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  // Extra indent when using by-schema grouping
  const indent = {
    table: bySchema ? 32 : 20,
    column: bySchema ? 56 : 44,
    item: bySchema ? 40 : 28,
  };

  const renderRow = (row: FlatRow) => {
    switch (row.type) {
      case 'schema-group': {
        const Chevron = row.expanded ? ChevronDown : ChevronRight;
        return (
          <button
            className="flex w-full items-center gap-2 pl-2 pr-2 py-1.5 text-[13px] font-bold hover:bg-accent sticky top-0 z-20 bg-background border-b border-border"
            onClick={() => toggleSection(row.key, row.expanded)}
          >
            <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Database className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{row.label}</span>
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">{row.count}</span>
          </button>
        );
      }
      case 'section': {
        const Chevron = row.expanded ? ChevronDown : ChevronRight;
        const isFavTopLevel = row.key === 'favorites' && bySchema;
        const sectionIndent = bySchema && !isFavTopLevel ? 'pl-5' : 'pl-3';
        return (
          <button
            className={`flex w-full items-center gap-2 ${sectionIndent} pr-2 py-1.5 text-[13px] font-semibold hover:bg-accent sticky top-0 z-10 bg-background border-b border-border/50`}
            onClick={() => toggleSection(row.key, row.expanded)}
          >
            <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="flex text-muted-foreground">{row.icon}</span>
            <span className="truncate">{row.label}</span>
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">{row.count}</span>
          </button>
        );
      }
      case 'table': {
        const tbl = row.table;
        const nodeKey = bySchema ? `table-${tbl.schema}.${tbl.name}` : `table-${tbl.name}`;
        const tableExpanded = row.matchingColumns !== null
          ? !collapsedWhileSearching.has(nodeKey)
          : expandedNodes.has(nodeKey);
        const Chevron = tableExpanded ? ChevronDown : ChevronRight;
        const isFav = favoriteSet.has(`${tbl.schema}.${tbl.name}`);
        const tableTarget: InspectorTarget = { connectionId, database, table: tbl.name, schema: tbl.schema };
        const tableContextItems: ContextMenuItem[] = [
          {
            label: isFav ? t('explorer.removeFromFavorites') : t('explorer.addToFavorites'),
            icon: <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-yellow-500 text-yellow-500' : ''}`} />,
            action: () => toggleFavorite.mutate({ connectionId, database, schema: tbl.schema, table: tbl.name, isFavorite: isFav }),
          },
          { label: dialect.selectTopLabel, separator: true, action: () => handleSelectTop(tbl) },
          { label: t('inspector.countRows'), action: () => addTab({ title: `${tbl.name} count`, sql: dialect.countRows(tbl.schema, tbl.name) }) },
          { label: t('inspector.generateSelect'), separator: true, action: () => addTab({ title: `${tbl.name} SELECT`, sql: generateSelect(tbl, dialect.name) }) },
          { label: t('inspector.generateInsert'), action: () => addTab({ title: `${tbl.name} INSERT`, sql: generateInsert(tbl, dialect.name) }) },
          { label: t('inspector.generateUpdate'), action: () => addTab({ title: `${tbl.name} UPDATE`, sql: generateUpdate(tbl, dialect.name) }), destructive: true },
          { label: t('inspector.generateDelete'), action: () => addTab({ title: `${tbl.name} DELETE`, sql: generateDelete(tbl, dialect.name) }), destructive: true },
          { label: t('inspector.inspectTable'), separator: true, action: () => onInspect ? onInspect(tableTarget) : inspectObject(tableTarget) },
          { label: t('inspector.documentation'), icon: <PanelRight className="h-3.5 w-3.5" />, action: () => openDoc({ connectionId, database, table: tbl.name, schema: tbl.schema }) },
        ];
        return (
          <button
            data-tour={tbl.name === schema?.tables?.[0]?.name ? 'table-node' : undefined}
            className="group flex w-full items-center gap-1.5 rounded-sm pr-1 text-sm hover:bg-accent py-0.5"
            style={{ paddingLeft: `${row.shallow ? 20 : indent.table}px` }}
            onClick={(e) => {
              if (onInspect) {
                onInspect(tableTarget);
              } else if (e.detail === 2) {
                inspectObject(tableTarget);
              } else if (row.matchingColumns !== null) {
                toggleSection(nodeKey, tableExpanded);
              } else {
                toggleNode(nodeKey);
              }
            }}
            onContextMenu={(e) => openContextMenu(e, tableContextItems)}
          >
            {!onInspect && <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="truncate" title={`${tbl.schema}.${tbl.name}`}>{bySchema ? tbl.name : `${tbl.schema}.${tbl.name}`}</span>
            <span className="ml-auto flex items-center gap-1">
              <span
                role="button"
                className={cn(
                  'shrink-0 transition-opacity',
                  isFav ? 'text-yellow-500' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite.mutate({ connectionId, database, schema: tbl.schema, table: tbl.name, isFavorite: isFav });
                }}
              >
                <Star className={cn('h-3.5 w-3.5', isFav && 'fill-yellow-500')} />
              </span>
              {tbl.row_count != null && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{tbl.row_count}</Badge>}
            </span>
          </button>
        );
      }
      case 'column':
        return (
          <div style={{ paddingLeft: `${row.shallow ? 44 : indent.column}px` }}>
            <ColumnNode column={row.column} />
          </div>
        );
      case 'view': {
        const v = row.view;
        const viewTarget: InspectorTarget = { connectionId, database, table: v.name, schema: v.schema, objectType: 'view', definition: v.definition };
        const viewContextItems: ContextMenuItem[] = [
          { label: t('inspector.inspectView'), action: () => onInspect ? onInspect(viewTarget) : inspectObject(viewTarget) },
          { label: t('inspector.viewDefinition'), action: () => handleViewDefinition('VIEW', v.name, v.schema, v.definition) },
          { label: dialect.selectTopLabel, action: () => handleViewSelectTop(v) },
        ];
        return (
          <button
            className="flex w-full items-center gap-1.5 rounded-sm pr-1 text-sm hover:bg-accent py-0.5"
            style={{ paddingLeft: `${indent.item}px` }}
            onClick={(e) => {
              if (onInspect) {
                onInspect(viewTarget);
              } else if (e.detail === 2) {
                inspectObject(viewTarget);
              }
            }}
            onContextMenu={(e) => openContextMenu(e, viewContextItems)}
          >
            <span className="w-3.5 shrink-0" />
            <Eye className="h-3.5 w-3.5 shrink-0 text-purple-400" />
            <span className="truncate" title={`${v.schema}.${v.name}`}>{bySchema ? v.name : `${v.schema}.${v.name}`}</span>
          </button>
        );
      }
      case 'proc': {
        const p = row.item;
        const procTarget: InspectorTarget = { connectionId, database, table: p.name, schema: p.schema, objectType: 'procedure', definition: p.definition };
        const procContextItems: ContextMenuItem[] = [
          { label: t('inspector.inspectProcedure'), action: () => onInspect ? onInspect(procTarget) : inspectObject(procTarget) },
          { label: t('inspector.viewDefinition'), action: () => handleViewDefinition('PROCEDURE', p.name, p.schema, p.definition) },
        ];
        return (
          <button
            className="flex w-full items-center gap-1.5 rounded-sm pr-1 text-sm hover:bg-accent py-0.5"
            style={{ paddingLeft: `${indent.item}px` }}
            onClick={(e) => {
              if (onInspect) {
                onInspect(procTarget);
              } else if (e.detail === 2) {
                inspectObject(procTarget);
              }
            }}
            onContextMenu={(e) => openContextMenu(e, procContextItems)}
          >
            <span className="w-3.5 shrink-0" />
            <Code2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            <span className="truncate" title={`${p.schema}.${p.name}`}>{bySchema ? p.name : `${p.schema}.${p.name}`}</span>
          </button>
        );
      }
      case 'func': {
        const f = row.item;
        const fnType = f.type?.includes('TRIGGER') ? 'TRIGGER' : f.type?.includes('TABLE') ? (f.type?.includes('INLINE') ? 'IF' : 'TF') : 'FN';
        const funcTarget: InspectorTarget = { connectionId, database, table: f.name, schema: f.schema, objectType: 'function', definition: f.definition, functionType: fnType };
        const funcContextItems: ContextMenuItem[] = [
          { label: t('inspector.inspectFunction'), action: () => onInspect ? onInspect(funcTarget) : inspectObject(funcTarget) },
          { label: t('inspector.viewDefinition'), action: () => handleViewDefinition('FUNCTION', f.name, f.schema, f.definition) },
        ];
        return (
          <button
            className="flex w-full items-center gap-1.5 rounded-sm pr-1 text-sm hover:bg-accent py-0.5"
            style={{ paddingLeft: `${indent.item}px` }}
            onClick={(e) => {
              if (onInspect) {
                onInspect(funcTarget);
              } else if (e.detail === 2) {
                inspectObject(funcTarget);
              }
            }}
            onContextMenu={(e) => openContextMenu(e, funcContextItems)}
          >
            <span className="w-3.5 shrink-0" />
            <FunctionSquare className="h-3.5 w-3.5 shrink-0 text-teal-400" />
            <span className="truncate" title={`${f.schema}.${f.name}`}>{bySchema ? f.name : `${f.schema}.${f.name}`}</span>
          </button>
        );
      }
      case 'generic': {
        const item = row.item;
        const genericIconMap: Record<string, ReactNode> = {
          materialized_view: <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-400" />,
          sequence: <Hash className="h-3.5 w-3.5 shrink-0 text-cyan-400" />,
          enum: <List className="h-3.5 w-3.5 shrink-0 text-pink-400" />,
          trigger: <Zap className="h-3.5 w-3.5 shrink-0 text-amber-400" />,
        };
        const genericTarget: InspectorTarget = {
          connectionId, database,
          table: item.name,
          schema: item.schema || 'public',
          objectType: row.objectType as any,
          definition: item.definition,
        };
        const displayName = bySchema ? item.name : `${item.schema}.${item.name}`;
        const label = item.table_name
          ? `${displayName} → ${item.table_name}`
          : displayName;
        return (
          <button
            className="flex w-full items-center gap-1.5 rounded-sm pr-1 text-sm hover:bg-accent py-0.5"
            style={{ paddingLeft: `${indent.item}px` }}
            onClick={(e) => {
              if (onInspect) {
                onInspect(genericTarget);
              } else if (e.detail === 2) {
                inspectObject(genericTarget);
              }
            }}
          >
            <span className="w-3.5 shrink-0" />
            {genericIconMap[row.objectType] || <Code2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
            <span className="truncate" title={label}>{label}</span>
          </button>
        );
      }
    }
  };

  return (
    <div className="text-sm flex flex-col h-full" data-tour="schema-tree">
      <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{database}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => refreshMutation.mutate({ connectionId, database })}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw className={`h-3 w-3 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        {/* Sticky pinned section header */}
        {pinnedSectionIndex !== null && (
          <div className="sticky top-0 z-20 w-full" style={{ marginBottom: `-${ROW_HEIGHT}px` }}>
            {renderRow(flatRows[pinnedSectionIndex])}
          </div>
        )}
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index];
            return (
              <div
                key={row.key}
                className="bg-background"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.items.map((item, i) => (
            <div key={i}>
              {item.separator && <div className="my-1 h-px bg-border" />}
              <button
                className={cn(
                  'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  item.destructive && 'text-destructive hover:text-destructive'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                  closeContextMenu();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
