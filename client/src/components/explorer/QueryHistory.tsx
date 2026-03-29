import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Trash2, Search, X, History } from 'lucide-react';
import { useQueryHistory, useClearQueryHistory } from '@/hooks/useQuery';
import { useEditorStore } from '@/stores/editor-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRelativeTime } from '@/lib/utils';

export function QueryHistory({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation();
  const { data: entries, isLoading } = useQueryHistory(connectionId);
  const clearHistory = useClearQueryHistory(connectionId);
  const addTab = useEditorStore((s) => s.addTab);

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

  const filteredEntries = useMemo(() => {
    if (!entries || !searchQuery) return entries ?? [];
    const lower = searchQuery.toLowerCase();
    return entries.filter((e) => e.sql_text.toLowerCase().includes(lower));
  }, [entries, searchQuery]);

  const totalCount = entries?.length ?? 0;
  const filteredCount = filteredEntries.length;
  const isSearching = searchQuery.length > 0;

  const handleClick = (sql: string) => {
    addTab({ sql });
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {isSearching ? t('explorer.filteredQueryCount', { filtered: filteredCount, total: totalCount }) : t('explorer.queryCount', { count: totalCount })}
        </span>
        {entries && entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={() => clearHistory.mutate()}
            disabled={clearHistory.isPending}
          >
            <Trash2 className="h-3 w-3" />
            {t('explorer.clearHistory')}
          </Button>
        )}
      </div>

      <div className="relative p-2 border-b">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchLocal}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("explorer.searchHistory")}
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
        {!filteredEntries.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <History className="h-8 w-8 opacity-30" />
            <span className="text-xs">{isSearching ? t('explorer.noMatchingQueries') : t('explorer.noHistoryYet')}</span>
            {!isSearching && <span className="text-[10px] opacity-60">{t('explorer.runQueriesToBuild')}</span>}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <button
              key={entry.id}
              className="w-full border-b px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              onClick={() => handleClick(entry.sql_text)}
            >
              <div className="flex items-start gap-1.5">
                {entry.status === 'success' ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-green-500 h-3 w-3" />
                ) : (
                  <XCircle className="mt-0.5 shrink-0 text-red-500 h-3 w-3" />
                )}
                <span className="flex-1 truncate font-mono text-[11px]">
                  {entry.sql_text.split('\n')[0]}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-muted-foreground text-[10px]">
                {entry.duration_ms != null && <span>{entry.duration_ms}ms</span>}
                {entry.row_count != null && <span>{t('common.rowCount', { count: entry.row_count })}</span>}
                <span className="ml-auto">{formatRelativeTime(entry.executed_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
