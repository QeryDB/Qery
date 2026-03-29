import { create } from 'zustand';

interface SchemaState {
  expandedNodes: Set<string>;
  searchQuery: string;
  toggleNode: (key: string) => void;
  setSearchQuery: (query: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

export const useSchemaStore = create<SchemaState>((set) => ({
  expandedNodes: new Set<string>(),
  searchQuery: '',

  toggleNode: (key) =>
    set((s) => {
      const next = new Set(s.expandedNodes);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { expandedNodes: next };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  expandAll: () => set({ expandedNodes: new Set<string>() }), // handled differently in component
  collapseAll: () => set({ expandedNodes: new Set<string>() }),
}));
