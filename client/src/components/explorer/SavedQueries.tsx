import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderOpen, Folder, Search, X, Bookmark } from 'lucide-react';
import { useSavedQueries, useDeleteSavedQuery, useUpdateSavedQuery } from '@/hooks/useSavedQueries';
import { useEditorStore } from '@/stores/editor-store';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SavedQuery } from '@/types/query';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface GroupedQueries {
  unsorted: SavedQuery[];
  projects: Record<string, { unsorted: SavedQuery[]; folders: Record<string, SavedQuery[]> }>;
}

function groupQueries(queries: SavedQuery[]): GroupedQueries {
  const result: GroupedQueries = { unsorted: [], projects: {} };
  for (const q of queries) {
    if (!q.project_name) {
      result.unsorted.push(q);
    } else {
      if (!result.projects[q.project_name]) {
        result.projects[q.project_name] = { unsorted: [], folders: {} };
      }
      if (!q.folder_name) {
        result.projects[q.project_name].unsorted.push(q);
      } else {
        if (!result.projects[q.project_name].folders[q.folder_name]) {
          result.projects[q.project_name].folders[q.folder_name] = [];
        }
        result.projects[q.project_name].folders[q.folder_name].push(q);
      }
    }
  }
  return result;
}

function countProjectQueries(project: { unsorted: SavedQuery[]; folders: Record<string, SavedQuery[]> }): number {
  let count = project.unsorted.length;
  for (const folder of Object.values(project.folders)) {
    count += folder.length;
  }
  return count;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function detectQueryType(sql: string): string {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('EXEC')) return 'EXEC';
  if (trimmed.startsWith('CREATE')) return 'DDL';
  if (trimmed.startsWith('ALTER')) return 'DDL';
  if (trimmed.startsWith('DROP')) return 'DDL';
  return 'SQL';
}

function getQueryTypeColor(type: string): { bg: string; text: string } {
  switch (type) {
    case 'SELECT': return { bg: 'bg-blue-500/10', text: 'text-blue-500' };
    case 'INSERT': return { bg: 'bg-green-500/10', text: 'text-green-500' };
    case 'UPDATE': return { bg: 'bg-yellow-500/10', text: 'text-yellow-500' };
    case 'DELETE': return { bg: 'bg-red-500/10', text: 'text-red-500' };
    case 'EXEC': return { bg: 'bg-orange-500/10', text: 'text-orange-500' };
    case 'DDL': return { bg: 'bg-purple-500/10', text: 'text-purple-500' };
    default: return { bg: 'bg-muted', text: 'text-muted-foreground' };
  }
}

export function SavedQueriesPanel() {
  const { t } = useTranslation();
  const { data: queries, isLoading } = useSavedQueries();
  const deleteMutation = useDeleteSavedQuery();
  const updateMutation = useUpdateSavedQuery();
  const addTab = useEditorStore((s) => s.addTab);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [searchLocal, setSearchLocal] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  const handleSearchChange = (value: string) => {
    setSearchLocal(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 150);
  };

  const clearSearch = () => {
    setSearchLocal('');
    setSearchQuery('');
  };

  const filteredQueries = useMemo(() => {
    if (!queries) return [];
    if (!searchQuery) return queries;
    const lower = searchQuery.toLowerCase();
    return queries.filter(
      (q) =>
        q.title.toLowerCase().includes(lower) ||
        q.description?.toLowerCase().includes(lower) ||
        q.sql_text.toLowerCase().includes(lower) ||
        q.project_name?.toLowerCase().includes(lower) ||
        q.folder_name?.toLowerCase().includes(lower)
    );
  }, [queries, searchQuery]);

  const grouped = useMemo(() => groupQueries(filteredQueries), [filteredQueries]);

  const toggle = (key: string) =>
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));

  const handleOpen = (query: SavedQuery) => {
    const { tabs: currentTabs, setActiveTab } = useEditorStore.getState();
    const existing = currentTabs.find((t) => t.savedQueryId === query.id);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    addTab({ sql: query.sql_text, title: query.title, savedQueryId: query.id });
  };

  const handleForceOpen = (query: SavedQuery) => {
    addTab({ sql: query.sql_text, title: query.title, savedQueryId: query.id });
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const totalCount = queries?.length ?? 0;
  const filteredCount = filteredQueries.length;
  const isSearching = searchQuery.length > 0;

  const renderQueryItem = (query: SavedQuery) => {
    const queryType = detectQueryType(query.sql_text);
    const colors = getQueryTypeColor(queryType);

    return (
      <ContextMenu key={query.id}>
        <ContextMenuTrigger asChild>
          <button
            className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            onClick={() => handleOpen(query)}
            onDoubleClick={() => handleForceOpen(query)}
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-medium flex-1">{query.title}</span>
              <span className={cn('shrink-0 rounded px-1.5 text-[10px] font-medium', colors.bg, colors.text)}>
                {queryType}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {formatRelativeTime(query.updated_at)}
            </div>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => handleOpen(query)}>{t('common.open')}</ContextMenuItem>
          <ContextMenuItem onClick={() => handleForceOpen(query)}>{t('common.openInNewTab')}</ContextMenuItem>
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(query.sql_text)}>
            {t('common.copySql')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteMutation.mutate(query.id)}
          >
            {t('common.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const projectKeys = Object.keys(grouped.projects).sort();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {isSearching ? t('explorer.filteredSavedCount', { filtered: filteredCount, total: totalCount }) : t('explorer.savedCount', { count: totalCount })}
        </span>
      </div>

      <div className="relative p-2 border-b">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchLocal}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("explorer.searchSaved")}
          className="h-7 pl-8 text-xs"
        />
        {searchLocal && (
          <button
            onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!filteredQueries.length ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <Bookmark className="h-8 w-8 opacity-30" />
            <p className="text-xs">{isSearching ? t('explorer.noMatchingSaved') : t('explorer.noSavedYet')}</p>
            {!isSearching && <p className="text-[10px]">{t('explorer.saveWithCtrlS')}</p>}
          </div>
        ) : (
          <>
            {grouped.unsorted.map(renderQueryItem)}

            {projectKeys.map((projectName) => {
              const projectData = grouped.projects[projectName];
              const projectKey = `project:${projectName}`;
              const isCollapsed = collapsed[projectKey];
              const folderKeys = Object.keys(projectData.folders).sort();
              const projectCount = countProjectQueries(projectData);

              return (
                <div key={projectKey}>
                  <button
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-xs font-medium hover:bg-muted/50"
                    onClick={() => toggle(projectKey)}
                  >
                    <ChevronRight className={cn('h-3 w-3 transition-transform', !isCollapsed && 'rotate-90')} />
                    <FolderOpen className="h-3 w-3 text-yellow-600" />
                    {projectName}
                    <span className="ml-auto text-[10px] text-muted-foreground">{projectCount}</span>
                  </button>
                  {!isCollapsed && (
                    <>
                      <div className="pl-3">
                        {projectData.unsorted.map(renderQueryItem)}
                      </div>

                      {folderKeys.map((folderName) => {
                        const folderKey = `folder:${projectName}/${folderName}`;
                        const isFolderCollapsed = collapsed[folderKey];
                        const folderCount = projectData.folders[folderName].length;
                        return (
                          <div key={folderKey}>
                            <button
                              className="flex w-full items-center gap-1 pl-5 pr-2 py-1.5 text-xs font-medium hover:bg-muted/50"
                              onClick={() => toggle(folderKey)}
                            >
                              <ChevronRight className={cn('h-3 w-3 transition-transform', !isFolderCollapsed && 'rotate-90')} />
                              <Folder className="h-3 w-3 text-blue-500" />
                              {folderName}
                              <span className="ml-auto text-[10px] text-muted-foreground">{folderCount}</span>
                            </button>
                            {!isFolderCollapsed && (
                              <div className="pl-6">
                                {projectData.folders[folderName].map(renderQueryItem)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

    </div>
  );
}
