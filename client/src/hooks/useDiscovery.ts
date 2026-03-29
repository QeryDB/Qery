import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface DiscoveredServer {
  id: string;
  displayName: string;
  hostname: string;
  originalHostname: string;
  ip: string;
  port: number;
  instance?: string;
  version?: string;
  verificationLevel: string;
  responseTime?: number;
  databases: string[];
  priority: number;
  error?: string;
}

export interface DiscoveryResult {
  success: boolean;
  level: string | null;
  servers: DiscoveredServer[];
  scanTime: number;
  message: string;
  autoSelected: boolean;
  selectedServer: DiscoveredServer | null;
  recommendedDatabase: string | null;
}

export interface DatabaseInfo {
  name: string;
  displayName: string;
}

export interface DatabasesResult {
  success: boolean;
  databases: DatabaseInfo[];
  total: number;
  message: string;
}

export function useProgressiveDiscovery() {
  return useMutation({
    mutationFn: (params: {
      auth?: 'integrated' | 'sql';
      username?: string;
      password?: string;
      maxLevel?: 'quick' | 'smart' | 'full';
      filterAll?: boolean;
      progressive?: boolean;
    }) => api.post<DiscoveryResult>('/discovery/progressive', params),
  });
}

export function useFullDiscovery() {
  return useMutation({
    mutationFn: (params?: {
      auth?: 'integrated' | 'sql';
      username?: string;
      password?: string;
      timeout_ms?: number;
    }) => api.post('/discovery/full', params || {}),
  });
}

export function useDiscoverDatabases() {
  return useMutation({
    mutationFn: (params: {
      connection_id?: string;
      server?: string;
      port?: number;
      database_type?: string;
      auth?: 'integrated' | 'sql';
      username?: string;
      password?: string;
      filterAll?: boolean;
    }) => api.post<DatabasesResult>('/discovery/databases', params),
  });
}

export function useManualDiscovery() {
  return useMutation({
    mutationFn: (params: {
      server: string;
      port?: number;
      auth?: 'integrated' | 'sql';
      username?: string;
      password?: string;
    }) => api.post<DiscoveryResult>('/discovery/manual', params),
  });
}
