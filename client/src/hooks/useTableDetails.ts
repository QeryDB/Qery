import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TableDetails, TablePreview } from '../types/table';
import type { ColumnInfo, IndexInfo, ForeignKeyInfo, ReferencedByInfo } from '../types/schema';

export function useTableDetails(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['table-details', connectionId, database, table, schema],
    queryFn: () => api.get<TableDetails>(`/connections/${connectionId}/databases/${database}/tables/${table}?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useTableColumns(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['table-columns', connectionId, database, table, schema],
    queryFn: () => api.get<ColumnInfo[]>(`/connections/${connectionId}/databases/${database}/tables/${table}/columns?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useTableIndexes(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['table-indexes', connectionId, database, table, schema],
    queryFn: () => api.get<IndexInfo[]>(`/connections/${connectionId}/databases/${database}/tables/${table}/indexes?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useTableForeignKeys(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['table-fks', connectionId, database, table, schema],
    queryFn: () => api.get<ForeignKeyInfo[]>(`/connections/${connectionId}/databases/${database}/tables/${table}/foreign-keys?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useReferencedBy(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['table-referenced-by', connectionId, database, table, schema],
    queryFn: () => api.get<ReferencedByInfo[]>(`/connections/${connectionId}/databases/${database}/tables/${table}/referenced-by?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useTablePreview(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo', page = 0, pageSize = 100) {
  return useQuery({
    queryKey: ['table-preview', connectionId, database, table, schema, page, pageSize],
    queryFn: () => {
      const offset = page * pageSize;
      const params = new URLSearchParams({ schema, limit: String(pageSize), offset: String(offset) });
      return api.get<TablePreview>(`/connections/${connectionId}/databases/${database}/tables/${table}/preview?${params}`);
    },
    enabled: !!connectionId && !!database && !!table,
    placeholderData: (prev) => prev,
    staleTime: 10 * 60 * 1000,
  });
}
