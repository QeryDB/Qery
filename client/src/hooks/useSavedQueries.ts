import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SavedQuery } from '../types/query';

interface CreateSavedQueryInput {
  connection_id?: string;
  title: string;
  description?: string;
  sql_text: string;
  tags?: string;
  project_name?: string;
  folder_name?: string;
}

export function useSavedQueries(connectionId?: string | null) {
  const params = connectionId ? `?connection_id=${connectionId}` : '';
  return useQuery({
    queryKey: ['saved-queries', connectionId ?? 'all'],
    queryFn: () => api.get<SavedQuery[]>(`/saved-queries${params}`),
  });
}

export function useCreateSavedQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSavedQueryInput) => api.post<SavedQuery>('/saved-queries', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-queries'] }),
  });
}

export function useUpdateSavedQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateSavedQueryInput> & { id: string }) =>
      api.put<SavedQuery>(`/saved-queries/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-queries'] }),
  });
}

export function useDeleteSavedQuery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/saved-queries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-queries'] }),
  });
}
