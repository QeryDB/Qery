import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from './ScrollableTabsList';
import { DefinitionTab } from './DefinitionTab';
import { ColumnsTab } from './ColumnsTab';
import { DependenciesTab } from './DependenciesTab';
import { ObjectExecutor } from './ObjectExecutor';
import { useViewColumns, useDependencies, useUsedBy, useDefinition } from '@/hooks/useObjectDetails';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { InspectorBreadcrumb } from './InspectorBreadcrumb';
import { InspectorHeader } from './InspectorHeader';
import { parseColumnDetails } from '@/lib/column-alias-parser';
import { Loader2 } from 'lucide-react';
import { getSubTab, setSubTab } from '@/lib/inspector-subtab-state';

const tabListCls = 'bg-transparent rounded-none h-10 w-full justify-start p-0 px-2 gap-0 border-b';
const tabTriggerCls = 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:font-semibold px-4 py-2.5 text-xs data-[state=active]:text-foreground text-muted-foreground whitespace-nowrap shrink-0';

interface Props {
  connectionId: string;
  database: string;
  name: string;
  schema: string;
  definition?: string;
  breadcrumb?: InspectorTarget[];
  tabId?: string;
}

export function ViewInspector({ connectionId, database, name, schema, definition: propDefinition, breadcrumb = [], tabId }: Props) {
  const { t } = useTranslation();
  const tabKey = `view-${connectionId}-${database}-${schema}-${name}`;
  const [activeSubTab, setActiveSubTab] = useState(() => getSubTab('view', tabKey, connectionId, database, schema, name, 'definition'));
  const handleSubTabChange = useCallback((value: string) => {
    setActiveSubTab(value);
    setSubTab('view', tabKey, value, connectionId, database, schema, name);
  }, [tabKey, connectionId, database, schema, name]);

  const { data: fetchedDefinition } = useDefinition(connectionId, database, name, schema, propDefinition);
  const definition = fetchedDefinition || propDefinition || undefined;
  const { data: columns, isLoading: colsLoading } = useViewColumns(connectionId, database, name, schema);

  // Eager non-blocking
  const { data: deps } = useDependencies(connectionId, database, name, schema);
  const { data: usedBy } = useUsedBy(connectionId, database, name, schema);

  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);
  const navigateInspector = useEditorStore((s) => s.navigateInspector);

  const handleNavigate = (_schema: string, objName: string, type: string | null) => {
    const objType = type?.includes('PROCEDURE') ? 'procedure' as const
      : type?.includes('FUNCTION') ? 'function' as const
      : type?.includes('VIEW') ? 'view' as const
      : 'table' as const;
    const target = { connectionId, database, table: objName, schema: _schema, objectType: objType };
    if (tabId) {
      navigateInspector(tabId, target);
    } else {
      addInspectorTab(target);
    }
  };

  const handleDefinitionNavigate = useCallback((targetSchema: string, objName: string, objectType: 'table' | 'view' | 'procedure' | 'function') => {
    const target = { connectionId, database, table: objName, schema: targetSchema, objectType };
    if (tabId) {
      navigateInspector(tabId, target);
    } else {
      addInspectorTab(target);
    }
  }, [connectionId, database, tabId, navigateInspector, addInspectorTab]);

  const cols = columns || [];
  const depsList = deps || [];
  const usedByList = usedBy || [];

  const columnDetails = useMemo(() => parseColumnDetails(definition), [definition]);

  const currentTarget: InspectorTarget = { connectionId, database, table: name, schema, objectType: 'view' };

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 pt-2">
        <InspectorBreadcrumb breadcrumb={breadcrumb} current={currentTarget} />
      </div>
      <InspectorHeader name={`${schema}.${name}`} connectionId={connectionId} database={database} typeBadge={{ label: 'VIEW', color: '#a855f7' }} />
      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="flex flex-1 flex-col min-h-0">
        <ScrollableTabsList className={tabListCls}>
          <TabsTrigger value="definition" className={tabTriggerCls}>{t("editor.definition")}</TabsTrigger>
          <TabsTrigger value="results" className={tabTriggerCls}>{t("editor.results")}</TabsTrigger>
          <TabsTrigger value="columns" className={tabTriggerCls}>
            Columns {colsLoading ? <Loader2 className="ml-1 h-3 w-3 animate-spin" /> : `(${cols.length})`}
          </TabsTrigger>
          <TabsTrigger value="dependencies" className={tabTriggerCls}>Dependencies ({depsList.length})</TabsTrigger>
          <TabsTrigger value="used-by" className={tabTriggerCls}>{t("editor.usedBy")} ({usedByList.length})</TabsTrigger>
        </ScrollableTabsList>
        <TabsContent value="results" className="mt-0 flex-1 min-h-0">
          <ObjectExecutor
            connectionId={connectionId}
            database={database}
            objectName={name}
            schema={schema}
            objectType="view"
            definition={definition}
          />
        </TabsContent>
        <TabsContent value="definition" className="mt-0 flex-1 min-h-0 overflow-auto">
          <DefinitionTab definition={definition} connectionId={connectionId} database={database} onNavigate={handleDefinitionNavigate} />
        </TabsContent>
        <TabsContent value="columns" className="mt-0 flex-1 min-h-0 overflow-auto">
          <ColumnsTab
            columns={cols as any}
            columnDetails={columnDetails}
            onNavigate={(s, n, t) => handleDefinitionNavigate(s, n, t)}
          />
        </TabsContent>
        <TabsContent value="dependencies" className="mt-0 flex-1 min-h-0 overflow-auto">
          <DependenciesTab dependencies={depsList} label={t("inspector.dependency")} onNavigate={handleNavigate} />
        </TabsContent>
        <TabsContent value="used-by" className="mt-0 flex-1 min-h-0 overflow-auto">
          <DependenciesTab dependencies={usedByList} label={t("inspector.reference")} onNavigate={handleNavigate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
