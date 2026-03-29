import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from './ScrollableTabsList';
import { DefinitionTab } from './DefinitionTab';
import { ParametersTab } from './ParametersTab';
import { DependenciesTab } from './DependenciesTab';
import { ObjectExecutor } from './ObjectExecutor';
import { useDependencies, useUsedBy, useDefinition, useParameters } from '@/hooks/useObjectDetails';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { InspectorBreadcrumb } from './InspectorBreadcrumb';
import { InspectorHeader } from './InspectorHeader';
import { getSubTab, setSubTab } from '@/lib/inspector-subtab-state';
import { parseParamsFromDefinition, parseVariablesFromDefinition } from '@/lib/parse-definition-params';

const tabListCls = 'bg-transparent rounded-none h-10 w-full justify-start p-0 px-2 gap-0 border-b';
const tabTriggerCls = 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:font-semibold px-4 py-2.5 text-xs data-[state=active]:text-foreground text-muted-foreground whitespace-nowrap shrink-0';

interface Props {
  connectionId: string;
  database: string;
  name: string;
  schema: string;
  definition?: string;
  functionType?: string;
  breadcrumb?: InspectorTarget[];
  tabId?: string;
}

export function FunctionInspector({ connectionId, database, name, schema, definition: propDefinition, functionType, breadcrumb = [], tabId }: Props) {
  const { t } = useTranslation();
  const tabKey = `fn-${connectionId}-${database}-${schema}-${name}`;
  const [activeSubTab, setActiveSubTab] = useState(() => getSubTab('fn', tabKey, connectionId, database, schema, name, 'definition'));
  const handleSubTabChange = useCallback((value: string) => {
    setActiveSubTab(value);
    setSubTab('fn', tabKey, value, connectionId, database, schema, name);
  }, [tabKey, connectionId, database, schema, name]);

  const { data: fetchedDefinition } = useDefinition(connectionId, database, name, schema, propDefinition);
  const definition = fetchedDefinition || propDefinition || undefined;

  // Fetch parameters from backend (works for all databases)
  const { data: backendParams } = useParameters(connectionId, database, name, schema);
  const parsedFromDef = useMemo(() => parseParamsFromDefinition(definition), [definition]);
  const parsedParams = (backendParams && backendParams.length > 0) ? backendParams : parsedFromDef;
  const parsedVars = useMemo(() => parseVariablesFromDefinition(definition), [definition]);

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

  const depsList = deps || [];
  const usedByList = usedBy || [];
  const inputCount = parsedParams.filter(p => !p.is_output).length;
  const varCount = parsedVars.length;

  const currentTarget: InspectorTarget = { connectionId, database, table: name, schema, objectType: 'function' };

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 pt-2">
        <InspectorBreadcrumb breadcrumb={breadcrumb} current={currentTarget} />
      </div>
      <InspectorHeader name={`${schema}.${name}`} connectionId={connectionId} database={database} typeBadge={{ label: 'FUNCTION', color: '#14b8a6' }} />
      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="flex flex-1 flex-col min-h-0">
        <ScrollableTabsList className={tabListCls}>
          <TabsTrigger value="definition" className={tabTriggerCls}>{t("editor.definition")}</TabsTrigger>
          {functionType !== 'TRIGGER' && <TabsTrigger value="execute" className={tabTriggerCls}>{t("editor.execute")}</TabsTrigger>}
          <TabsTrigger value="parameters" className={tabTriggerCls}>
            Parameters ({inputCount}{varCount > 0 ? `+${varCount}` : ''})
          </TabsTrigger>
          <TabsTrigger value="dependencies" className={tabTriggerCls}>Dependencies ({depsList.length})</TabsTrigger>
          <TabsTrigger value="used-by" className={tabTriggerCls}>{t("editor.usedBy")} ({usedByList.length})</TabsTrigger>
        </ScrollableTabsList>
        <TabsContent value="execute" className="mt-0 flex-1 min-h-0">
          <ObjectExecutor
            connectionId={connectionId}
            database={database}
            objectName={name}
            schema={schema}
            objectType="function"
            parameters={parsedParams}
            functionType={functionType}
            definition={definition}
          />
        </TabsContent>
        <TabsContent value="definition" className="mt-0 flex-1 min-h-0 overflow-auto">
          <DefinitionTab definition={definition} connectionId={connectionId} database={database} onNavigate={handleDefinitionNavigate} />
        </TabsContent>
        <TabsContent value="parameters" className="mt-0 flex-1 min-h-0 overflow-auto">
          <ParametersTab parameters={parsedParams} variables={parsedVars} />
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
