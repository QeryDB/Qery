import type { ColumnInfo, IndexInfo, ForeignKeyInfo } from './schema';

export interface TableDetails {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
  row_count?: number;
  size_kb?: number;
}

export interface TablePreview {
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
  total_rows: number;
}
