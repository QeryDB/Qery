import { useDroppable } from '@dnd-kit/core';
import { useEditorStore, MAX_EDITOR_GROUPS, type SplitDirection } from '@/stores/editor-store';
import { cn } from '@/lib/utils';

interface Props {
  groupId: string;
  isDragging?: boolean;
}

export function DroppableEdgeZone({ groupId, isDragging }: Props) {
  const groupCount = useEditorStore((s) => s.layout.groups.length);
  if (groupCount >= MAX_EDITOR_GROUPS) return null;

  return (
    <>
      <EdgeZone id={`edge-right-${groupId}`} groupId={groupId} direction="horizontal" position="right" isDragging={isDragging} />
      <EdgeZone id={`edge-bottom-${groupId}`} groupId={groupId} direction="vertical" position="bottom" isDragging={isDragging} />
      <EdgeZone id={`edge-left-${groupId}`} groupId={groupId} direction="horizontal" position="left" isDragging={isDragging} />
      <EdgeZone id={`edge-top-${groupId}`} groupId={groupId} direction="vertical" position="top" isDragging={isDragging} />
    </>
  );
}

interface EdgeZoneProps {
  id: string;
  groupId: string;
  direction: SplitDirection;
  position: 'left' | 'right' | 'top' | 'bottom';
  isDragging?: boolean;
}

function EdgeZone({ id, groupId, direction, position, isDragging }: EdgeZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: 'edge', groupId, direction, position },
    disabled: !isDragging,
  });

  const hitTargetClasses: Record<string, string> = {
    left: 'left-0 top-4 w-[18%] h-[calc(100%-16px)]',
    right: 'right-0 top-4 w-[18%] h-[calc(100%-16px)]',
    top: 'top-4 left-[18%] h-[15%] w-[64%]',
    bottom: 'bottom-0 left-[18%] h-[18%] w-[64%]',
  };

  const highlightClasses: Record<string, string> = {
    left: 'left-0 top-0 w-1/2 h-full',
    right: 'right-0 top-0 w-1/2 h-full',
    top: 'top-0 left-0 h-1/2 w-full',
    bottom: 'bottom-0 left-0 h-1/2 w-full',
  };

  return (
    <>
      <div
        ref={setNodeRef}
        className={cn(
          'absolute z-50',
          hitTargetClasses[position],
          isDragging ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      />
      {isOver && isDragging && (
        <div
          className={cn(
            'absolute z-[49] pointer-events-none',
            highlightClasses[position],
            'bg-primary/10 border-2 border-primary/40 border-dashed rounded-md',
          )}
        />
      )}
    </>
  );
}
