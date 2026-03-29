import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { useEditorStore, MAX_EDITOR_GROUPS } from '@/stores/editor-store';

interface Props {
  groupId: string;
}

export function EditorGroupMenu({ groupId }: Props) {
  const layout = useEditorStore((s) => s.layout);
  const group = layout.groups.find((g) => g.id === groupId);
  const splitGroup = useEditorStore((s) => s.splitGroup);
  const requestCloseTab = useEditorStore((s) => s.requestCloseTab);
  const closeAllInGroup = useEditorStore((s) => s.closeAllInGroup);
  const closeOthersInGroup = useEditorStore((s) => s.closeOthersInGroup);
  const closeGroup = useEditorStore((s) => s.closeGroup);
  const mergeGroups = useEditorStore((s) => s.mergeGroups);

  if (!group) return null;

  const canSplit = layout.groups.length < MAX_EDITOR_GROUPS;
  const hasMultipleGroups = layout.groups.length > 1;
  const hasMultipleTabs = group.tabIds.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="h-full rounded-none px-1.5">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canSplit && group.activeTabId && (
          <>
            <DropdownMenuItem onClick={() => splitGroup(groupId, group.activeTabId, 'horizontal')}>
              Split Right
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => splitGroup(groupId, group.activeTabId, 'vertical')}>
              Split Down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {group.activeTabId && (
          <DropdownMenuItem onClick={() => requestCloseTab(group.activeTabId)}>
            Close Tab
          </DropdownMenuItem>
        )}
        {hasMultipleTabs && (
          <DropdownMenuItem onClick={() => closeOthersInGroup(groupId, group.activeTabId)}>
            Close Other Tabs
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => closeAllInGroup(groupId)}>
          Close All Tabs
        </DropdownMenuItem>
        {hasMultipleGroups && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => closeGroup(groupId)}>
              Close Group
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => mergeGroups()}>
              Merge All Groups
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
