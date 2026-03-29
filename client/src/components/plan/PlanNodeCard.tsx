import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Table2, ArrowRightLeft, ArrowUpDown, Filter, Layers,
  ChevronDown, ChevronRight, AlertTriangle, Cpu, HardDrive,
  Gauge, Rows3, Combine, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanNode } from '@/types/execution-plan';

const OP_ICONS: Record<string, typeof Search> = {
  'Index Scan': Search,
  'Index Seek': Search,
  'Clustered Index Scan': Table2,
  'Clustered Index Seek': Table2,
  'Table Scan': Table2,
  'Hash Match': ArrowRightLeft,
  'Nested Loops': ArrowRightLeft,
  'Merge Join': Combine,
  'Sort': ArrowUpDown,
  'Filter': Filter,
  'Stream Aggregate': Rows3,
  'Compute Scalar': SlidersHorizontal,
  'Parallelism': Cpu,
  'Constant Scan': Gauge,
};

function getIcon(op: string) {
  for (const [key, Icon] of Object.entries(OP_ICONS)) {
    if (op.includes(key)) return Icon;
  }
  return Layers;
}

function getCostColor(percent: number) {
  if (percent > 60) return 'bg-red-500';
  if (percent > 30) return 'bg-orange-500';
  if (percent > 10) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function getCostTextColor(percent: number) {
  if (percent > 60) return 'text-red-600 dark:text-red-400';
  if (percent > 30) return 'text-orange-600 dark:text-orange-400';
  return '';
}

function formatRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

interface Props {
  node: PlanNode;
  totalCost: number;
}

export function PlanNodeCard({ node, totalCost }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const Icon = getIcon(node.physicalOp);
  const costPct = Math.round(node.costPercent * 10) / 10;
  const hasWarnings = node.warnings.length > 0;
  const isExpensive = costPct > 30;
  const hasDetails = node.object || node.indexName || node.predicate || node.seekPredicates || node.outputColumns.length > 0 || node.warnings.length > 0;

  // Show logical op if different from physical
  const showLogicalOp = node.logicalOp && node.logicalOp !== node.physicalOp;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm w-52 min-w-52 shrink-0',
        isExpensive && 'border-orange-400 dark:border-orange-600',
        costPct > 60 && 'border-red-400 dark:border-red-600 ring-1 ring-red-200 dark:ring-red-900',
        node.isKeyLookup && !isExpensive && 'border-red-300 dark:border-red-700',
        hasWarnings && !isExpensive && !node.isKeyLookup && 'border-yellow-400',
      )}
    >
      {/* Header */}
      <div className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 border-b rounded-t-lg',
        costPct > 60 && 'bg-red-50 dark:bg-red-950/30',
        costPct > 30 && costPct <= 60 && 'bg-orange-50 dark:bg-orange-950/20',
      )}>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', isExpensive ? getCostTextColor(costPct) : 'text-muted-foreground')} />
        <div className="flex-1 min-w-0">
          <span className={cn('text-xs font-medium truncate block', getCostTextColor(costPct))} title={node.physicalOp}>
            {node.physicalOp}
          </span>
          {showLogicalOp && (
            <span className="text-[9px] text-muted-foreground truncate block" title={node.logicalOp}>
              {node.logicalOp}
            </span>
          )}
        </div>
        {node.isKeyLookup && (
          <span className="text-[8px] font-bold text-red-500 bg-red-100 dark:bg-red-950 px-1 py-0.5 rounded shrink-0" title="Key Lookup — covering index recommended">
            LOOKUP
          </span>
        )}
        {hasWarnings && <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />}
      </div>

      {/* Cost bar */}
      <div className="px-2.5 py-1.5 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className={cn('font-medium', getCostTextColor(costPct))}>
            {t('plan.cost', { percent: costPct })}
          </span>
          <span className="text-muted-foreground">{formatRows(node.estimatedRows)} rows</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getCostColor(costPct))}
            style={{ width: `${Math.max(2, Math.min(100, costPct))}%` }}
          />
        </div>
      </div>

      {/* Key info: object/index shown directly (not hidden in details) */}
      {(node.object || node.indexName) && (
        <div className="px-2.5 pb-1.5 text-[10px] space-y-0.5">
          {node.object && (
            <div className="truncate" title={node.object}>
              <span className="text-muted-foreground">{t('plan.table')}</span>
              <span className="font-medium">{node.object}</span>
            </div>
          )}
          {node.indexName && (
            <div className="truncate" title={node.indexName}>
              <span className="text-muted-foreground">{t('plan.index')}</span>
              <span className="font-medium">{node.indexName}</span>
            </div>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="flex items-center gap-2 px-2.5 pb-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5" title="IO Cost">
          <HardDrive className="h-2.5 w-2.5" />
          {node.estimatedIO.toFixed(4)}
        </span>
        <span className="flex items-center gap-0.5" title="CPU Cost">
          <Cpu className="h-2.5 w-2.5" />
          {node.estimatedCPU.toFixed(4)}
        </span>
      </div>

      {/* Expandable details */}
      {hasDetails && (
        <div className="border-t">
          <button
            className="flex w-full items-center gap-1 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/50"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            Details
          </button>
          {expanded && (
            <div className="px-2.5 pb-2 space-y-1 text-[10px]">
              {node.predicate && (
                <div className="break-all"><span className="text-muted-foreground">{t('plan.filterLabel')}</span><code className="text-[9px]">{node.predicate}</code></div>
              )}
              {node.seekPredicates && (
                <div className="break-all"><span className="text-muted-foreground">Seek: </span><code className="text-[9px]">{node.seekPredicates}</code></div>
              )}
              {node.outputColumns.length > 0 && (
                <div className="break-all"><span className="text-muted-foreground">{t('plan.output')}</span>{node.outputColumns.join(', ')}</div>
              )}
              {node.warnings.length > 0 && (
                <div className="text-yellow-600 font-medium">{node.warnings.join(', ')}</div>
              )}
              <div className="text-muted-foreground pt-0.5 border-t border-dashed">
                {t('plan.subtreeCost', { cost: node.estimatedCost.toFixed(4) })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
