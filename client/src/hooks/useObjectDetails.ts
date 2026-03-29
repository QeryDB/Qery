import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ObjectColumn, ObjectDependency, ObjectParameter } from '../types/schema';

export interface SafetyAnalysis {
  is_readonly: boolean;
  mutations: { object: string; schema: string; pattern: string; depth: number }[];
}

export function useViewColumns(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['view-columns', connectionId, database, name, schema],
    queryFn: () => api.get<ObjectColumn[]>(`/connections/${connectionId}/databases/${database}/views/${name}/columns?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    staleTime: Infinity,
  });
}

export function useDependencies(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['object-dependencies', connectionId, database, name, schema],
    queryFn: () => api.get<ObjectDependency[]>(`/connections/${connectionId}/databases/${database}/objects/${name}/dependencies?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    staleTime: Infinity,
  });
}

export function useUsedBy(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['object-used-by', connectionId, database, name, schema],
    queryFn: () => api.get<ObjectDependency[]>(`/connections/${connectionId}/databases/${database}/objects/${name}/used-by?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    staleTime: Infinity,
  });
}

export function useSafetyAnalysis(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['object-safety', connectionId, database, name, schema],
    queryFn: () => api.get<SafetyAnalysis>(`/connections/${connectionId}/databases/${database}/objects/${name}/analyze-safety?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    staleTime: Infinity,
  });
}

export function useParameters(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo') {
  return useQuery({
    queryKey: ['object-parameters', connectionId, database, name, schema],
    queryFn: () => api.get<ObjectParameter[]>(`/connections/${connectionId}/databases/${database}/objects/${name}/parameters?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    staleTime: Infinity,
  });
}

// Fetch definition on-demand
export function useDefinition(connectionId: string | null, database: string | null, name: string | null, schema = 'dbo', _existingDefinition?: string) {
  return useQuery({
    queryKey: ['object-definition', connectionId, database, name, schema],
    queryFn: () => api.get<{ definition: string | null }>(`/connections/${connectionId}/databases/${database}/objects/${name}/definition?schema=${schema}`),
    enabled: !!connectionId && !!database && !!name,
    select: (data) => data.definition,
    staleTime: Infinity,
  });
}
