import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useUIStore } from '../stores/ui-store';

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+N: New tab (in focused group)
      if (ctrl && e.key === 'n') {
        e.preventDefault();
        useEditorStore.getState().addTab();
      }

      // Ctrl+W: Close tab (in focused group)
      if (ctrl && e.key === 'w') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const focused = state.layout.groups.find((g) => g.id === state.layout.focusedGroupId);
        if (focused?.activeTabId) state.closeTab(focused.activeTabId);
      }

      // Ctrl+B: Toggle sidebar
      if (ctrl && e.key === 'b') {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
      }

      // Ctrl+K: Command palette
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        useUIStore.getState().setCommandPaletteOpen(true);
      }

      // Ctrl+E: Explain query
      if (ctrl && e.key === 'e') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('qery:explain-query'));
      }

      // Ctrl+S: Save query
      if (ctrl && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('qery:save-query'));
      }

      // Ctrl+1/2/3: Switch to editor group
      if (ctrl && ['1', '2', '3'].includes(e.key)) {
        const groupIndex = parseInt(e.key) - 1;
        const state = useEditorStore.getState();
        const group = state.layout.groups[groupIndex];
        if (group) {
          e.preventDefault();
          state.setFocusedGroup(group.id);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
