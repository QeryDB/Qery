export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface FilterItem {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'is_null' | 'is_not_null';
  value?: string;
}

export interface PendingEdit {
  rowIndex: number;
  column: string;
  oldValue: any;
  newValue: any;
}

export interface DataGridConfig {
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
  totalRows: number;
  editable?: boolean;
  compact?: boolean;
  tableName?: string;
  primaryKeys?: string[];
  connectionId?: string;
  database?: string;
  onSort?: (sort: SortState | null) => void;
  onFilter?: (filters: FilterItem[]) => void;
}
