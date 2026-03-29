import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore, MAX_EDITOR_GROUPS } from '@/stores/editor-store';

interface Props {
  x: number;
  y: number;
  tabId: string;
  groupId: string;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  separator?: boolean;
}

export function TabContextMenu({ x, y, tabId, groupId, onClose }: Props) {
  const { t } = useTranslation();
  const layout = useEditorStore((s) => s.layout);
  const requestCloseTab = useEditorStore((s) => s.requestCloseTab);
  const closeOthersInGroup = useEditorStore((s) => s.closeOthersInGroup);
  const closeAllInGroup = useEditorStore((s) => s.closeAllInGroup);
  const splitGroup = useEditorStore((s) => s.splitGroup);
  const moveTab = useEditorStore((s) => s.moveTab);

  const group = layout.groups.find((g) => g.id === groupId);
  const canSplit = layout.groups.length < MAX_EDITOR_GROUPS;
  const hasMultipleTabs = group ? group.tabIds.length > 1 : false;
  const hasMultipleGroups = layout.groups.length > 1;
  const otherGroup = layout.groups.find((g) => g.id !== groupId);

  useEffect(() => {
    const handleClose = () => onClose();
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [onClose]);

  const items: MenuItem[] = [
    { label: t('editor.close'), action: () => requestCloseTab(tabId) },
  ];

  if (hasMultipleTabs) {
    items.push({ label: t('editor.closeOthers'), action: () => closeOthersInGroup(groupId, tabId) });
  }
  items.push({ label: t('editor.closeAll'), action: () => closeAllInGroup(groupId) });

  if (canSplit) {
    items.push({ label: t('editor.splitRight'), separator: true, action: () => splitGroup(groupId, tabId, 'horizontal') });
    items.push({ label: t('editor.splitDown'), action: () => splitGroup(groupId, tabId, 'vertical') });
  }

  if (hasMultipleGroups && otherGroup) {
    items.push({ label: t('editor.moveToOtherGroup'), separator: !canSplit, action: () => moveTab(tabId, groupId, otherGroup.id) });
  }

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && <div className="my-1 h-px bg-border" />}
          <button
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              item.action();
              onClose();
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
