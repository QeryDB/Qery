import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SchemaTree, SchemaResponse } from '../types/schema';
import { invalidateSchemaCompletionCache } from '@/components/editor/schema-completion';

/** Transform new backend response into SchemaTree with backward compat fields */
function transformSchemaResponse(raw: any): SchemaTree {
  // New format: { objects: { table: [...], view: [...] }, object_types: [...], cached_at }
  if (raw.objects && raw.object_types) {
    const resp = raw as SchemaResponse;
    return {
      tables: resp.objects['table'] || [],
      views: resp.objects['view'] || [],
      procedures: resp.objects['procedure'] || [],
      functions: resp.objects['function'] || [],
      cached_at: resp.cached_at,
      objects: resp.objects,
      object_types: resp.object_types,
    };
  }
  // Old format: { tables, views, procedures, functions, cached_at }
  return raw as SchemaTree;
}

export function useSchema(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['schema', connectionId, database],
    queryFn: async () => {
      const raw = await api.get<any>(`/connections/${connectionId}/databases/${database}/schema`);
      return transformSchemaResponse(raw);
    },
    enabled: !!connectionId && !!database,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

export function useRefreshSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, database }: { connectionId: string; database: string }) => {
      const raw = await api.post<any>(`/connections/${connectionId}/databases/${database}/schema/refresh`);
      return transformSchemaResponse(raw);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['schema', vars.connectionId, vars.database] });
      qc.invalidateQueries({ queryKey: ['table-details'] });
      qc.invalidateQueries({ queryKey: ['table-columns'] });
      qc.invalidateQueries({ queryKey: ['table-indexes'] });
      qc.invalidateQueries({ queryKey: ['table-fks'] });
      qc.invalidateQueries({ queryKey: ['table-referenced-by'] });
      qc.invalidateQueries({ queryKey: ['table-preview'] });
      qc.invalidateQueries({ queryKey: ['view-columns'] });
      qc.invalidateQueries({ queryKey: ['object-parameters'] });
      qc.invalidateQueries({ queryKey: ['object-dependencies'] });
      qc.invalidateQueries({ queryKey: ['object-used-by'] });
      qc.invalidateQueries({ queryKey: ['object-definition'] });
      qc.invalidateQueries({ queryKey: ['ghost-fks'] });
      invalidateSchemaCompletionCache();
    },
  });
}
