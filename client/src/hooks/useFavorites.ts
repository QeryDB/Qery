import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface FavoriteRow {
  id: string;
  connection_id: string;
  database_name: string;
  schema_name: string;
  table_name: string;
  created_at: string;
}

export function useFavorites(connectionId: string | null, database: string | null) {
  return useQuery({
    queryKey: ['favorites', connectionId, database],
    queryFn: async () => {
      const rows = await api.get<FavoriteRow[]>(`/connections/${connectionId}/databases/${database}/favorites`);
      return rows.map((r) => `${r.schema_name}.${r.table_name}`);
    },
    enabled: !!connectionId && !!database,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, database, schema, table, isFavorite }: {
      connectionId: string;
      database: string;
      schema: string;
      table: string;
      isFavorite: boolean;
    }) => {
      if (isFavorite) {
        return api.delete(`/connections/${connectionId}/databases/${database}/favorites/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`);
      } else {
        return api.post(`/connections/${connectionId}/databases/${database}/favorites`, { schema, table });
      }
    },
    onMutate: async ({ connectionId, database, schema, table, isFavorite }) => {
      const key = ['favorites', connectionId, database];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<string[]>(key);
      const favoriteKey = `${schema}.${table}`;
      qc.setQueryData<string[]>(key, (old = []) =>
        isFavorite ? old.filter((k) => k !== favoriteKey) : [...old, favoriteKey]
      );
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, { connectionId, database }) => {
      qc.invalidateQueries({ queryKey: ['favorites', connectionId, database] });
    },
  });
}
