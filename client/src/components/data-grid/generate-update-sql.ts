// Re-export DialectConfig as SqlBuilder for backward compatibility
export { DialectConfig as SqlBuilder, getDialect } from '@/lib/dialect';
export type { PendingEdit } from './types';

// Backward compat function exports — delegate to DialectConfig
import { getDialect } from '@/lib/dialect';
import type { PendingEdit } from './types';

export function generateUpdateStatements(
  tableName: string, schemaName: string, primaryKeys: string[],
  edits: Map<string, PendingEdit>, rows: Record<string, any>[],
  dialect: string = 'mssql', columnTypes?: Record<string, string>,
): string[] {
  return getDialect(dialect).generateUpdates(tableName, schemaName, primaryKeys, edits, rows, columnTypes);
}

export function generateInsertStatements(
  tableName: string, schemaName: string,
  newRows: Record<string, any>[],
  dialect: string = 'mssql', columnTypes?: Record<string, string>,
): string[] {
  return getDialect(dialect).generateInserts(tableName, schemaName, newRows, columnTypes);
}
