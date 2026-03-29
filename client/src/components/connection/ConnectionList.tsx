import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnections, useReorderConnections } from '@/hooks/useConnection';
import { useConnectionStore } from '@/stores/connection-store';
import { Server, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionList() {
  const { t } = useTranslation();
  const { data: connections, isLoading } = useConnections();
  const { activeConnectionId, setActiveConnection } = useConnectionStore();
  const reorderMutation = useReorderConnections();

  // DnD state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragRef.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, dropIdx: number) => {
      e.preventDefault();
      const fromIdx = dragRef.current;
      if (fromIdx === null || fromIdx === dropIdx || !connections) return;

      const reordered = [...connections];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(dropIdx, 0, moved);
      reorderMutation.mutate(reordered.map((c) => c.id));

      setDragIdx(null);
      setOverIdx(null);
      dragRef.current = null;
    },
    [connections, reorderMutation]
  );

  const onDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
    dragRef.current = null;
  }, []);

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">{t('common.loading')}</div>;
  if (!connections?.length) return <div className="p-3 text-xs text-muted-foreground">{t('connection.noConnections')}</div>;

  return (
    <div className="space-y-0.5 px-1">
      {connections.map((c, idx) => {
        const isDragging = dragIdx === idx;
        const isOver = overIdx === idx && dragIdx !== idx;

        return (
          <div
            key={c.id}
            className={cn(
              isDragging && 'opacity-40',
              isOver && 'ring-2 ring-primary rounded-md'
            )}
            draggable
            onDragStart={(e) => onDragStart(e, idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDrop={(e) => onDrop(e, idx)}
            onDragEnd={onDragEnd}
          >
            <button
              onClick={() => setActiveConnection(c.id, c.database_name)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                activeConnectionId === c.id && 'bg-accent'
              )}
            >
              <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
              {c.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
              <span className="truncate">{c.name}</span>
              {c.database_name && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{c.database_name}</span>
              )}
              {c.is_favorite ? <Star className="ml-auto h-3 w-3 text-yellow-500 shrink-0" /> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
