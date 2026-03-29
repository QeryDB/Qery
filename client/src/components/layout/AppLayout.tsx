import { lazy, Suspense } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Loader2 } from 'lucide-react';
import { TopBar } from './TopBar';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { MainPanel } from './MainPanel';
import { DocDrawer } from './DocDrawer';
import { StatusBar } from './StatusBar';
import { useUIStore } from '@/stores/ui-store';

const DescriptionsPage = lazy(() =>
  import('@/components/descriptions/DescriptionsPage').then((m) => ({ default: m.DescriptionsPage }))
);

export function AppLayout() {
  return <DesktopLayout />;
}

function DesktopLayout() {
  const activeSidebarPanel = useUIStore((s) => s.activeSidebarPanel);
  const docTarget = useUIStore((s) => s.docTarget);
  const currentView = useUIStore((s) => s.currentView);

  const showSidebar = activeSidebarPanel !== null;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar />
        <div className="flex-1 overflow-hidden">
          {currentView === 'descriptions' ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
              <DescriptionsPage />
            </Suspense>
          ) : (
            <PanelGroup direction="horizontal">
              {showSidebar && (
                <>
                  <Panel defaultSize={20} minSize={15} maxSize={40}>
                    <Sidebar />
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                </>
              )}
              <Panel defaultSize={docTarget ? 60 : 80}>
                <MainPanel />
              </Panel>
              {docTarget && (
                <>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
                  <Panel defaultSize={20} minSize={15} maxSize={40}>
                    <DocDrawer />
                  </Panel>
                </>
              )}
            </PanelGroup>
          )}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
