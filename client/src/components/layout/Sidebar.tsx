import { SchemaTree } from '@/components/explorer/SchemaTree';
import { TreeSearch } from '@/components/explorer/TreeSearch';
import { SavedQueriesPanel } from '@/components/explorer/SavedQueries';
import { QueryHistory } from '@/components/explorer/QueryHistory';
import { useConnectionStore } from '@/stores/connection-store';
import { useUIStore } from '@/stores/ui-store';

export function Sidebar() {
  const { activeConnectionId, activeDatabase } = useConnectionStore();
  const activeSidebarPanel = useUIStore((s) => s.activeSidebarPanel);

  let content: React.ReactNode;

  if (activeSidebarPanel === 'saved') {
    content = <SavedQueriesPanel />;
  } else if (activeSidebarPanel === 'history' && activeConnectionId) {
    content = <QueryHistory connectionId={activeConnectionId} />;
  } else if (activeSidebarPanel === 'schema' && activeConnectionId && activeDatabase) {
    content = (
      <>
        <TreeSearch />
        <SchemaTree connectionId={activeConnectionId} database={activeDatabase} />
      </>
    );
  } else {
    content = (
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">
          {!activeConnectionId ? 'Select a connection' : !activeDatabase ? 'Select a database' : 'Select a panel'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex-1 flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  );
}
