import { Fragment, useState, useRef, useEffect, useCallback } from 'react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useEditorStore, type EditorTab } from '@/stores/editor-store';
import { Button } from '@/components/ui/button';
import { DraggableTab } from './DraggableTab';
import { EditorGroupMenu } from './EditorGroupMenu';
import { TabContextMenu } from './TabContextMenu';

function tabMetaEqual(prev: EditorTab[], next: EditorTab[]): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((t, i) => {
    const n = next[i];
    const tDirty = (t.savedQueryId && t.savedSqlSnapshot !== undefined && t.sql !== t.savedSqlSnapshot) ||
                   (!t.savedQueryId && t.type === 'query' && t.sql.trim().length > 0);
    const nDirty = (n.savedQueryId && n.savedSqlSnapshot !== undefined && n.sql !== n.savedSqlSnapshot) ||
                   (!n.savedQueryId && n.type === 'query' && n.sql.trim().length > 0);
    return t.id === n.id && t.title === n.title && t.type === n.type &&
           t.isExecuting === n.isExecuting && t.inspectorTarget === n.inspectorTarget &&
           t.savedQueryId === n.savedQueryId && tDirty === nDirty;
  });
}

interface Props {
  groupId: string;
  dropIndicatorIndex?: number;
}

export function EditorGroupTabBar({ groupId, dropIndicatorIndex }: Props) {
  const allTabs = useStoreWithEqualityFn(useEditorStore, (s) => s.tabs, tabMetaEqual);
  const group = useEditorStore((s) => s.layout.groups.find((g) => g.id === groupId));
  const addTab = useEditorStore((s) => s.addTab);
  const requestCloseTab = useEditorStore((s) => s.requestCloseTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const groupCount = useEditorStore((s) => s.layout.groups.length);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect(); };
  }, []);

  useEffect(updateScrollState, [group?.tabIds]);

  useEffect(() => {
    if (!group?.activeTabId || !scrollRef.current) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current?.querySelector(`[data-tab-id="${group.activeTabId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  }, [group?.activeTabId]);

  if (!group) return null;

  const groupTabs = group.tabIds
    .map((id) => allTabs.find((t) => t.id === id))
    .filter((t): t is EditorTab => t != null);

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(groupId, tabId);
  }, [groupId, setActiveTab]);

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    requestCloseTab(tabId);
  }, [requestCloseTab]);

  const handleAddTab = useCallback(() => {
    addTab(undefined, groupId);
  }, [groupId, addTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const canClose = groupTabs.length > 1 || groupCount > 1;

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' });
  };

  return (
    <>
      <div className="flex h-10 items-stretch border-b bg-muted/50 shrink-0">
        {canScrollLeft && (
          <button
            className="flex items-center px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent border-r shrink-0"
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}

        <div ref={scrollRef} className="flex-1 flex items-stretch overflow-x-auto min-w-0 scrollbar-none">
          <SortableContext items={group.tabIds} strategy={horizontalListSortingStrategy}>
            {groupTabs.map((tab, index) => (
              <Fragment key={tab.id}>
                {dropIndicatorIndex === index && (
                  <div className="w-0.5 bg-primary rounded-full my-1.5 shrink-0" />
                )}
                <DraggableTab
                  tab={tab}
                  isActive={group.activeTabId === tab.id}
                  showClose={canClose}
                  onTabClick={handleTabClick}
                  onTabClose={handleCloseTab}
                  onTabContextMenu={handleContextMenu}
                />
              </Fragment>
            ))}
            {dropIndicatorIndex !== undefined && dropIndicatorIndex >= groupTabs.length && (
              <div className="w-0.5 bg-primary rounded-full my-1.5 shrink-0" />
            )}
          </SortableContext>
        </div>

        {canScrollRight && (
          <button
            className="flex items-center px-0.5 text-muted-foreground hover:text-foreground hover:bg-accent border-l shrink-0"
            onClick={() => scrollBy(1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        <Button variant="ghost" size="icon-sm" className="h-full rounded-none px-2 shrink-0 border-l" onClick={handleAddTab}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <EditorGroupMenu groupId={groupId} />
      </div>

      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tabId={contextMenu.tabId}
          groupId={groupId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
