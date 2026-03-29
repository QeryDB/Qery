import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { QueryResult, QueryHistoryEntry } from '../types/query';

export function useExecuteQuery() {
  return useMutation({
    mutationFn: ({
      connectionId,
      database,
      sql,
      params,
      queryId,
    }: {
      connectionId: string;
      database: string;
      sql: string;
      params?: Record<string, any>;
      queryId?: string;
    }) => api.post<QueryResult>(`/connections/${connectionId}/databases/${database}/query`, { sql, params, queryId }),
  });
}

export function cancelQuery(queryId: string) {
  return api.post('/query/cancel', { queryId });
}

export function useExplainQuery() {
  return useMutation({
    mutationFn: ({
      connectionId,
      database,
      sql,
    }: {
      connectionId: string;
      database: string;
      sql: string;
    }) => api.post<any>(
      `/connections/${connectionId}/databases/${database}/explain`,
      { sql },
    ),
  });
}

export interface IndexSizeEstimate {
  rowCount: number;
  estimatedSizeMB: number;
  columnDetails: { name: string; maxLength: number }[];
}

export function useEstimateIndexSize() {
  return useMutation({
    mutationFn: ({
      connectionId,
      database,
      schema,
      table,
      columns,
    }: {
      connectionId: string;
      database: string;
      schema: string;
      table: string;
      columns: string[];
    }) => api.post<IndexSizeEstimate>(
      `/connections/${connectionId}/databases/${database}/estimate-index`,
      { schema, table, columns },
    ),
  });
}

export function useQueryHistory(connectionId: string | null) {
  return useQuery({
    queryKey: ['query-history', connectionId],
    queryFn: () => api.get<QueryHistoryEntry[]>(`/connections/${connectionId}/query-history`),
    enabled: !!connectionId,
    staleTime: 30_000,
  });
}

export function useClearQueryHistory(connectionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/connections/${connectionId}/query-history`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['query-history', connectionId] }),
  });
}
