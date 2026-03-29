import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ReactNode, MouseEvent } from 'react';

interface Props {
  label: string;
  icon?: ReactNode;
  nodeKey: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  badge?: string;
  depth?: number;
  sticky?: boolean;
  onDoubleClick?: () => void;
  onRightClick?: (e: MouseEvent) => void;
}

export function TreeNode({ label, icon, expanded, onToggle, children, badge, depth = 0, sticky, onDoubleClick, onRightClick }: Props) {
  const hasChildren = !!children;

  return (
    <div>
      <button
        className={cn(
          'flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-sm hover:bg-accent',
          sticky && 'sticky top-0 z-10 bg-background border-b border-border/50',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={(e) => {
          if (e.detail === 2 && onDoubleClick) {
            onDoubleClick();
          } else {
            onToggle();
          }
        }}
        onContextMenu={(e) => {
          if (onRightClick) {
            e.preventDefault();
            onRightClick(e);
          }
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {icon}
        <span className="truncate">{label}</span>
        {badge && <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px]">{badge}</Badge>}
      </button>
      {expanded && hasChildren && (
        <div>
          {Array.isArray(children) ? children.map((child, i) => (
            <div key={i} style={{ paddingLeft: '12px' }}>{child}</div>
          )) : <div style={{ paddingLeft: '12px' }}>{children}</div>}
        </div>
      )}
    </div>
  );
}
