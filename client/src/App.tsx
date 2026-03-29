import { AppLayout } from './components/layout/AppLayout';
import { CommandPalette } from './components/CommandPalette';
import { useUIStore } from './stores/ui-store';
import { useConnectionStore } from './stores/connection-store';
import { useEditorStore } from './stores/editor-store';
import { useConnections } from './hooks/useConnection';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import * as sessionState from './lib/session-state';
import { hydrateFromSessionState } from './lib/inspector-subtab-state';

const DiscoveryDialog = lazy(() => import('./components/connection/DiscoveryDialog').then(m => ({ default: m.DiscoveryDialog })));
const CompareGrids = lazy(() => import('./components/CompareGrids').then(m => ({ default: m.CompareGrids })));

export default function App() {
  const theme = useUIStore((s) => s.theme);
  useKeyboardShortcuts();

  const [pageHash, setPageHash] = useState(window.location.hash);
  const [showDiscovery, setShowDiscovery] = useState(false);

  const { data: connections, isSuccess } = useConnections();

  useEffect(() => {
    const onHash = () => setPageHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Auto-select: if no valid connection+database is active, pick the first one
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const activeDatabase = useConnectionStore((s) => s.activeDatabase);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);
  const setActiveDatabase = useConnectionStore((s) => s.setActiveDatabase);
  useEffect(() => {
    if (!isSuccess || !connections || connections.length === 0) return;
    const match = activeConnectionId ? connections.find((c) => c.id === activeConnectionId) : null;
    if (!match) {
      const first = connections[0];
      setActiveConnection(first.id, first.database_name || null);
    } else if (!activeDatabase && match.database_name) {
      setActiveDatabase(match.database_name);
    }
  }, [isSuccess, connections, activeConnectionId, activeDatabase, setActiveConnection, setActiveDatabase]);

  // Load session state when connection+database is set
  useEffect(() => {
    if (activeConnectionId && activeDatabase) {
      sessionState.loadForDatabase(activeConnectionId, activeDatabase).then(() => {
        hydrateFromSessionState();
      });
    } else {
      sessionState.reset();
    }
  }, [activeConnectionId, activeDatabase]);

  // Clear stale editor/schema data when connection changes or is removed
  const prevConnectionId = useRef(activeConnectionId);
  useEffect(() => {
    const prev = prevConnectionId.current;
    prevConnectionId.current = activeConnectionId;
    if (prev && prev !== activeConnectionId) {
      const editorState = useEditorStore.getState();
      const allTabs = [...editorState.tabs];
      for (const tab of allTabs) {
        editorState.closeTab(tab.id);
      }
      if (!activeConnectionId) {
        useUIStore.setState({ activeSidebarPanel: null, sidebarOpen: false });
      }
    }
  }, [activeConnectionId]);

  // Auto-open discovery when no connections exist
  useEffect(() => {
    if (!isSuccess) return;
    const hasConnections = connections && connections.length > 0;
    if (!hasConnections) {
      setShowDiscovery(true);
    }
  }, [isSuccess, connections]);

  if (pageHash === '#compare' || pageHash === '#grid') {
    return <Suspense fallback={null}><CompareGrids /></Suspense>;
  }

  return (
    <>
      <AppLayout />
      <CommandPalette />
      <Suspense fallback={null}>
        <DiscoveryDialog
          open={showDiscovery}
          onOpenChange={setShowDiscovery}
          required={isSuccess && (!connections || connections.length === 0)}
        />
      </Suspense>
    </>
  );
}
