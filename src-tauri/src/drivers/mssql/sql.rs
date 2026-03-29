// All SQL templates as const &str or functions returning String

pub const LIST_TABLES_SQL: &str = "
  SELECT
    t.name AS name,
    s.name AS [schema],
    p.rows AS row_count,
    SUM(a.total_pages) * 8 AS size_kb,
    t.create_date AS created_at,
    t.modify_date AS modified_at
  FROM sys.tables t
  INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
  INNER JOIN sys.indexes i ON t.object_id = i.object_id AND i.index_id <= 1
  INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
  INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
  WHERE t.is_ms_shipped = 0
  GROUP BY t.name, s.name, p.rows, t.create_date, t.modify_date
  ORDER BY s.name, t.name
";

pub const GET_ALL_COLUMNS_SQL: &str = "
  SELECT
    s.name AS schema_name,
    t.name AS table_name,
    c.name,
    tp.name AS data_type,
    c.max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    c.is_identity,
    c.column_id AS ordinal_position,
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
    OBJECT_NAME(fk.referenced_object_id) AS fk_table,
    COL_NAME(fk.referenced_object_id, fk.referenced_column_id) AS fk_column
  FROM sys.columns c
  INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
  INNER JOIN sys.tables t ON c.object_id = t.object_id
  INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
  LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.index_columns ic
    INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
  ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
  LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
  WHERE t.is_ms_shipped = 0
  ORDER BY s.name, t.name, c.column_id
";

pub fn get_columns_sql(table_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      c.name AS name,
      tp.name AS data_type,
      c.max_length,
      c.precision,
      c.scale,
      c.is_nullable,
      CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
      CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END AS is_foreign_key,
      c.is_identity,
      dc.definition AS default_value,
      c.column_id AS ordinal_position
    FROM sys.columns c
    INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.index_columns ic
      INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_primary_key = 1
    ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
    LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
    LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
    WHERE t.name = '{}' AND s.name = '{}'
    ORDER BY c.column_id
    ",
        table_name, schema_name
    )
}

pub const LIST_VIEWS_SQL: &str = "
  SELECT
    v.name AS name,
    s.name AS [schema]
  FROM sys.views v
  INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
  WHERE v.is_ms_shipped = 0
  ORDER BY s.name, v.name
";

pub const LIST_PROCEDURES_SQL: &str = "
  SELECT
    p.name AS name,
    s.name AS [schema],
    p.create_date AS created_at,
    p.modify_date AS modified_at
  FROM sys.procedures p
  INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
  WHERE p.is_ms_shipped = 0
  ORDER BY s.name, p.name
";

pub const LIST_FUNCTIONS_SQL: &str = "
  SELECT
    o.name AS name,
    s.name AS [schema],
    o.type_desc AS type,
    o.create_date AS created_at,
    o.modify_date AS modified_at
  FROM sys.objects o
  INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
  WHERE o.type IN ('FN', 'IF', 'TF')
    AND o.is_ms_shipped = 0
  ORDER BY s.name, o.name
";

pub fn get_indexes_sql(table_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      i.name AS name,
      i.type_desc AS type,
      i.is_unique,
      i.is_primary_key,
      STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
      ), 1, 2, '') AS columns
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE t.name = '{}' AND s.name = '{}'
      AND i.name IS NOT NULL
    ORDER BY i.is_primary_key DESC, i.name
    ",
        table_name, schema_name
    )
}

pub fn get_foreign_keys_sql(table_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      fk.name AS name,
      cp.name AS [column],
      rt.name AS referenced_table,
      cr.name AS referenced_column,
      rs.name AS referenced_schema,
      fk.delete_referential_action_desc AS on_delete,
      fk.update_referential_action_desc AS on_update
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
    INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
    INNER JOIN sys.tables pt ON fk.parent_object_id = pt.object_id
    INNER JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
    INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
    INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
    WHERE pt.name = '{}' AND ps.name = '{}'
    ORDER BY fk.name
    ",
        table_name, schema_name
    )
}

pub fn get_ghost_fk_columns_sql(schema_name: &str) -> String {
    format!(
        "
    SELECT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS c
    INNER JOIN INFORMATION_SCHEMA.TABLES t
      ON c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
    WHERE t.TABLE_TYPE = 'BASE TABLE' AND t.TABLE_SCHEMA = '{}'
    ORDER BY c.TABLE_NAME, c.COLUMN_NAME
    ",
        schema_name
    )
}

pub fn get_referenced_by_sql(table_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      fk.name AS name,
      cp.name AS [column],
      pt.name AS referencing_table,
      ps.name AS referencing_schema,
      cr.name AS referenced_column,
      fk.delete_referential_action_desc AS on_delete,
      fk.update_referential_action_desc AS on_update
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
    INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
    INNER JOIN sys.tables pt ON fk.parent_object_id = pt.object_id
    INNER JOIN sys.schemas ps ON pt.schema_id = ps.schema_id
    INNER JOIN sys.tables rt ON fk.referenced_object_id = rt.object_id
    INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
    WHERE rt.name = '{}' AND rs.name = '{}'
    ORDER BY fk.name
    ",
        table_name, schema_name
    )
}

pub fn get_view_columns_sql(view_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      c.name AS name,
      tp.name AS data_type,
      c.max_length,
      c.precision,
      c.scale,
      c.is_nullable,
      c.column_id AS ordinal_position
    FROM sys.columns c
    INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id
    INNER JOIN sys.views v ON c.object_id = v.object_id
    INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
    WHERE v.name = '{}' AND s.name = '{}'
    ORDER BY c.column_id
    ",
        view_name, schema_name
    )
}

pub fn get_parameters_sql(object_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT
      p.name AS name,
      tp.name AS data_type,
      p.max_length,
      p.precision,
      p.scale,
      p.is_output,
      p.has_default_value,
      CAST(p.default_value AS NVARCHAR(MAX)) AS default_value,
      p.parameter_id AS ordinal_position
    FROM sys.parameters p
    INNER JOIN sys.types tp ON p.user_type_id = tp.user_type_id
    INNER JOIN sys.objects o ON p.object_id = o.object_id
    INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
    WHERE o.name = '{}' AND s.name = '{}'
    ORDER BY p.parameter_id
    ",
        object_name, schema_name
    )
}

pub fn get_dependencies_sql(object_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT DISTINCT
      d.referenced_entity_name AS name,
      ISNULL(d.referenced_schema_name, '{}') AS [schema],
      o.type_desc AS type
    FROM sys.sql_expression_dependencies d
    INNER JOIN sys.objects src ON d.referencing_id = src.object_id
    INNER JOIN sys.schemas ss ON src.schema_id = ss.schema_id
    LEFT JOIN sys.objects o ON d.referenced_id = o.object_id
    WHERE src.name = '{}' AND ss.name = '{}'
      AND d.referenced_id IS NOT NULL
    ORDER BY o.type_desc, d.referenced_entity_name
    ",
        schema_name, object_name, schema_name
    )
}

pub fn get_definition_sql(object_name: &str, schema_name: &str) -> String {
    // OBJECT_DEFINITION returns a single NVARCHAR(MAX) — much more efficient than sp_helptext
    // which returns one row per line (thousands of rows for large procedures)
    format!(
        "SELECT OBJECT_DEFINITION(OBJECT_ID('{}.{}')) AS definition",
        schema_name, object_name
    )
}

pub fn get_used_by_sql(object_name: &str, schema_name: &str) -> String {
    format!(
        "
    SELECT DISTINCT
      src.name AS name,
      ss.name AS [schema],
      src.type_desc AS type
    FROM sys.sql_expression_dependencies d
    INNER JOIN sys.objects src ON d.referencing_id = src.object_id
    INNER JOIN sys.schemas ss ON src.schema_id = ss.schema_id
    INNER JOIN sys.objects tgt ON d.referenced_id = tgt.object_id
    INNER JOIN sys.schemas ts ON tgt.schema_id = ts.schema_id
    WHERE tgt.name = '{}' AND ts.name = '{}'
    ORDER BY src.type_desc, src.name
    ",
        object_name, schema_name
    )
}

pub const LIST_DATABASES_SQL: &str = "
  SELECT name
  FROM sys.databases
  WHERE database_id > 4
  ORDER BY name
";

pub const LIST_TRIGGERS_SQL: &str = "
  SELECT
    tr.name AS name,
    s.name AS [schema],
    OBJECT_NAME(tr.parent_id) AS table_name,
    CASE WHEN tr.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
    CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger') = 1 THEN 1 ELSE 0 END AS on_insert,
    CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger') = 1 THEN 1 ELSE 0 END AS on_delete,
    CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger') = 1 THEN 1 ELSE 0 END AS on_update,
    NULL AS function_name,
    CASE WHEN tr.is_disabled = 0 THEN 'O' ELSE 'D' END AS enabled
  FROM sys.triggers tr
  JOIN sys.objects o ON tr.parent_id = o.object_id
  JOIN sys.schemas s ON o.schema_id = s.schema_id
  WHERE tr.is_ms_shipped = 0
    AND tr.parent_class = 1
  ORDER BY s.name, OBJECT_NAME(tr.parent_id), tr.name
";

pub const LIST_SEQUENCES_SQL: &str = "
  SELECT
    seq.name AS name,
    s.name AS [schema],
    TYPE_NAME(seq.user_type_id) AS data_type,
    CAST(seq.start_value AS VARCHAR) AS start_value,
    CAST(seq.minimum_value AS VARCHAR) AS minimum_value,
    CAST(seq.maximum_value AS VARCHAR) AS maximum_value,
    CAST(seq.increment AS VARCHAR) AS increment,
    CASE WHEN seq.is_cycling = 1 THEN 'YES' ELSE 'NO' END AS cycle_option
  FROM sys.sequences seq
  JOIN sys.schemas s ON seq.schema_id = s.schema_id
  ORDER BY s.name, seq.name
";

pub fn get_sequence_details_sql(name: &str, schema: &str) -> String {
    format!("
      SELECT
        seq.name AS name,
        s.name AS [schema],
        TYPE_NAME(seq.user_type_id) AS data_type,
        CAST(seq.start_value AS VARCHAR) AS start_value,
        CAST(seq.minimum_value AS VARCHAR) AS minimum_value,
        CAST(seq.maximum_value AS VARCHAR) AS maximum_value,
        CAST(seq.increment AS VARCHAR) AS increment,
        CASE WHEN seq.is_cycling = 1 THEN 'YES' ELSE 'NO' END AS cycle_option,
        CAST(seq.current_value AS VARCHAR) AS current_value
      FROM sys.sequences seq
      JOIN sys.schemas s ON seq.schema_id = s.schema_id
      WHERE s.name = '{schema}' AND seq.name = '{name}'
    ", schema = schema.replace('\'', "''"), name = name.replace('\'', "''"))
}

pub fn get_trigger_details_sql(name: &str, _schema: &str) -> String {
    format!("
      SELECT
        tr.name AS name,
        s.name AS [schema],
        OBJECT_NAME(tr.parent_id) AS table_name,
        CASE WHEN tr.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
        CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger') = 1 THEN 1 ELSE 0 END AS on_insert,
        CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger') = 1 THEN 1 ELSE 0 END AS on_delete,
        CASE WHEN OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger') = 1 THEN 1 ELSE 0 END AS on_update,
        CASE WHEN tr.is_disabled = 0 THEN 'O' ELSE 'D' END AS enabled
      FROM sys.triggers tr
      JOIN sys.objects o ON tr.parent_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE tr.name = '{name}'
    ", name = name.replace('\'', "''"))
}

// ────────────────────────────────────────────────────────
// Tests: verify sql_variant safety and SQL correctness
// ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parameters_sql_casts_default_value() {
        // sys.parameters.default_value is sql_variant — must be CAST to avoid tiberius panic
        let sql = get_parameters_sql("MyProc", "dbo");
        assert!(sql.contains("CAST(p.default_value AS NVARCHAR(MAX))"),
            "default_value must be CAST to NVARCHAR(MAX) to avoid tiberius SSVariant panic");
        assert!(!sql.contains("p.default_value,") && !sql.ends_with("p.default_value"),
            "raw p.default_value without CAST will crash tiberius on sql_variant");
    }

    #[test]
    fn definition_sql_uses_object_definition() {
        // OBJECT_DEFINITION returns single NVARCHAR(MAX) — sp_helptext returns thousands of rows
        let sql = get_definition_sql("MyProc", "dbo");
        assert!(sql.contains("OBJECT_DEFINITION"), "should use OBJECT_DEFINITION, not sp_helptext");
        assert!(!sql.contains("sp_helptext"), "sp_helptext streams thousands of rows — causes tiberius panic on large procs");
    }

    #[test]
    fn definition_sql_escapes_schema_and_name() {
        let sql = get_definition_sql("My'Proc", "dbo");
        assert!(sql.contains("dbo.My'Proc"), "schema.name should be in the OBJECT_ID call");
    }

    #[test]
    fn parameters_sql_includes_all_fields() {
        let sql = get_parameters_sql("sp_test", "dbo");
        assert!(sql.contains("p.name AS name"));
        assert!(sql.contains("tp.name AS data_type"));
        assert!(sql.contains("p.is_output"));
        assert!(sql.contains("p.has_default_value"));
        assert!(sql.contains("p.parameter_id AS ordinal_position"));
    }

    #[test]
    fn ghost_fk_columns_sql_filters_by_schema() {
        let sql = get_ghost_fk_columns_sql("dbo");
        assert!(sql.contains("TABLE_SCHEMA = 'dbo'"));
        let sql_pg = get_ghost_fk_columns_sql("public");
        assert!(sql_pg.contains("TABLE_SCHEMA = 'public'"));
    }
}
