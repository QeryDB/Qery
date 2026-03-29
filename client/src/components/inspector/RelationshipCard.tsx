import { Badge } from '@/components/ui/badge';
import { X, Undo2, ArrowRight } from 'lucide-react';

interface Props {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  source: 'real' | 'ghost' | 'manual';
  matchType?: 'exact' | 'suffix';
  confidence?: number;
  isDismissed?: boolean;
  direction: 'incoming' | 'outgoing';
  otherSchema?: string;
  onNavigate?: (schema: string, table: string) => void;
  onDismiss?: () => void;
  onDelete?: () => void;
  onUndismiss?: () => void;
}

const sourceBadge = {
  real: null,
  ghost: { label: 'ghost', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  manual: { label: 'manual', className: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30' },
};

const rowBorder = {
  real: 'border-l-blue-500',
  ghost: 'border-l-amber-500 border-dashed',
  manual: 'border-l-green-500',
};

export function RelationshipCard({
  fromTable,
  fromColumn,
  toTable,
  toColumn,
  source,
  matchType,
  confidence,
  isDismissed,
  direction,
  otherSchema,
  onNavigate,
  onDismiss,
  onDelete,
  onUndismiss,
}: Props) {
  const badge = sourceBadge[source];
  const leftBorder = rowBorder[source];

  // For incoming: the "other" table is fromTable, current table has toColumn
  // For outgoing: the "other" table is toTable, current table has fromColumn
  const currentCol = direction === 'outgoing' ? fromColumn : toColumn;
  const otherTable = direction === 'outgoing' ? toTable : fromTable;
  const otherCol = direction === 'outgoing' ? toColumn : fromColumn;

  return (
    <div
      className={`group flex items-center gap-2 rounded-md border-l-[3px] ${leftBorder} bg-muted/30 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60 ${isDismissed ? 'opacity-35' : ''}`}
    >
      {/* Current table column */}
      <code className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
        {currentCol}
      </code>

      {/* Arrow */}
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />

      {/* Target table + column */}
      <button
        className="flex items-baseline gap-1 truncate text-left hover:underline"
        onClick={() => onNavigate?.(otherSchema || 'dbo', otherTable)}
      >
        <span className="font-semibold text-foreground">{otherTable}</span>
        <span className="text-muted-foreground">.</span>
        <code className="rounded bg-muted px-1 py-0.5 text-muted-foreground">{otherCol}</code>
      </button>

      {/* Badges */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {badge && (
          <Badge className={`${badge.className} px-1.5 py-0 text-[10px] leading-4`} variant="outline">
            {badge.label}{matchType === 'suffix' ? ' ~' : ''}
          </Badge>
        )}
        {confidence !== undefined && confidence < 0.5 && (
          <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 px-1.5 py-0 text-[10px] leading-4" variant="outline">
            low
          </Badge>
        )}
      </div>

      {/* Action button */}
      {isDismissed && onUndismiss && (
        <button
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
          onClick={(e) => { e.stopPropagation(); onUndismiss(); }}
          title="Restore"
        >
          <Undo2 className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {!isDismissed && source === 'ghost' && onDismiss && (
        <button
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {!isDismissed && source === 'manual' && onDelete && (
        <button
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
        >
          <X className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </div>
  );
}
