// === Driver Metadata Types (from backend) ===

export interface TabDescriptor {
  key: string;
  label: string;
  data_key: string;
  renderer: string;
}

export interface ContextActionDescriptor {
  key: string;
  label: string;
  confirm: boolean;
  destructive: boolean;
}

export interface ObjectTypeDescriptor {
  key: string;
  label: string;
  label_singular: string;
  icon: string;
  color: string;
  order: number;
  has_schema: boolean;
  tabs: TabDescriptor[];
  context_actions: ContextActionDescriptor[];
}

// === Schema Response (new generic format) ===

export interface SchemaResponse {
  objects: Record<string, any[]>;
  object_types: ObjectTypeDescriptor[];
  cached_at?: string;
}

// === Legacy SchemaTree (computed from SchemaResponse for backward compat) ===

export interface SchemaTree {
  tables: TableInfo[];
  views: ViewInfo[];
  procedures: ProcedureInfo[];
  functions: FunctionInfo[];
  cached_at?: string;
  // New fields
  objects?: Record<string, any[]>;
  object_types?: ObjectTypeDescriptor[];
}

export interface ColumnSummary {
  name: string;
  data_type: string;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  is_identity: boolean;
  ordinal_position: number;
  fk_table?: string;
  fk_column?: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  row_count?: number;
  size_kb?: number;
  created_at?: string;
  modified_at?: string;
  columns?: ColumnSummary[];
}

export interface ViewInfo {
  name: string;
  schema: string;
  definition?: string;
  columns?: ColumnSummary[];
}

export interface ProcedureInfo {
  name: string;
  schema: string;
  definition?: string;
  created_at?: string;
  modified_at?: string;
}

export interface FunctionInfo {
  name: string;
  schema: string;
  type: string;
  definition?: string;
  created_at?: string;
  modified_at?: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  is_identity: boolean;
  default_value: string | null;
  ordinal_position: number;
}

export interface IndexInfo {
  name: string;
  type: string;
  is_unique: boolean;
  is_primary_key: boolean;
  columns: string[];
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referenced_table: string;
  referenced_column: string;
  referenced_schema: string;
  on_delete: string;
  on_update: string;
}

export interface ReferencedByInfo {
  name: string;
  column: string;
  referencing_table: string;
  referencing_schema: string;
  referenced_column: string;
  on_delete: string;
  on_update: string;
}

export interface ObjectColumn {
  name: string;
  data_type: string;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  is_nullable: boolean;
  ordinal_position: number;
}

export interface ObjectParameter {
  name: string;
  data_type: string;
  max_length: number | null;
  precision: number | null;
  scale: number | null;
  is_output: boolean;
  has_default_value: boolean;
  default_value: string | null;
  ordinal_position: number;
}

export interface ObjectDependency {
  name: string;
  schema: string;
  type: string | null;
}

export interface Annotation {
  id: string;
  connection_id: string;
  database_name: string;
  table_name: string;
  column_name: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface GhostFKInfo {
  id: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  match_type: 'exact' | 'suffix';
  confidence: number;
  is_dismissed: boolean;
  source: 'auto' | 'manual';
  description?: string;
}

export interface GhostFKResponse {
  ghost_fks: GhostFKInfo[];
  manual_fks: GhostFKInfo[];
  dismissed_count: number;
}
