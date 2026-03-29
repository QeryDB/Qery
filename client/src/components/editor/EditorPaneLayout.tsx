import { Fragment, useCallback, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { useEditorStore, type LayoutNode, type SplitDirection } from '@/stores/editor-store';
import { EditorGroupPane } from './EditorGroupPane';
import { DraggableTabOverlay } from './DraggableTab';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const customCollision: CollisionDetection = (args) => {
  const withinCollisions = pointerWithin(args);
  const edgeCollisions = withinCollisions.filter((c) => String(c.id).startsWith('edge-'));
  if (edgeCollisions.length > 0) return edgeCollisions;

  const centerCollisions = closestCenter(args);
  const tabCollisions = centerCollisions.filter((c) => !String(c.id).startsWith('edge-'));
  if (tabCollisions.length > 0) return tabCollisions;

  return centerCollisions;
};

interface DropPreview {
  groupId: string;
  insertIndex: number;
}

export function EditorPaneLayout() {
  // Only subscribe to layout.root (stable on tab switch — only changes on split/merge)
  const root = useEditorStore((s) => s.layout.root);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const moveTab = useEditorStore((s) => s.moveTab);
  const splitGroup = useEditorStore((s) => s.splitGroup);
  const setSplitSizes = useEditorStore((s) => s.setSplitSizes);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) { setDropPreview(null); return; }

      const overId = String(over.id);
      if (overId.startsWith('edge-')) { setDropPreview(null); return; }

      const { groups } = useEditorStore.getState().layout;
      const activeTabId = active.id as string;
      const activeGroup = groups.find((g) => g.tabIds.includes(activeTabId));
      const overGroup = groups.find((g) => g.tabIds.includes(overId));

      if (!activeGroup || !overGroup || activeGroup.id === overGroup.id) {
        setDropPreview(null);
        return;
      }

      const overIndex = overGroup.tabIds.indexOf(overId);
      setDropPreview({ groupId: overGroup.id, insertIndex: overIndex });
    },
    []
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setDropPreview(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeTabId = active.id as string;
      const overId = over.id as string;

      if (overId.startsWith('edge-')) {
        const data = over.data.current as { groupId: string; direction: SplitDirection; position: string } | undefined;
        if (data) {
          const insertPosition = (data.position === 'left' || data.position === 'top') ? 'before' : 'after';
          splitGroup(data.groupId, activeTabId, data.direction, insertPosition as 'before' | 'after');
        }
        return;
      }

      const { groups } = useEditorStore.getState().layout;
      const activeGroup = groups.find((g) => g.tabIds.includes(activeTabId));
      const overGroup = groups.find((g) => g.tabIds.includes(overId));

      if (!activeGroup || !overGroup) return;

      if (activeGroup.id === overGroup.id) {
        reorderTab(activeGroup.id, activeTabId, overId);
      } else {
        const toIndex = overGroup.tabIds.indexOf(overId);
        moveTab(activeTabId, activeGroup.id, overGroup.id, toIndex);
      }
    },
    [reorderTab, moveTab, splitGroup]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropPreview(null);
  }, []);

  const activeTab = useMemo(
    () => activeId ? useEditorStore.getState().tabs.find((t) => t.id === activeId) ?? null : null,
    [activeId]
  );
  const isDragging = activeId !== null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <LayoutRenderer
        node={root}
        isDragging={isDragging}
        dropPreview={dropPreview}
        setSplitSizes={setSplitSizes}
      />
      <DragOverlay dropAnimation={null}>
        {activeTab && <DraggableTabOverlay tab={activeTab} />}
      </DragOverlay>
      <UnsavedChangesDialog />
    </DndContext>
  );
}

function LayoutRenderer({
  node,
  isDragging,
  dropPreview,
  setSplitSizes,
}: {
  node: LayoutNode;
  isDragging: boolean;
  dropPreview: DropPreview | null;
  setSplitSizes: (splitId: string, sizes: number[]) => void;
}) {
  if (node.type === 'leaf') {
    return (
      <EditorGroupPane
        groupId={node.groupId}
        isDragging={isDragging}
        dropPreview={dropPreview?.groupId === node.groupId ? dropPreview.insertIndex : undefined}
      />
    );
  }

  const direction = node.direction === 'vertical' ? 'vertical' : 'horizontal';
  const splitId = node.id;

  return (
    <PanelGroup
      direction={direction}
      onLayout={(sizes) => setSplitSizes(splitId, sizes)}
    >
      {node.children.map((child, index) => {
        const panelId = child.type === 'leaf' ? child.groupId : child.id;
        return (
          <Fragment key={panelId}>
            {index > 0 && (
              <PanelResizeHandle
                className={
                  direction === 'horizontal'
                    ? 'w-1 bg-border hover:bg-primary/50 transition-colors'
                    : 'h-1 bg-border hover:bg-primary/50 transition-colors'
                }
              />
            )}
            <Panel
              id={panelId}
              order={index}
              defaultSize={node.sizes[index] || 100 / node.children.length}
              minSize={15}
            >
              <LayoutRenderer
                node={child}
                isDragging={isDragging}
                dropPreview={dropPreview}
                setSplitSizes={setSplitSizes}
              />
            </Panel>
          </Fragment>
        );
      })}
    </PanelGroup>
  );
}
