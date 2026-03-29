import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Connection, CreateConnectionInput, TestConnectionInput, TestConnectionResult } from '../types/connection';

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get<Connection[]>('/connections'),
    staleTime: Infinity,
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectionInput) => api.post<Connection>('/connections', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CreateConnectionInput & { id: string }) =>
      api.put<Connection>(`/connections/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useReorderConnections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.put('/connections/reorder', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (input: TestConnectionInput) => api.post<TestConnectionResult>('/connections/test', input),
  });
}

export function useDiscoverServers() {
  return useMutation({
    mutationFn: () => api.post('/connections/discover'),
  });
}

export interface ConnectionParamInfo {
  key: string;
  label: string;
  param_type: { type: string; options?: { value: string; label: string }[] };
  required: boolean;
  default_value: string | null;
  group: string;
  placeholder: string | null;
  order: number;
}

export interface DriverInfo {
  type: string;
  name: string;
  dialect: string;
  default_port: number;
  default_schema: string;
  default_database: string;
  capabilities: Record<string, any>;
  connection_params: ConnectionParamInfo[];
  object_types: import('../types/schema').ObjectTypeDescriptor[];
}

export function useAvailableDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => api.get<DriverInfo[]>('/drivers'),
    staleTime: Infinity,
  });
}

export function useDatabases(connectionId: string | null) {
  return useQuery({
    queryKey: ['databases', connectionId],
    queryFn: () => api.get<string[]>(`/connections/${connectionId}/databases`),
    enabled: !!connectionId,
  });
}
