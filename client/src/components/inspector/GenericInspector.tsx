import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from './ScrollableTabsList';
import { ColumnsTab } from './ColumnsTab';
import { IndexesTab } from './IndexesTab';
import { DefinitionTab } from './DefinitionTab';
import { DependenciesTab } from './DependenciesTab';
import { ObjectExecutor } from './ObjectExecutor';
import { KeyValueTab } from './KeyValueTab';
import { ValueListTab } from './ValueListTab';
import { InspectorBreadcrumb } from './InspectorBreadcrumb';
import { InspectorHeader } from './InspectorHeader';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { useSchema } from '@/hooks/useSchema';
import { api } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { getSubTab, setSubTab } from '@/lib/inspector-subtab-state';
import type { ObjectTypeDescriptor, TabDescriptor } from '@/types/schema';

const tabListCls = 'bg-transparent rounded-none h-10 w-full justify-start p-0 px-2 gap-0 border-b';
const tabTriggerCls = 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:font-semibold px-4 py-2.5 text-xs data-[state=active]:text-foreground text-muted-foreground whitespace-nowrap shrink-0';

interface Props {
  connectionId: string;
  database: string;
  name: string;
  schema: string;
  objectType: string;
  definition?: string;
  breadcrumb?: InspectorTarget[];
  tabId?: string;
}

/** Generic metadata-driven inspector for any object type */
export function GenericInspector({ connectionId, database, name, schema, objectType, definition: propDefinition, breadcrumb = [], tabId }: Props) {
  const { data: schemaData } = useSchema(connectionId, database);
  const objectTypeDescriptor = schemaData?.object_types?.find((ot: ObjectTypeDescriptor) => ot.key === objectType);

  const tabKey = `${objectType}-${connectionId}-${database}-${schema}-${name}`;
  const defaultTab = objectTypeDescriptor?.tabs?.[0]?.key || 'details';
  const [activeSubTab, setActiveSubTab] = useState(() => getSubTab(objectType, tabKey, connectionId, database, schema, name, defaultTab));
  const handleSubTabChange = useCallback((value: string) => {
    setActiveSubTab(value);
    setSubTab(objectType, tabKey, value, connectionId, database, schema, name);
  }, [objectType, tabKey, connectionId, database, schema, name]);

  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);
  const navigateInspector = useEditorStore((s) => s.navigateInspector);

  const handleNavigate = (_schema: string, objName: string, type: string | null) => {
    const objType = type?.includes('PROCEDURE') ? 'procedure'
      : type?.includes('FUNCTION') ? 'function'
      : type?.includes('VIEW') ? 'view'
      : 'table';
    const target = { connectionId, database, table: objName, schema: _schema, objectType: objType };
    if (tabId) navigateInspector(tabId, target);
    else addInspectorTab(target);
  };

  if (!objectTypeDescriptor) {
    return <div className="p-4 text-sm text-muted-foreground">Unknown object type: {objectType}</div>;
  }

  const tabs = objectTypeDescriptor.tabs;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <InspectorBreadcrumb breadcrumb={breadcrumb} current={{ connectionId, database, table: name, schema, objectType }} />
      <InspectorHeader
        name={`${schema}.${name}`}
        connectionId={connectionId}
        database={database}
        typeBadge={{ label: objectTypeDescriptor.label_singular, color: objectTypeDescriptor.color }}
      />

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="flex-1 flex flex-col overflow-hidden">
        <ScrollableTabsList className={tabListCls}>
          {tabs.map((tab: TabDescriptor) => (
            <TabsTrigger key={tab.key} value={tab.key} className={tabTriggerCls}>
              {tab.label}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>

        {tabs.map((tab: TabDescriptor) => (
          <TabsContent key={tab.key} value={tab.key} className="flex-1 overflow-auto mt-0">
            <GenericTabContent
              connectionId={connectionId}
              database={database}
              name={name}
              schema={schema}
              objectType={objectType}
              tab={tab}
              definition={propDefinition}
              onNavigate={handleNavigate}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** Map data_key to existing API endpoint paths */
function getApiPath(
  connectionId: string, database: string, name: string, schema: string,
  objectType: string, dataKey: string,
): string | null {
  const db = encodeURIComponent(database);
  const n = encodeURIComponent(name);
  const s = encodeURIComponent(schema);
  const base = `/connections/${connectionId}/databases/${db}`;

  // Always use the generic endpoint — it passes object_type so the driver can route correctly
  return `${base}/object-data/${encodeURIComponent(objectType)}/${n}?schema=${s}&key=${encodeURIComponent(dataKey)}`;
}

/** Fetches data and renders a tab based on the TabDescriptor */
function GenericTabContent({
  connectionId, database, name, schema, objectType, tab, definition, onNavigate,
}: {
  connectionId: string;
  database: string;
  name: string;
  schema: string;
  objectType: string;
  tab: TabDescriptor;
  definition?: string;
  onNavigate: (schema: string, name: string, type: string | null) => void;
}) {
  // Map data_key to existing API routes
  const apiPath = getApiPath(connectionId, database, name, schema, objectType, tab.data_key);

  const { data, isLoading, error } = useQuery({
    queryKey: ['object-data', connectionId, database, objectType, name, schema, tab.data_key],
    queryFn: () => apiPath ? api.get<any>(apiPath) : Promise.resolve(null),
    enabled: !!apiPath && (tab.renderer !== 'Definition' || !definition),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-destructive">{(error as Error).message}</div>;
  }

  const tabData = data ?? null;

  switch (tab.renderer) {
    case 'Columns':
      return <ColumnsTab columns={Array.isArray(tabData) ? tabData : []} />;
    case 'Indexes': {
      // Parse comma-separated columns string into array (same as tables.ts parse_index_columns)
      const indexes = Array.isArray(tabData) ? tabData.map((idx: any) => ({
        ...idx,
        columns: typeof idx.columns === 'string' ? idx.columns.split(', ') : idx.columns || [],
      })) : [];
      return <IndexesTab indexes={indexes} />;
    }
    case 'Definition': {
      const def = definition || tabData?.definition || (typeof tabData === 'string' ? tabData : null);
      return <DefinitionTab
        definition={def || '-- Definition not available'}
        connectionId={connectionId}
        database={database}
      />;
    }
    case 'Dependencies':
      return <DependenciesTab
        dependencies={Array.isArray(tabData) ? tabData : []}
        onNavigate={onNavigate}
      />;
    case 'Executor':
      return <ObjectExecutor
        connectionId={connectionId}
        database={database}
        objectName={name}
        schema={schema}
        objectType="view"
      />;
    case 'KeyValue':
      return <KeyValueTab data={tabData} />;
    case 'ValueList':
      return <ValueListTab data={Array.isArray(tabData) ? tabData : []} />;
    default:
      return <div className="p-4 text-sm text-muted-foreground">Renderer "{tab.renderer}" not yet implemented</div>;
  }
}
