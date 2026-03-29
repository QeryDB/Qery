import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DocTarget {
  connectionId: string;
  database: string;
  table: string;
  schema: string;
}

export type AppView = 'editor' | 'descriptions';
export type SidebarPanel = 'schema' | 'history' | 'saved';
interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  sidebarWidth: number;
  bottomPanelHeight: number;
  compactResults: boolean;
  docTarget: DocTarget | null;
  currentView: AppView;
  commandPaletteOpen: boolean;
  activeSidebarPanel: SidebarPanel | null;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (w: number) => void;
  setBottomPanelHeight: (h: number) => void;
  toggleCompactResults: () => void;
  openDoc: (target: DocTarget) => void;
  closeDoc: () => void;
  setCurrentView: (view: AppView) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      sidebarOpen: true,
      sidebarWidth: 280,
      bottomPanelHeight: 300,
      compactResults: false,
      docTarget: null,
      currentView: 'editor',
      commandPaletteOpen: false,
      activeSidebarPanel: 'schema',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      toggleSidebar: () => set((s) => {
        if (s.activeSidebarPanel) {
          return { activeSidebarPanel: null, sidebarOpen: false };
        }
        return { activeSidebarPanel: 'schema', sidebarOpen: true };
      }),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
      toggleCompactResults: () => set((s) => ({ compactResults: !s.compactResults })),
      openDoc: (target) => set({ docTarget: target }),
      closeDoc: () => set({ docTarget: null }),
      setCurrentView: (view) => set({ currentView: view }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSidebarPanel: (panel) => set((s) => {
        if (s.activeSidebarPanel === panel) {
          return { activeSidebarPanel: null, sidebarOpen: false };
        }
        return { activeSidebarPanel: panel, sidebarOpen: true };
      }),
    }),
    {
      name: 'qery-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        bottomPanelHeight: state.bottomPanelHeight,
        compactResults: state.compactResults,
        activeSidebarPanel: state.activeSidebarPanel,
      }),
    }
  )
);
