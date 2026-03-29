import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface ERTableNodeData {
  [key: string]: unknown;
  label: string;
  columns: { from: string; to: string; matchType?: string; confidence?: number }[];
  variant: 'center' | 'real' | 'ghost' | 'manual';
  isDismissed?: boolean;
  isView?: boolean;
  direction?: 'incoming' | 'outgoing';
  onNavigate?: () => void;
  onDismiss?: () => void;
  onDelete?: () => void;
  onUndismiss?: () => void;
}

type ERTableNode = NodeProps & { data: ERTableNodeData };

export const ERTableNodeComponent = memo(({ data }: ERTableNode) => {
  const isCenter = data.variant === 'center';

  const isView = data.isView && !isCenter;

  const borderColor = {
    center: 'border-primary/60',
    real: isView ? 'border-purple-500/40 border-dashed' : 'border-blue-500/40',
    ghost: 'border-amber-500/40 border-dashed',
    manual: 'border-green-500/40',
  }[data.variant];

  const headerColor = {
    center: 'bg-primary text-primary-foreground',
    real: isView ? 'bg-purple-500/90 text-white' : 'bg-blue-500/90 text-white',
    ghost: isView ? 'bg-purple-400/80 text-white' : 'bg-amber-500/90 text-white',
    manual: 'bg-green-500/90 text-white',
  }[data.variant];

  const tagLabel = data.variant === 'ghost' ? (isView ? 'view · inferred' : 'inferred')
    : data.variant === 'manual' ? 'manual'
    : isView ? 'view' : null;

  return (
    <div className={cn(
      'rounded border shadow-sm bg-card transition-shadow hover:shadow-md',
      borderColor,
      data.isDismissed && 'opacity-30',
      isCenter ? 'min-w-[140px] max-w-[180px]' : 'min-w-[120px] max-w-[170px]',
    )}>
      {/* Handles */}
      {!isCenter && data.direction === 'incoming' && (
        <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-1.5 !h-1.5 !border-0" />
      )}
      {!isCenter && data.direction === 'outgoing' && (
        <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-1.5 !h-1.5 !border-0" />
      )}
      {isCenter && (
        <>
          <Handle type="target" position={Position.Left} className="!bg-primary !w-1.5 !h-1.5 !border-0" />
          <Handle type="source" position={Position.Right} className="!bg-primary !w-1.5 !h-1.5 !border-0" />
        </>
      )}

      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-1 rounded-t px-2 py-1',
          headerColor,
          !isCenter && 'cursor-pointer hover:brightness-110',
        )}
        onClick={() => !isCenter && data.onNavigate?.()}
      >
        <span className={cn('font-mono font-medium truncate', isCenter ? 'text-[11px]' : 'text-[10px]')}>
          {data.label}
        </span>
        {tagLabel && (
          <span className="ml-auto text-[8px] uppercase tracking-wider opacity-70 shrink-0">{tagLabel}</span>
        )}
      </div>

      {/* Column mappings */}
      {data.columns.length > 0 && (
        <div className="py-0.5">
          {data.columns.map((col, i) => (
            <div key={i} className="flex items-center gap-0.5 px-2 py-[2px] text-[9px] font-mono leading-tight">
              {isCenter ? (
                <span className="text-foreground/80 truncate">{col.from}</span>
              ) : (
                <>
                  <span className="text-muted-foreground truncate flex-1">{col.from}</span>
                  <span className="text-muted-foreground/40 shrink-0 text-[8px]">&rarr;</span>
                  <span className="text-foreground/80 truncate flex-1 text-right">{col.to}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hover actions */}
      {!isCenter && !data.isDismissed && data.variant === 'ghost' && data.onDismiss && (
        <button
          className="absolute -right-1 -top-1 rounded-full bg-background border shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); data.onDismiss!(); }}
          title="Dismiss"
        >
          <svg className="h-2.5 w-2.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
      {!isCenter && !data.isDismissed && data.variant === 'manual' && data.onDelete && (
        <button
          className="absolute -right-1 -top-1 rounded-full bg-background border shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); data.onDelete!(); }}
          title="Delete"
        >
          <svg className="h-2.5 w-2.5 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
      {!isCenter && data.isDismissed && data.onUndismiss && (
        <button
          className="absolute -right-1 -top-1 rounded-full bg-background border shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => { e.stopPropagation(); data.onUndismiss!(); }}
          title="Restore"
        >
          <svg className="h-2.5 w-2.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
        </button>
      )}
    </div>
  );
});

ERTableNodeComponent.displayName = 'ERTableNodeComponent';
