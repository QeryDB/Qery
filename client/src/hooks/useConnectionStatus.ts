import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type ConnectionStatusType = 'connected' | 'disconnected' | 'checking' | 'unknown';

interface PingResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

interface ConnectionStatus {
  status: ConnectionStatusType;
  latency: number | null;
  lastChecked: string | null;
  error: string | null;
}

export function useConnectionStatus(connectionId: string | null): ConnectionStatus {
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['connection-status', connectionId],
    queryFn: () => api.get<PingResult>(`/connections/${connectionId}/ping`),
    enabled: !!connectionId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (!connectionId) return { status: 'unknown', latency: null, lastChecked: null, error: null };

  if (isFetching && !data) return { status: 'checking', latency: null, lastChecked: null, error: null };

  if (isError || data?.ok === false) {
    return {
      status: 'disconnected',
      latency: null,
      lastChecked: new Date().toISOString(),
      error: data?.error || (error as Error)?.message || 'Connection error',
    };
  }

  if (data?.ok) {
    return {
      status: 'connected',
      latency: data.latency_ms,
      lastChecked: new Date().toISOString(),
      error: null,
    };
  }

  return { status: 'unknown', latency: null, lastChecked: null, error: null };
}
