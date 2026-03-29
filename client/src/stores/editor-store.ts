import { create } from 'zustand';
import i18n from '@/i18n';
import { persist } from 'zustand/middleware';
import type { QueryResult } from '../types/query';
import type { ExecutionPlan } from '../types/execution-plan';
import * as sessionState from '@/lib/session-state';
import { getCachedEditCount } from '@/components/data-grid';

export const MAX_EDITOR_GROUPS = 3;

export interface InspectorTarget {
  connectionId: string;
  database: string;
  table: string;
  schema: string;
  objectType?: string; // 'table' | 'view' | 'procedure' | 'function' | 'materialized_view' | 'sequence' | 'enum' | 'trigger' | ...
  definition?: string;
  functionType?: string;
}

export interface EditorTab {
  id: string;
  title: string;
  type: 'query' | 'inspector';
  sql: string;
  result: QueryResult | null;
  error: string | null;
  isExecuting: boolean;
  inspectorTarget?: InspectorTarget;
  breadcrumb?: InspectorTarget[];
  savedQueryId?: string;
  savedSqlSnapshot?: string;
  externalChange?: string;
  executionPlan?: ExecutionPlan | null;
  planXml?: string | null;
  isExplaining?: boolean;
}

export type SplitDirection = 'horizontal' | 'vertical';

export interface EditorGroup {
  id: string;
  tabIds: string[];
  activeTabId: string;
}

export type LayoutNode =
  | { type: 'leaf'; groupId: string }
  | { type: 'split'; id: string; direction: SplitDirection; children: LayoutNode[]; sizes: number[] };

export interface EditorLayout {
  root: LayoutNode;
  groups: EditorGroup[];
  focusedGroupId: string;
}

interface EditorState {
  tabs: EditorTab[];
  layout: EditorLayout;
  formatSignal: number;
  pendingCloseTabId: string | null;

  addTab: (tab?: Partial<EditorTab>, groupId?: string) => void;
  addInspectorTab: (target: InspectorTarget, breadcrumb?: InspectorTarget[], groupId?: string) => void;
  closeTab: (id: string) => string | null;
  requestCloseTab: (id: string) => void;
  confirmCloseTab: () => void;
  cancelCloseTab: () => void;
  setActiveTab: (groupIdOrTabId: string, tabId?: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  setTabResult: (id: string, result: QueryResult | null, error?: string | null) => void;
  setTabExecuting: (id: string, executing: boolean) => void;
  triggerFormat: () => void;
  navigateInspector: (sourceTabId: string, target: InspectorTarget) => void;
  linkTabToSavedQuery: (tabId: string, savedQueryId: string, title: string) => void;
  notifyExternalChange: (savedQueryId: string, newSql: string, sourceTabId: string) => void;
  acceptExternalChange: (tabId: string) => void;
  dismissExternalChange: (tabId: string) => void;
  setTabPlan: (id: string, plan: ExecutionPlan | null, error?: string | null, planXml?: string | null) => void;
  setTabExplaining: (id: string, explaining: boolean) => void;

  // Group/layout actions
  reorderTab: (groupId: string, activeTabId: string, overTabId: string) => void;
  moveTab: (tabId: string, fromGroupId: string, toGroupId: string, toIndex?: number) => void;
  splitGroup: (targetGroupId: string, tabId: string, direction: SplitDirection, position?: 'before' | 'after') => void;
  closeGroup: (groupId: string) => void;
  closeAllInGroup: (groupId: string) => void;
  closeOthersInGroup: (groupId: string, keepTabId: string) => void;
  mergeGroups: () => void;
  setFocusedGroup: (groupId: string) => void;
  setSplitSizes: (splitId: string, sizes: number[]) => void;
}

let tabCounter = 1;

function nextQueryTitle(tabs: EditorTab[]): string {
  const usedNums = new Set<number>();
  for (const t of tabs) {
    const m = t.title.match(/^Query (\d+)$/);
    if (m) usedNums.add(+m[1]);
  }
  let n = 1;
  while (usedNums.has(n)) n++;
  return i18n.t('editor.queryTab', { number: n });
}

// --- Tree utilities ---

function replaceLeafInTree(node: LayoutNode, groupId: string, replacement: LayoutNode): LayoutNode {
  if (node.type === 'leaf') {
    return node.groupId === groupId ? replacement : node;
  }
  return {
    ...node,
    children: node.children.map(child => replaceLeafInTree(child, groupId, replacement)),
  };
}

function removeLeafFromTree(node: LayoutNode, groupId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.groupId === groupId ? null : node;
  }
  const newChildren: LayoutNode[] = [];
  const remainingSizes: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const result = removeLeafFromTree(node.children[i], groupId);
    if (result !== null) {
      newChildren.push(result);
      remainingSizes.push(node.sizes[i]);
    }
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  const total = remainingSizes.reduce((a, b) => a + b, 0);
  const normalizedSizes = remainingSizes.map(s => (s / total) * 100);
  return { ...node, children: newChildren, sizes: normalizedSizes };
}

function updateSplitSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'leaf') return node;
  if (node.id === splitId) return { ...node, sizes };
  return {
    ...node,
    children: node.children.map(child => updateSplitSizes(child, splitId, sizes)),
  };
}

function findSiblingLeafId(node: LayoutNode, groupId: string): string | null {
  if (node.type === 'leaf') return null;
  const targetIndex = node.children.findIndex(
    child => child.type === 'leaf' && child.groupId === groupId
  );
  if (targetIndex !== -1) {
    const siblingIndex = targetIndex > 0 ? targetIndex - 1 : targetIndex + 1;
    if (siblingIndex < node.children.length) {
      return getFirstLeafGroupId(node.children[siblingIndex]);
    }
    return null;
  }
  for (const child of node.children) {
    const result = findSiblingLeafId(child, groupId);
    if (result) return result;
  }
  return null;
}

function getFirstLeafGroupId(node: LayoutNode): string {
  if (node.type === 'leaf') return node.groupId;
  return getFirstLeafGroupId(node.children[0]);
}

function countLeaves(node: LayoutNode): number {
  if (node.type === 'leaf') return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function findGroupForTab(layout: EditorLayout, tabId: string): EditorGroup | undefined {
  return layout.groups.find((g) => g.tabIds.includes(tabId));
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
  tabs: [{ id: 'tab-1', title: i18n.t('editor.queryTab', { number: 1 }), type: 'query' as const, sql: '', result: null, error: null, isExecuting: false }],
  layout: {
    root: { type: 'leaf' as const, groupId: 'group-1' },
    groups: [{ id: 'group-1', tabIds: ['tab-1'], activeTabId: 'tab-1' }],
    focusedGroupId: 'group-1',
  },
  formatSignal: 0,
  pendingCloseTabId: null,

  requestCloseTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) { get().closeTab(id); return; }

    // Query tabs: check for unsaved SQL
    if (tab.type === 'query') {
      const savedDirty = tab.savedQueryId && tab.savedSqlSnapshot !== undefined && tab.sql !== tab.savedSqlSnapshot;
      const unsavedWithContent = !tab.savedQueryId && tab.sql.trim().length > 0;
      if (savedDirty || unsavedWithContent) {
        set({ pendingCloseTabId: id });
        return;
      }
    }

    // Inspector tabs: check for uncommitted cell edits
    if (tab.type === 'inspector' && tab.inspectorTarget) {
      const { connectionId, database, schema, table } = tab.inspectorTarget;
      const cacheKey = `${connectionId}-${database}-${schema}-${table}`;
      if (getCachedEditCount(cacheKey) > 0) {
        set({ pendingCloseTabId: id });
        return;
      }
    }

    get().closeTab(id);
  },

  confirmCloseTab: () => {
    const { pendingCloseTabId } = get();
    if (pendingCloseTabId) {
      get().closeTab(pendingCloseTabId);
      set({ pendingCloseTabId: null });
    }
  },

  cancelCloseTab: () => set({ pendingCloseTabId: null }),

  addTab: (partial, groupId) => {
    tabCounter++;
    const id = `tab-${tabCounter}`;
    const tab: EditorTab = {
      id,
      title: partial?.title || nextQueryTitle(get().tabs),
      type: partial?.type || 'query',
      sql: partial?.sql || '',
      result: null,
      error: null,
      isExecuting: false,
      savedQueryId: partial?.savedQueryId,
      savedSqlSnapshot: partial?.savedQueryId ? (partial?.sql || '') : undefined,
    };
    set((s) => {
      const targetGroupId = groupId || s.layout.focusedGroupId;
      return {
        tabs: [...s.tabs, tab],
        layout: {
          ...s.layout,
          groups: s.layout.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, tabIds: [...g.tabIds, id], activeTabId: id }
              : g
          ),
        },
      };
    });
  },

  addInspectorTab: (target, breadcrumb, groupId) => {
    const { tabs, layout } = get();
    const objType = target.objectType || 'table';
    const existing = tabs.find(
      (t) =>
        t.type === 'inspector' &&
        t.inspectorTarget?.connectionId === target.connectionId &&
        t.inspectorTarget?.database === target.database &&
        t.inspectorTarget?.table === target.table &&
        t.inspectorTarget?.schema === target.schema &&
        (t.inspectorTarget?.objectType || 'table') === objType
    );
    if (existing) {
      const group = findGroupForTab(layout, existing.id);
      if (group) {
        set((s) => ({
          // Update breadcrumb on the existing tab if caller provided one
          tabs: breadcrumb && breadcrumb.length > 0
            ? s.tabs.map((t) => t.id === existing.id ? { ...t, breadcrumb } : t)
            : s.tabs,
          layout: {
            ...s.layout,
            groups: s.layout.groups.map((g) =>
              g.id === group.id ? { ...g, activeTabId: existing.id } : g
            ),
            focusedGroupId: group.id,
          },
        }));
      }
      return;
    }
    tabCounter++;
    const id = `tab-${tabCounter}`;
    const prefix = objType === 'table' ? '' : objType === 'view' ? 'V: ' : objType === 'procedure' ? 'P: ' : 'F: ';
    const tab: EditorTab = {
      id,
      title: `${prefix}${target.schema}.${target.table}`,
      type: 'inspector',
      sql: '',
      result: null,
      error: null,
      isExecuting: false,
      inspectorTarget: { ...target, objectType: objType },
      breadcrumb: breadcrumb || [],
    };
    set((s) => {
      const targetGroupId = groupId || s.layout.focusedGroupId;
      return {
        tabs: [...s.tabs, tab],
        layout: {
          ...s.layout,
          groups: s.layout.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, tabIds: [...g.tabIds, id], activeTabId: id }
              : g
          ),
        },
      };
    });
  },

  closeTab: (id) => {
    const { tabs, layout } = get();
    const tab = tabs.find((t) => t.id === id);
    const group = findGroupForTab(layout, id);
    if (!group) return null;

    // Clean up session state for inspector tabs
    if (tab?.type === 'inspector' && tab.inspectorTarget) {
      const { connectionId, database, schema, table } = tab.inspectorTarget;
      const prefix = `${connectionId}:${database}:`;
      const suffix = `${schema}.${table}`;
      sessionState.remove(`${prefix}pending_edits:${suffix}`);
      sessionState.remove(`${prefix}preview_page:${suffix}`);
    }

    const newTabIds = group.tabIds.filter((tid) => tid !== id);

    if (newTabIds.length === 0) {
      if (layout.groups.length <= 1) {
        // Last tab in last group — keep empty group
        set({
          tabs: [],
          layout: {
            root: { type: 'leaf' as const, groupId: group.id },
            groups: [{ id: group.id, tabIds: [], activeTabId: '' }],
            focusedGroupId: group.id,
          },
        });
        return 'empty';
      }
      const newRoot = removeLeafFromTree(layout.root, group.id);
      if (!newRoot) return null;
      const remainingGroups = layout.groups.filter((g) => g.id !== group.id);
      const focusGroup = remainingGroups.find((g) => g.id === layout.focusedGroupId) || remainingGroups[0];
      set({
        tabs: tabs.filter((t) => t.id !== id),
        layout: {
          root: newRoot,
          groups: remainingGroups,
          focusedGroupId: focusGroup.id,
        },
      });
      return focusGroup.activeTabId;
    }

    const newActiveTabId = group.activeTabId === id
      ? newTabIds[newTabIds.length - 1]
      : group.activeTabId;

    set({
      tabs: tabs.filter((t) => t.id !== id),
      layout: {
        ...layout,
        groups: layout.groups.map((g) =>
          g.id === group.id ? { ...g, tabIds: newTabIds, activeTabId: newActiveTabId } : g
        ),
      },
    });
    return newActiveTabId;
  },

  // Supports both old (tabId) and new (groupId, tabId) signatures
  setActiveTab: (groupIdOrTabId: string, tabId?: string) => {
    if (tabId) {
      // New signature: setActiveTab(groupId, tabId)
      set((s) => ({
        layout: {
          ...s.layout,
          groups: s.layout.groups.map((g) =>
            g.id === groupIdOrTabId ? { ...g, activeTabId: tabId } : g
          ),
          focusedGroupId: groupIdOrTabId,
        },
      }));
    } else {
      // Old signature: setActiveTab(tabId) — find the group containing the tab
      const { layout } = get();
      const group = findGroupForTab(layout, groupIdOrTabId);
      if (group) {
        set((s) => ({
          layout: {
            ...s.layout,
            groups: s.layout.groups.map((g) =>
              g.id === group.id ? { ...g, activeTabId: groupIdOrTabId } : g
            ),
            focusedGroupId: group.id,
          },
        }));
      }
    }
  },

  updateTabSql: (id, sql) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)) })),

  setTabResult: (id, result, error = null) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, result, error, isExecuting: false } : t)),
    })),

  setTabExecuting: (id, executing) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, isExecuting: executing } : t)) })),

  triggerFormat: () => set((s) => ({ formatSignal: s.formatSignal + 1 })),

  linkTabToSavedQuery: (tabId, savedQueryId, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, savedQueryId, title, savedSqlSnapshot: t.sql } : t)),
    })),

  notifyExternalChange: (savedQueryId, newSql, sourceTabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.savedQueryId === savedQueryId && t.id !== sourceTabId
          ? { ...t, externalChange: newSql }
          : t
      ),
    })),

  acceptExternalChange: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && t.externalChange !== undefined
          ? { ...t, sql: t.externalChange, savedSqlSnapshot: t.externalChange, externalChange: undefined }
          : t
      ),
    })),

  dismissExternalChange: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId && t.externalChange !== undefined
          ? { ...t, savedSqlSnapshot: t.externalChange, externalChange: undefined }
          : t
      ),
    })),

  setTabPlan: (id, plan, error = null, planXml = null) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, executionPlan: plan, planXml, error: error ?? t.error, isExplaining: false } : t)),
    })),

  setTabExplaining: (id, explaining) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, isExplaining: explaining } : t)) })),

  navigateInspector: (sourceTabId, target) => {
    const { tabs, layout } = get();
    const objType = target.objectType || 'table';

    const existing = tabs.find(
      (t) =>
        t.type === 'inspector' &&
        t.inspectorTarget?.connectionId === target.connectionId &&
        t.inspectorTarget?.database === target.database &&
        t.inspectorTarget?.table === target.table &&
        t.inspectorTarget?.schema === target.schema &&
        (t.inspectorTarget?.objectType || 'table') === objType
    );
    // Build breadcrumb from source tab (needed for both reuse and new tab)
    const sourceTab = tabs.find((t) => t.id === sourceTabId);
    const breadcrumb: InspectorTarget[] = [];
    if (sourceTab?.inspectorTarget) {
      breadcrumb.push(...(sourceTab.breadcrumb || []), sourceTab.inspectorTarget);
    }

    if (existing) {
      const group = findGroupForTab(layout, existing.id);
      if (group) {
        set((s) => ({
          // Update breadcrumb on the existing tab with the new navigation chain
          tabs: breadcrumb.length > 0
            ? s.tabs.map((t) => t.id === existing.id ? { ...t, breadcrumb } : t)
            : s.tabs,
          layout: {
            ...s.layout,
            groups: s.layout.groups.map((g) =>
              g.id === group.id ? { ...g, activeTabId: existing.id } : g
            ),
            focusedGroupId: group.id,
          },
        }));
      }
      return;
    }

    const sourceGroup = findGroupForTab(layout, sourceTabId);
    tabCounter++;
    const id = `tab-${tabCounter}`;
    const prefix = objType === 'table' ? '' : objType === 'view' ? 'V: ' : objType === 'procedure' ? 'P: ' : 'F: ';
    const tab: EditorTab = {
      id,
      title: `${prefix}${target.schema}.${target.table}`,
      type: 'inspector',
      sql: '',
      result: null,
      error: null,
      isExecuting: false,
      inspectorTarget: { ...target, objectType: objType },
      breadcrumb,
    };
    set((s) => {
      const targetGroupId = sourceGroup?.id || s.layout.focusedGroupId;
      return {
        tabs: [...s.tabs, tab],
        layout: {
          ...s.layout,
          groups: s.layout.groups.map((g) =>
            g.id === targetGroupId
              ? { ...g, tabIds: [...g.tabIds, id], activeTabId: id }
              : g
          ),
        },
      };
    });
  },

  // --- Group/layout actions ---

  reorderTab: (groupId, activeTabId, overTabId) => {
    set((s) => ({
      layout: {
        ...s.layout,
        groups: s.layout.groups.map((g) => {
          if (g.id !== groupId) return g;
          const ids = [...g.tabIds];
          const fromIdx = ids.indexOf(activeTabId);
          const toIdx = ids.indexOf(overTabId);
          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return g;
          ids.splice(fromIdx, 1);
          ids.splice(toIdx, 0, activeTabId);
          return { ...g, tabIds: ids };
        }),
      },
    }));
  },

  moveTab: (tabId, fromGroupId, toGroupId, toIndex) => {
    if (fromGroupId === toGroupId) return;
    const { layout } = get();
    const fromGroup = layout.groups.find((g) => g.id === fromGroupId);
    const toGroup = layout.groups.find((g) => g.id === toGroupId);
    if (!fromGroup || !toGroup) return;

    const newFromTabIds = fromGroup.tabIds.filter((id) => id !== tabId);
    const newToTabIds = [...toGroup.tabIds];
    if (toIndex !== undefined) {
      newToTabIds.splice(toIndex, 0, tabId);
    } else {
      newToTabIds.push(tabId);
    }

    if (newFromTabIds.length === 0) {
      const newRoot = removeLeafFromTree(layout.root, fromGroupId);
      if (!newRoot) return;
      const remainingGroups = layout.groups
        .filter((g) => g.id !== fromGroupId)
        .map((g) => g.id === toGroupId ? { ...g, tabIds: newToTabIds, activeTabId: tabId } : g);
      set({
        layout: {
          root: newRoot,
          groups: remainingGroups,
          focusedGroupId: toGroupId,
        },
      });
      return;
    }

    const newFromActiveTabId = fromGroup.activeTabId === tabId
      ? newFromTabIds[newFromTabIds.length - 1]
      : fromGroup.activeTabId;

    set({
      layout: {
        ...layout,
        groups: layout.groups.map((g) => {
          if (g.id === fromGroupId) return { ...g, tabIds: newFromTabIds, activeTabId: newFromActiveTabId };
          if (g.id === toGroupId) return { ...g, tabIds: newToTabIds, activeTabId: tabId };
          return g;
        }),
        focusedGroupId: toGroupId,
      },
    });
  },

  splitGroup: (targetGroupId, tabId, direction, position = 'after') => {
    const { layout, tabs } = get();
    if (countLeaves(layout.root) >= MAX_EDITOR_GROUPS) return;

    const targetGroup = layout.groups.find((g) => g.id === targetGroupId);
    if (!targetGroup) return;

    const sourceGroup = findGroupForTab(layout, tabId);
    if (!sourceGroup) return;

    const newGroupId = `group-${Date.now()}`;
    const newSplitId = `split-${Date.now()}`;

    const newGroup: EditorGroup = {
      id: newGroupId,
      tabIds: [tabId],
      activeTabId: tabId,
    };

    const splitChildren: LayoutNode[] = position === 'before'
      ? [{ type: 'leaf', groupId: newGroupId }, { type: 'leaf', groupId: targetGroupId }]
      : [{ type: 'leaf', groupId: targetGroupId }, { type: 'leaf', groupId: newGroupId }];

    const splitNode: LayoutNode = {
      type: 'split',
      id: newSplitId,
      direction,
      children: splitChildren,
      sizes: [50, 50],
    };

    let newRoot = replaceLeafInTree(layout.root, targetGroupId, splitNode);
    let newTabs = [...tabs];
    let newGroups: EditorGroup[];

    const newSourceTabIds = sourceGroup.tabIds.filter(id => id !== tabId);

    if (sourceGroup.id === targetGroupId) {
      if (newSourceTabIds.length === 0) {
        tabCounter++;
        const placeholderTabId = `tab-${tabCounter}`;
        newTabs.push({
          id: placeholderTabId, title: nextQueryTitle(tabs), type: 'query' as const,
          sql: '', result: null, error: null, isExecuting: false,
        });
        newGroups = layout.groups.map(g =>
          g.id === sourceGroup.id
            ? { ...g, tabIds: [placeholderTabId], activeTabId: placeholderTabId }
            : g
        );
      } else {
        const newActiveTabId = sourceGroup.activeTabId === tabId
          ? newSourceTabIds[newSourceTabIds.length - 1]
          : sourceGroup.activeTabId;
        newGroups = layout.groups.map(g =>
          g.id === sourceGroup.id
            ? { ...g, tabIds: newSourceTabIds, activeTabId: newActiveTabId }
            : g
        );
      }
      newGroups.push(newGroup);
    } else {
      if (newSourceTabIds.length === 0) {
        newRoot = removeLeafFromTree(newRoot, sourceGroup.id)!;
        newGroups = layout.groups
          .filter(g => g.id !== sourceGroup.id)
          .concat(newGroup);
      } else {
        const newActiveTabId = sourceGroup.activeTabId === tabId
          ? newSourceTabIds[newSourceTabIds.length - 1]
          : sourceGroup.activeTabId;
        newGroups = layout.groups.map(g =>
          g.id === sourceGroup.id
            ? { ...g, tabIds: newSourceTabIds, activeTabId: newActiveTabId }
            : g
        );
        newGroups.push(newGroup);
      }
    }

    set({
      tabs: newTabs,
      layout: {
        root: newRoot,
        groups: newGroups,
        focusedGroupId: newGroupId,
      },
    });
  },

  closeGroup: (groupId) => {
    const { layout } = get();
    if (layout.groups.length <= 1) return;
    const closingGroup = layout.groups.find((g) => g.id === groupId);
    if (!closingGroup) return;

    const siblingId = findSiblingLeafId(layout.root, groupId);
    if (!siblingId) return;

    const newRoot = removeLeafFromTree(layout.root, groupId);
    if (!newRoot) return;

    const remainingGroups = layout.groups
      .filter((g) => g.id !== groupId)
      .map((g) => g.id === siblingId
        ? { ...g, tabIds: [...g.tabIds, ...closingGroup.tabIds] }
        : g
      );

    set({
      layout: {
        root: newRoot,
        groups: remainingGroups,
        focusedGroupId: siblingId,
      },
    });
  },

  closeAllInGroup: (groupId) => {
    const { layout, tabs } = get();
    const group = layout.groups.find((g) => g.id === groupId);
    if (!group) return;
    const tabIdsToRemove = new Set(group.tabIds);
    if (layout.groups.length > 1) {
      const newRoot = removeLeafFromTree(layout.root, groupId);
      if (!newRoot) return;
      const remainingGroups = layout.groups.filter((g) => g.id !== groupId);
      set({
        tabs: tabs.filter((t) => !tabIdsToRemove.has(t.id)),
        layout: {
          root: newRoot,
          groups: remainingGroups,
          focusedGroupId: remainingGroups[0].id,
        },
      });
    } else {
      set({
        tabs: [],
        layout: {
          root: { type: 'leaf', groupId: group.id },
          groups: [{ id: group.id, tabIds: [], activeTabId: '' }],
          focusedGroupId: group.id,
        },
      });
    }
  },

  closeOthersInGroup: (groupId, keepTabId) => {
    const { layout, tabs } = get();
    const group = layout.groups.find((g) => g.id === groupId);
    if (!group) return;
    const tabIdsToRemove = new Set(group.tabIds.filter((id) => id !== keepTabId));
    set({
      tabs: tabs.filter((t) => !tabIdsToRemove.has(t.id)),
      layout: {
        ...layout,
        groups: layout.groups.map((g) =>
          g.id === groupId
            ? { ...g, tabIds: [keepTabId], activeTabId: keepTabId }
            : g
        ),
      },
    });
  },

  mergeGroups: () => {
    const { layout } = get();
    if (layout.groups.length <= 1) return;
    const mergedTabIds = layout.groups.flatMap((g) => g.tabIds);
    const focusedGroup = layout.groups.find((g) => g.id === layout.focusedGroupId) || layout.groups[0];
    set({
      layout: {
        root: { type: 'leaf', groupId: focusedGroup.id },
        groups: [{ id: focusedGroup.id, tabIds: mergedTabIds, activeTabId: focusedGroup.activeTabId }],
        focusedGroupId: focusedGroup.id,
      },
    });
  },

  setFocusedGroup: (groupId) =>
    set((s) => ({ layout: { ...s.layout, focusedGroupId: groupId } })),

  setSplitSizes: (splitId, sizes) =>
    set((s) => ({
      layout: {
        ...s.layout,
        root: updateSplitSizes(s.layout.root, splitId, sizes),
      },
    })),
}),
    {
      name: 'qery-editor',
      version: 1,
      partialize: (state) => {
        const persistedTabs = state.tabs.map(({ result, error, isExecuting, executionPlan, planXml, isExplaining, externalChange, ...rest }) => rest);
        return { tabs: persistedTabs, layout: state.layout };
      },
      merge: (persisted, current) => {
        const p = persisted as any;
        const tabs = (p?.tabs?.length ? p.tabs : current.tabs).map((tab: any) => ({
          ...tab, result: null, error: null, isExecuting: false, executionPlan: null, planXml: null, isExplaining: false,
        }));
        const layout = p?.layout || current.layout;
        return { ...current, ...p, tabs, layout };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to hydrate editor store:', error);
          return;
        }
        if (state?.tabs) {
          tabCounter = state.tabs.reduce((max: number, t: EditorTab) => {
            const num = parseInt(t.id.replace('tab-', ''), 10);
            return isNaN(num) ? max : Math.max(max, num);
          }, 0);
        }
      },
    }
  )
);
