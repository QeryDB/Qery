import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  Background,
  BackgroundVariant,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ForeignKeyInfo, ReferencedByInfo, GhostFKInfo } from '@/types/schema';
import { ERTableNodeComponent, type ERTableNodeData } from './ERTableNode';
import { Loader2, RefreshCw, Plus, Eye, EyeOff } from 'lucide-react';

interface Props {
  tableName: string;
  schemaName: string;
  foreignKeys: ForeignKeyInfo[];
  referencedBy: ReferencedByInfo[];
  onNavigate?: (schema: string, table: string) => void;
  ghostFKs?: GhostFKInfo[];
  manualFKs?: GhostFKInfo[];
  dismissedCount?: number;
  isLoading?: boolean;
  onDismiss?: (fk: GhostFKInfo) => void;
  onUndismiss?: (fk: GhostFKInfo) => void;
  onDeleteManual?: (fk: GhostFKInfo) => void;
  onAddRelationship?: () => void;
  onRefresh?: () => void;
  viewNames?: Set<string>;
  tableSchemaMap?: Map<string, string>;  // bare table name → schema
  defaultSchema?: string;
}

const nodeTypes: NodeTypes = { erTable: ERTableNodeComponent };

// ── Layout constants (compact) ──
const NODE_W = 160;
const COL_H = 14;
const HEADER_H = 24;
const GAP_Y = 16;
const COL_X = 280;  // center X
const SPREAD_X = 200; // distance from center to side nodes

interface GroupedGhost {
  table: string;
  source: 'ghost' | 'manual';
  isDismissed: boolean;
  columns: { from: string; to: string; matchType?: string; confidence?: number }[];
  fks: GhostFKInfo[];
}

function groupByTable(fks: GhostFKInfo[], currentTable: string, direction: 'outgoing' | 'incoming'): GroupedGhost[] {
  const map = new Map<string, GroupedGhost>();
  for (const fk of fks) {
    const isOut = fk.from_table.toLowerCase() === currentTable.toLowerCase();
    if (direction === 'outgoing' && !isOut) continue;
    if (direction === 'incoming' && isOut) continue;
    const other = isOut ? fk.to_table : fk.from_table;
    const key = `${fk.source}:${other}:${fk.is_dismissed}`;
    if (!map.has(key)) map.set(key, { table: other, source: fk.source === 'manual' ? 'manual' : 'ghost', isDismissed: fk.is_dismissed, columns: [], fks: [] });
    const g = map.get(key)!;
    // Side node shows: sideColumn → centerColumn
    // Outgoing (center=from): side=to_column, center=from_column
    // Incoming (center=to): side=from_column, center=to_column
    g.columns.push({ from: isOut ? fk.to_column : fk.from_column, to: isOut ? fk.from_column : fk.to_column, matchType: fk.match_type, confidence: fk.confidence });
    g.fks.push(fk);
  }
  return Array.from(map.values());
}

function nodeH(cols: number) { return HEADER_H + Math.max(cols, 1) * COL_H + 4; }

function buildLayout(
  tableName: string, schemaName: string,
  foreignKeys: ForeignKeyInfo[], referencedBy: ReferencedByInfo[],
  filteredGhost: GhostFKInfo[],
  viewNames: Set<string>,
  tableSchemaMap: Map<string, string>,
  defaultSchema: string,
  onNavigate?: (s: string, t: string) => void,
  onDismiss?: (fk: GhostFKInfo) => void,
  onUndismiss?: (fk: GhostFKInfo) => void,
  onDeleteManual?: (fk: GhostFKInfo) => void,
) {
  const nodes: Node<ERTableNodeData>[] = [];
  const edges: Edge[] = [];
  const centerCols = new Set<string>();

  // Build real FK keys for deduplication — ghost FKs that duplicate real FKs are skipped
  const realFKKeys = new Set<string>();
  for (const fk of foreignKeys) {
    realFKKeys.add(`${tableName}|${fk.column}|${fk.referenced_table}|${fk.referenced_column}`.toLowerCase());
    realFKKeys.add(`${fk.referenced_table}|${fk.referenced_column}|${tableName}|${fk.column}`.toLowerCase());
  }
  for (const ref of referencedBy) {
    realFKKeys.add(`${ref.referencing_table}|${ref.column}|${tableName}|${ref.referenced_column}`.toLowerCase());
    realFKKeys.add(`${tableName}|${ref.referenced_column}|${ref.referencing_table}|${ref.column}`.toLowerCase());
  }

  // Filter ghost FKs that already exist as real FKs
  const dedupedGhost = filteredGhost.filter(fk => {
    const key = `${fk.from_table}|${fk.from_column}|${fk.to_table}|${fk.to_column}`.toLowerCase();
    return !realFKKeys.has(key);
  });

  // Collect center columns from all relationships
  for (const ref of referencedBy) centerCols.add(ref.referenced_column);
  for (const fk of foreignKeys) centerCols.add(fk.column);
  for (const fk of dedupedGhost) {
    const isOut = fk.from_table.toLowerCase() === tableName.toLowerCase();
    centerCols.add(isOut ? fk.from_column : fk.to_column);
  }

  // Group incoming/outgoing
  const realIn = new Map<string, { from: string; to: string }[]>();
  for (const r of referencedBy) {
    if (!realIn.has(r.referencing_table)) realIn.set(r.referencing_table, []);
    realIn.get(r.referencing_table)!.push({ from: r.column, to: r.referenced_column });
  }
  const ghostIn = groupByTable(dedupedGhost, tableName, 'incoming');

  const realOut = new Map<string, { from: string; to: string }[]>();
  for (const fk of foreignKeys) {
    if (!realOut.has(fk.referenced_table)) realOut.set(fk.referenced_table, []);
    realOut.get(fk.referenced_table)!.push({ from: fk.column, to: fk.referenced_column });
  }
  const ghostOut = groupByTable(dedupedGhost, tableName, 'outgoing');

  const inCount = realIn.size + ghostIn.length;
  const outCount = realOut.size + ghostOut.length;
  const sortedCenterCols = Array.from(centerCols).sort();
  const centerH = nodeH(sortedCenterCols.length);
  const maxSideH = Math.max(inCount, outCount, 1) * (HEADER_H + 3 * COL_H + GAP_Y);
  const totalH = Math.max(maxSideH, centerH + 40);

  // Center node
  nodes.push({
    id: 'center', type: 'erTable',
    position: { x: COL_X, y: totalH / 2 - centerH / 2 },
    data: { label: schemaName === defaultSchema ? tableName : `${schemaName}.${tableName}`, columns: sortedCenterCols.map(c => ({ from: c, to: '' })), variant: 'center' },
    draggable: true,
  });

  const edgeStyle = (variant: 'real' | 'ghost' | 'manual', dismissed: boolean) => ({
    stroke: variant === 'manual' ? '#22c55e' : variant === 'ghost' ? '#f59e0b' : '#3b82f6',
    strokeWidth: 1.2,
    strokeDasharray: variant === 'ghost' ? '4 3' : undefined,
    opacity: dismissed ? 0.25 : 0.8,
  });

  const edgeLabel = (cols: { from: string; to: string }[]) => ({
    label: cols.map(c => `${c.from} → ${c.to}`).join('\n'),
    labelStyle: { fontSize: 8, fill: '#9ca3af', fontFamily: 'var(--font-mono, monospace)' } as React.CSSProperties,
    labelBgStyle: { fill: 'var(--color-background, #fff)', fillOpacity: 0.9 },
    labelBgPadding: [3, 1] as [number, number],
  });

  // Side nodes helper
  let inIdx = 0, outIdx = 0;

  const addSideNode = (id: string, table: string, cols: { from: string; to: string; matchType?: string }[], variant: 'real' | 'ghost' | 'manual', dir: 'incoming' | 'outgoing', dismissed: boolean, ghostGroup?: GroupedGhost) => {
    const isView = viewNames.has(table.toLowerCase());
    const idx = dir === 'incoming' ? inIdx++ : outIdx++;
    const x = dir === 'incoming' ? COL_X - SPREAD_X - NODE_W : COL_X + NODE_W + SPREAD_X;
    const h = nodeH(cols.length);
    const y = idx * (h + GAP_Y);

    nodes.push({
      id, type: 'erTable', position: { x, y }, draggable: true,
      data: {
        label: (() => {
          const nodeSchema = tableSchemaMap.get(table.toLowerCase());
          return nodeSchema && nodeSchema !== defaultSchema ? `${nodeSchema}.${table}` : table;
        })(),
        columns: cols, variant, direction: dir, isDismissed: dismissed, isView,
        onNavigate: () => onNavigate?.(tableSchemaMap.get(table.toLowerCase()) || schemaName, table),
        onDismiss: variant === 'ghost' && onDismiss && ghostGroup?.fks[0] ? () => onDismiss(ghostGroup.fks[0]) : undefined,
        onUndismiss: dismissed && onUndismiss && ghostGroup?.fks[0] ? () => onUndismiss(ghostGroup.fks[0]) : undefined,
        onDelete: variant === 'manual' && onDeleteManual && ghostGroup?.fks[0] ? () => onDeleteManual(ghostGroup.fks[0]) : undefined,
      },
    });

    const [src, tgt] = dir === 'incoming' ? [id, 'center'] : ['center', id];
    edges.push({
      id: `e-${id}`, source: src, target: tgt, type: 'default',
      animated: variant === 'ghost' && !dismissed,
      style: edgeStyle(variant, dismissed),
      ...edgeLabel(cols),
    });
  };

  // Incoming
  for (const [table, cols] of realIn) addSideNode(`in-fk-${table}`, table, cols, 'real', 'incoming', false);
  for (const g of ghostIn) addSideNode(`in-${g.source}-${g.table}`, g.table, g.columns, g.source, 'incoming', g.isDismissed, g);

  // Outgoing
  for (const [table, cols] of realOut) addSideNode(`out-fk-${table}`, table, cols, 'real', 'outgoing', false);
  for (const g of ghostOut) addSideNode(`out-${g.source}-${g.table}`, g.table, g.columns, g.source, 'outgoing', g.isDismissed, g);

  return { nodes, edges };
}

function RelationshipsFlowInner({
  tableName, schemaName, foreignKeys, referencedBy, onNavigate,
  ghostFKs = [], manualFKs = [], dismissedCount = 0,
  isLoading, onDismiss, onUndismiss, onDeleteManual, onAddRelationship, onRefresh, viewNames = new Set(), tableSchemaMap = new Map(), defaultSchema = 'public',
}: Props) {
  const { t } = useTranslation();
  const [showDismissed, setShowDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { fitView } = useReactFlow();

  const ghostKey = ghostFKs.map(f => f.id).join(',');
  const manualKey = manualFKs.map(f => f.id).join(',');

  const layout = useMemo(() => {
    const all = [...ghostFKs, ...manualFKs];
    const filtered = showDismissed ? all : all.filter(fk => !fk.is_dismissed);
    return buildLayout(tableName, schemaName, foreignKeys, referencedBy, filtered, viewNames, tableSchemaMap, defaultSchema, onNavigate, onDismiss, onUndismiss, onDeleteManual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, schemaName, foreignKeys, referencedBy, ghostKey, manualKey, showDismissed]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  const layoutRef = useRef(layout);
  useEffect(() => {
    if (layoutRef.current !== layout) {
      layoutRef.current = layout;
      setNodes(layout.nodes);
      setEdges(layout.edges);
    }
  }, [layout, setNodes, setEdges]);

  // Stop refreshing spinner when loading finishes
  useEffect(() => {
    if (!isLoading) setIsRefreshing(false);
  }, [isLoading]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    onRefresh?.();
  }, [onRefresh]);

  const handleReLayout = useCallback(() => {
    setNodes(layout.nodes);
    setTimeout(() => fitView({ padding: 0.2, duration: 250 }), 50);
  }, [layout.nodes, setNodes, fitView]);

  const activeGhosts = ghostFKs.filter(fk => !fk.is_dismissed);
  const ghostTableCount = activeGhosts.filter(fk => {
    const other = fk.from_table.toLowerCase() === tableName.toLowerCase() ? fk.to_table : fk.from_table;
    return !viewNames.has(other.toLowerCase());
  }).length;
  const ghostViewCount = activeGhosts.length - ghostTableCount;
  const totalRelations = layout.nodes.length - 1;
  const showSpinner = isLoading || isRefreshing;

  // Full loading state
  if (showSpinner && totalRelations === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
        <span className="text-[10px]">Discovering relationships...</span>
      </div>
    );
  }

  if (!isLoading && totalRelations === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="text-xs">No relationships found</span>
        <div className="flex gap-1.5">
          {onRefresh && (
            <button onClick={handleRefresh} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          )}
          {onAddRelationship && (
            <button onClick={onAddRelationship} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
              <Plus className="h-3 w-3" /> Add manual
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {showSpinner && totalRelations > 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <div className="flex items-center gap-1.5 rounded border bg-background px-3 py-1.5 shadow text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Refreshing...
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="flex-1"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={0.5} className="!bg-background" />

        {/* Toolbar — compact icon-only buttons */}
        <Panel position="top-right" className="flex items-center gap-0.5 !m-1.5">
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={showSpinner}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${showSpinner ? 'animate-spin' : ''}`} />
            </button>
          )}
          {dismissedCount > 0 && (
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={showDismissed ? 'Hide dismissed' : `Show ${dismissedCount} dismissed`}
            >
              {showDismissed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          {onAddRelationship && (
            <button
              onClick={onAddRelationship}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Add manual relationship"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </Panel>

        {/* Status badges */}

        {/* Legend */}
        <Panel position="bottom-left" className="!m-1.5">
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground/70">
            <span className="flex items-center gap-1"><span className="w-2.5 h-[1.5px] bg-blue-500 rounded" /> FK</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-0 border-t border-dashed border-amber-500" /> Inferred</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-[1.5px] bg-purple-500 rounded" /> View</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-[1.5px] bg-green-500 rounded" /> Manual</span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function RelationshipsTab(props: Props) {
  return (
    <ReactFlowProvider>
      <RelationshipsFlowInner {...props} />
    </ReactFlowProvider>
  );
}
