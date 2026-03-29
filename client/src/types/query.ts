export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, any>[];
  row_count: number;
  duration_ms: number;
  affected_rows?: number;
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryHistoryEntry {
  id: string;
  connection_id: string;
  database_name?: string;
  sql_text: string;
  executed_at: string;
  duration_ms?: number;
  row_count?: number;
  status: 'success' | 'error';
  error_message?: string;
}

export interface SavedQuery {
  id: string;
  connection_id?: string;
  title: string;
  description?: string;
  sql_text: string;
  tags?: string;
  project_name?: string;
  folder_name?: string;
  created_at: string;
  updated_at: string;
}
