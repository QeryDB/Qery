import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from './ScrollableTabsList';
import { ColumnsTab } from './ColumnsTab';
import { IndexesTab } from './IndexesTab';
import { ForeignKeysTab } from './ForeignKeysTab';
import { ReferencedByTab } from './ReferencedByTab';
import { DependenciesTab } from './DependenciesTab';
import { RelationshipsTab } from './RelationshipsTab';
import { DataPreview } from './DataPreview';
import { AddRelationshipDialog } from './AddRelationshipDialog';
import { AnnotationsTab } from './AnnotationsTab';
import { useTableColumns, useTableIndexes, useTableForeignKeys, useReferencedBy } from '@/hooks/useTableDetails';
import { useUsedBy } from '@/hooks/useObjectDetails';
import { useGhostFKs, useAddRelationship, useDismissRelationship, useUndismissRelationship, useDeleteRelationship } from '@/hooks/useGhostFKs';
import { useDialect } from '@/hooks/useDriver';
import { api } from '@/lib/api';
import { useSchema } from '@/hooks/useSchema';
import { useEditorStore, type InspectorTarget } from '@/stores/editor-store';
import { InspectorBreadcrumb } from './InspectorBreadcrumb';
import { InspectorHeader } from './InspectorHeader';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSubTab, setSubTab } from '@/lib/inspector-subtab-state';
import { InspectorSkeleton } from './InspectorSkeleton';
import type { GhostFKInfo } from '@/types/schema';

const tabListCls = 'bg-transparent rounded-none h-10 w-full justify-start p-0 px-2 gap-0 border-b';
const tabTriggerCls = 'rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:font-semibold px-4 py-2.5 text-xs data-[state=active]:text-foreground text-muted-foreground whitespace-nowrap shrink-0';

interface Props {
  connectionId: string;
  database: string;
  table: string;
  schema?: string;
  breadcrumb?: InspectorTarget[];
  tabId?: string;
}

export function TableInspector({ connectionId, database, table, schema = 'dbo', breadcrumb = [], tabId }: Props) {
  const { t } = useTranslation();
  const dialect = useDialect();
  const tabKey = `${connectionId}-${database}-${schema}-${table}`;
  const [activeSubTab, setActiveSubTab] = useState(() => getSubTab('table', tabKey, connectionId, database, schema, table, 'columns'));
  const handleSubTabChange = useCallback((value: string) => {
    setActiveSubTab(value);
    setSubTab('table', tabKey, value, connectionId, database, schema, table);
  }, [tabKey, connectionId, database, schema, table]);

  // Core: only columns block the page render
  const { data: columns, isLoading } = useTableColumns(connectionId, database, table, schema);

  // Eager non-blocking: all load in background for tab badge counts
  const { data: indexes } = useTableIndexes(connectionId, database, table, schema);
  const { data: foreignKeys } = useTableForeignKeys(connectionId, database, table, schema);
  const { data: referencedBy } = useReferencedBy(connectionId, database, table, schema);
  const { data: usedByData } = useUsedBy(connectionId, database, table, schema);
  const { data: ghostData, isLoading: ghostInitial, isFetching: ghostLoading } = useGhostFKs(connectionId, database, table, schema);
  const { data: schemaTree } = useSchema(connectionId, database);

  const addInspectorTab = useEditorStore((s) => s.addInspectorTab);
  const navigateInspector = useEditorStore((s) => s.navigateInspector);

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const addRelMutation = useAddRelationship();
  const dismissMutation = useDismissRelationship();
  const undismissMutation = useUndismissRelationship();
  const deleteMutation = useDeleteRelationship();

  const viewNameSet = new Set((schemaTree?.views || []).map(v => v.name.toLowerCase()));
  const handleNavigate = (targetSchema: string, targetTable: string) => {
    const objectType = viewNameSet.has(targetTable.toLowerCase()) ? 'view' as const : 'table' as const;
    const target = { connectionId, database, table: targetTable, schema: targetSchema, objectType };
    if (tabId) {
      navigateInspector(tabId, target);
    } else {
      addInspectorTab(target);
    }
  };

  const handleObjectNavigate = (_schema: string, objName: string, type: string | null) => {
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

  const handleDismiss = (fk: GhostFKInfo) => {
    dismissMutation.mutate({
      connectionId,
      database,
      body: { from_table: fk.from_table, from_column: fk.from_column, to_table: fk.to_table, to_column: fk.to_column },
    });
  };

  const handleUndismiss = (fk: GhostFKInfo) => {
    undismissMutation.mutate({ connectionId, database, relId: fk.id });
  };

  const handleDeleteManual = (fk: GhostFKInfo) => {
    deleteMutation.mutate({ connectionId, database, relId: fk.id });
  };

  const handleAddRelationship = (data: { from_table: string; from_column: string; to_table: string; to_column: string; description?: string }) => {
    addRelMutation.mutate({ connectionId, database, body: data });
  };

  const queryClient = useQueryClient();
  const handleRefreshRelationships = useCallback(async () => {
    // Clear backend SQLite cache for this table's ghost FKs
    try {
      await api.post(`/connections/${connectionId}/databases/${database}/tables/${table}/ghost-fks/invalidate`, { schema });
    } catch { /* ignore — old backends won't have this endpoint */ }
    // Invalidate react-query cache — forces refetch from backend
    queryClient.invalidateQueries({ queryKey: ['ghost-fks', connectionId, database, table] });
    queryClient.invalidateQueries({ queryKey: ['relationship-overrides', connectionId, database] });
  }, [queryClient, connectionId, database, table, schema]);

  if (isLoading) return <InspectorSkeleton />;
  if (!columns) return <div className="p-4 text-sm text-muted-foreground">{t("inspector.tableNotFound")}</div>;

  const refs = referencedBy || [];
  const usedByList = usedByData || [];
  const fks = foreignKeys || [];
  const idxs = indexes || [];
  const rawGhostFKs = ghostData?.ghost_fks || [];
  const manualFKs = ghostData?.manual_fks || [];
  const dismissedCount = ghostData?.dismissed_count || 0;

  // Dedup ghost FKs that overlap with real FKs
  const realFKKeys = new Set<string>();
  for (const fk of fks) {
    realFKKeys.add(`${table}|${fk.column}|${fk.referenced_table}|${fk.referenced_column}`.toLowerCase());
    realFKKeys.add(`${fk.referenced_table}|${fk.referenced_column}|${table}|${fk.column}`.toLowerCase());
  }
  for (const ref of refs) {
    realFKKeys.add(`${ref.referencing_table}|${ref.column}|${table}|${ref.referenced_column}`.toLowerCase());
    realFKKeys.add(`${table}|${ref.referenced_column}|${ref.referencing_table}|${ref.column}`.toLowerCase());
  }
  const ghostFKs = rawGhostFKs.filter(fk =>
    !realFKKeys.has(`${fk.from_table}|${fk.from_column}|${fk.to_table}|${fk.to_column}`.toLowerCase())
  );

  // Relationship count: real FKs + real refs + deduped active ghost + manual
  const realCount = fks.length + refs.length;
  const ghostActiveCount = ghostFKs.filter((fk) => !fk.is_dismissed).length;
  const relCount = realCount + ghostActiveCount + manualFKs.length;

  const tableRowCount = schemaTree?.tables?.find(
    (t) => t.name === table && t.schema === schema
  )?.row_count;

  const currentTarget: InspectorTarget = { connectionId, database, table, schema, objectType: 'table' };

  return (
    <div className="flex h-full flex-col">
      <div className="px-2 pt-2">
        <InspectorBreadcrumb breadcrumb={breadcrumb} current={currentTarget} />
      </div>
      <InspectorHeader name={`${schema}.${table}`} connectionId={connectionId} database={database} typeBadge={{ label: 'TABLE', color: '#3b82f6' }} />
      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="flex flex-1 flex-col min-h-0">
        <ScrollableTabsList className={tabListCls}>
          <TabsTrigger value="columns" className={tabTriggerCls}>Columns ({columns.length})</TabsTrigger>
          <TabsTrigger value="indexes" className={tabTriggerCls}>Indexes ({idxs.length})</TabsTrigger>
          <TabsTrigger value="fks" className={tabTriggerCls}>Foreign Keys ({fks.length})</TabsTrigger>
          <TabsTrigger value="referenced-by" className={tabTriggerCls}>{t("inspector.referencedBy")} ({refs.length})</TabsTrigger>
          <TabsTrigger value="used-by" className={tabTriggerCls}>{t("editor.usedBy")} ({usedByList.length})</TabsTrigger>
          <TabsTrigger value="relationships" className={`${tabTriggerCls} gap-1`}>
            Relationships {ghostLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : `(${relCount})`}
          </TabsTrigger>
          <TabsTrigger value="notes" className={tabTriggerCls}>{t("inspector.notes")}</TabsTrigger>
          <TabsTrigger value="data" className={tabTriggerCls}>{ t('inspector.data')}{tableRowCount != null ? ` (${tableRowCount.toLocaleString()})` : ''}</TabsTrigger>
        </ScrollableTabsList>
        <div className="relative flex-1 min-h-0">
          {/* DataPreview: always mounted, first in DOM so other tabs paint over it.
               Never use invisible/display:none — Glide Data Grid canvas loses state.
               TabsContent siblings have bg-background to fully cover this when active. */}
          <div
            className={cn(
              "absolute inset-0 overflow-hidden",
              activeSubTab !== 'data' && 'pointer-events-none'
            )}
          >
            <DataPreview
              connectionId={connectionId}
              database={database}
              table={table}
              schema={schema}
              primaryKeys={columns.filter((c) => c.is_primary_key).map((c) => c.name)}
              isActive={activeSubTab === 'data'}
            />
          </div>
          <TabsContent value="columns" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <ColumnsTab columns={columns} />
          </TabsContent>
          <TabsContent value="indexes" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <IndexesTab indexes={idxs} />
          </TabsContent>
          <TabsContent value="fks" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <ForeignKeysTab foreignKeys={fks} onNavigate={handleNavigate} />
          </TabsContent>
          <TabsContent value="referenced-by" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <ReferencedByTab referencedBy={refs} onNavigate={handleNavigate} />
          </TabsContent>
          <TabsContent value="used-by" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <DependenciesTab dependencies={usedByList} label="References" onNavigate={handleObjectNavigate} />
          </TabsContent>
          <TabsContent value="relationships" className="absolute inset-0 mt-0 overflow-hidden bg-background">
            <RelationshipsTab
              tableName={table}
              schemaName={schema}
              foreignKeys={fks}
              referencedBy={refs}
              onNavigate={handleNavigate}
              ghostFKs={ghostFKs}
              manualFKs={manualFKs}
              dismissedCount={dismissedCount}
              isLoading={ghostLoading}
              onDismiss={handleDismiss}
              onUndismiss={handleUndismiss}
              onDeleteManual={handleDeleteManual}
              onAddRelationship={() => setAddDialogOpen(true)}
              onRefresh={handleRefreshRelationships}
              viewNames={viewNameSet}
              tableSchemaMap={new Map([
                ...(schemaTree?.tables || []).map(t => [t.name.toLowerCase(), t.schema] as const),
                ...(schemaTree?.views || []).map(v => [v.name.toLowerCase(), v.schema] as const),
              ])}
              defaultSchema={dialect.defaultSchema}
            />
          </TabsContent>
          <TabsContent value="notes" className="absolute inset-0 mt-0 overflow-auto bg-background">
            <AnnotationsTab connectionId={connectionId} database={database} table={table} columns={columns} />
          </TabsContent>
        </div>
      </Tabs>

      <AddRelationshipDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        connectionId={connectionId}
        database={database}
        currentTable={table}
        currentSchema={schema}
        currentColumns={columns}
        tables={schemaTree?.tables || []}
        onSave={handleAddRelationship}
      />
    </div>
  );
}
