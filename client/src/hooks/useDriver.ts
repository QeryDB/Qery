import { useMemo } from 'react';
import { useConnectionStore } from '@/stores/connection-store';
import { useConnections } from '@/hooks/useConnection';
import { getDialect, type DialectConfig } from '@/lib/dialect';

/** Derive the active connection's database_type from the connections list */
export function useActiveDatabaseType(): string {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId);
  const { data: connections } = useConnections();

  if (!activeConnectionId || !connections) return 'mssql';
  const conn = connections.find((c) => c.id === activeConnectionId);
  return conn?.database_type || 'mssql';
}

/** Get the DialectConfig instance for the active connection */
export function useDialect(): DialectConfig {
  const dbType = useActiveDatabaseType();
  return useMemo(() => getDialect(dbType), [dbType]);
}
