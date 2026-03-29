// SQLite introspection SQL via sqlite_master + PRAGMAs.
// Returns same field names as MSSQL/PG for frontend compatibility.

pub const LIST_TABLES_SQL: &str = "
  SELECT
    name,
    'main' AS schema,
    NULL AS row_count,
    NULL AS size_kb,
    NULL AS created_at,
    NULL AS modified_at
  FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
";

pub const LIST_VIEWS_SQL: &str = "
  SELECT
    name,
    'main' AS schema,
    sql AS definition
  FROM sqlite_master
  WHERE type = 'view'
  ORDER BY name
";

/// Columns via PRAGMA — returns fields matching MSSQL/PG column format.
/// PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
pub fn get_columns_pragma(table: &str) -> String {
    format!("PRAGMA table_info('{}')", table.replace('\'', "''"))
}

/// Indexes via PRAGMA
pub fn get_indexes_pragma(table: &str) -> String {
    format!("PRAGMA index_list('{}')", table.replace('\'', "''"))
}

/// Index columns via PRAGMA
pub fn get_index_info_pragma(index: &str) -> String {
    format!("PRAGMA index_info('{}')", index.replace('\'', "''"))
}

/// Foreign keys via PRAGMA
pub fn get_foreign_keys_pragma(table: &str) -> String {
    format!("PRAGMA foreign_key_list('{}')", table.replace('\'', "''"))
}

/// Object definition from sqlite_master
pub fn get_definition_sql(name: &str) -> String {
    format!(
        "SELECT sql AS definition FROM sqlite_master WHERE name = '{}'",
        name.replace('\'', "''")
    )
}

/// Table preview
pub fn get_preview_sql(table: &str, limit: i64, offset: i64) -> String {
    format!(
        "SELECT * FROM \"{}\" LIMIT {} OFFSET {}",
        table.replace('"', "\"\""), limit, offset
    )
}

pub const LIST_TRIGGERS_SQL: &str = "
  SELECT
    name,
    'main' AS schema,
    tbl_name AS table_name,
    sql AS definition
  FROM sqlite_master
  WHERE type = 'trigger'
  ORDER BY tbl_name, name
";

/// Count rows
pub fn get_count_sql(table: &str) -> String {
    format!(
        "SELECT COUNT(*) AS total FROM \"{}\"",
        table.replace('"', "\"\"")
    )
}
