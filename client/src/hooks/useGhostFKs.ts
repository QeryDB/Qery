import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { GhostFKResponse } from '../types/schema';

export interface ManualRelationshipRow {
  id: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  description: string | null;
}

export interface RelationshipOverrides {
  manual: ManualRelationshipRow[];
  dismissed: string[]; // dismissed ghost FK keys ("from|col|to|col")
}

/** Fetch all manual relationships + dismissed keys for a database */
export function useRelationshipOverrides(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['relationship-overrides', connectionId, database],
    queryFn: () => api.get<RelationshipOverrides>(`/connections/${connectionId}/databases/${database}/relationships`),
    enabled: !!connectionId && !!database,
    staleTime: Infinity,
  });
}

export function useGhostFKs(connectionId: string | null, database: string | null, table: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['ghost-fks', connectionId, database, table, schema],
    queryFn: () => api.get<GhostFKResponse>(`/connections/${connectionId}/databases/${database}/tables/${table}/ghost-fks?schema=${schema}`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: Infinity,
  });
}

export function useAddRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, body }: {
      connectionId: string;
      database: string;
      body: { from_table: string; from_column: string; to_table: string; to_column: string; description?: string };
    }) => api.post(`/connections/${connectionId}/databases/${database}/relationships`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ghost-fks'] });
      qc.invalidateQueries({ queryKey: ['relationship-overrides'] });
    },
  });
}

export function useDismissRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, body }: {
      connectionId: string;
      database: string;
      body: { from_table: string; from_column: string; to_table: string; to_column: string };
    }) => api.post(`/connections/${connectionId}/databases/${database}/relationships/dismiss`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ghost-fks'] });
      qc.invalidateQueries({ queryKey: ['relationship-overrides'] });
    },
  });
}

export function useUndismissRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, relId }: {
      connectionId: string;
      database: string;
      relId: string;
    }) => api.post(`/connections/${connectionId}/databases/${database}/relationships/${relId}/undismiss`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ghost-fks'] });
      qc.invalidateQueries({ queryKey: ['relationship-overrides'] });
    },
  });
}

export function useDeleteRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, relId }: {
      connectionId: string;
      database: string;
      relId: string;
    }) => api.delete(`/connections/${connectionId}/databases/${database}/relationships/${relId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ghost-fks'] });
      qc.invalidateQueries({ queryKey: ['relationship-overrides'] });
    },
  });
}
