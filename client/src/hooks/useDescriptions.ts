import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ParsedDescription {
  id: number;
  connection_id: string;
  database_name: string;
  schema_name: string;
  object_name: string;
  object_type: string;
  column_alias: string;
  source_expression: string | null;
  source_column_clean: string | null;
  parsed_description: string | null;
  confirmed_description: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  flags: string;
  created_at: string;
  updated_at: string;
}

export interface DescriptionStats {
  total: number;
  confirmed: number;
  pending: number;
  dismissed: number;
  no_description: number;
  has_msg_alias: number;
}

export function useDescriptions(
  connectionId: string | null,
  database: string | null,
  filters?: { status?: string; search?: string; object?: string }
) {
  return useQuery({
    queryKey: ['descriptions', connectionId, database, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.search) params.set('search', filters.search);
      if (filters?.object) params.set('object', filters.object);
      const qs = params.toString();
      return api.get<ParsedDescription[]>(
        `/connections/${connectionId}/databases/${database}/descriptions${qs ? `?${qs}` : ''}`
      );
    },
    enabled: !!connectionId && !!database,
  });
}

export function useDescriptionStats(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['description-stats', connectionId, database],
    queryFn: () =>
      api.get<DescriptionStats>(`/connections/${connectionId}/databases/${database}/descriptions/stats`),
    enabled: !!connectionId && !!database,
  });
}

export function useDescriptionObjects(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['description-objects', connectionId, database],
    queryFn: () =>
      api.get<{ object_name: string; object_type: string }[]>(
        `/connections/${connectionId}/databases/${database}/descriptions/objects`
      ),
    enabled: !!connectionId && !!database,
  });
}

export function useParseDescriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connectionId, database }: { connectionId: string; database: string }) =>
      api.post<{ inserted: number; preserved: number }>(
        `/connections/${connectionId}/databases/${database}/descriptions/parse`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descriptions'] });
      qc.invalidateQueries({ queryKey: ['description-stats'] });
      qc.invalidateQueries({ queryKey: ['description-objects'] });
    },
  });
}

export function useUpdateDescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId, database, descId, status, confirmed_description,
    }: {
      connectionId: string;
      database: string;
      descId: number;
      status: string;
      confirmed_description?: string;
    }) =>
      api.put(`/connections/${connectionId}/databases/${database}/descriptions/${descId}`, {
        status,
        confirmed_description,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descriptions'] });
      qc.invalidateQueries({ queryKey: ['description-stats'] });
    },
  });
}

export function useBulkUpdateDescriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId, database, ids, status,
    }: {
      connectionId: string;
      database: string;
      ids: number[];
      status: string;
    }) =>
      api.put(`/connections/${connectionId}/databases/${database}/descriptions`, { ids, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descriptions'] });
      qc.invalidateQueries({ queryKey: ['description-stats'] });
    },
  });
}
