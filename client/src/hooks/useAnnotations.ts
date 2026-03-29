import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Annotation } from '../types/schema';

export function useAnnotations(connectionId: string | null, database: string | null, table: string | null) {
  return useQuery({
    queryKey: ['annotations', connectionId, database, table],
    queryFn: () => api.get<Annotation[]>(`/connections/${connectionId}/databases/${database}/tables/${table}/annotations`),
    enabled: !!connectionId && !!database && !!table,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, table, body }: {
      connectionId: string;
      database: string;
      table: string;
      body: { column_name?: string | null; note: string };
    }) => api.put<Annotation>(`/connections/${connectionId}/databases/${database}/tables/${table}/annotations`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annotations'] });
    },
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database, annotId }: {
      connectionId: string;
      database: string;
      annotId: string;
    }) => api.delete(`/connections/${connectionId}/databases/${database}/annotations/${annotId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annotations'] });
    },
  });
}
