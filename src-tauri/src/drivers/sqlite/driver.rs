use async_trait::async_trait;
use serde_json::Value;

use crate::drivers::traits::{
    ConnConfig, ConnectionParam, ContextAction, DatabaseDriver,
    ObjectTypeDescriptor, ParamType, TabDescriptor, TabRenderer,
};
use super::query::{open_connection, execute_query_to_json};

pub struct SqliteDriver;

impl SqliteDriver {
    pub fn new() -> Self {
        Self
    }

    fn get_path(config: &ConnConfig) -> Result<String, String> {
        config.require("file_path").map(|s| s.to_string())
    }

    fn is_readonly(config: &ConnConfig) -> bool {
        config.get("readonly").map(|v| v == "true").unwrap_or(false)
    }

    /// Run a query against the SQLite file, wrapping blocking I/O in spawn_blocking.
    async fn run_sql(config: &ConnConfig, sql: &str) -> Result<Value, String> {
        let path = Self::get_path(config)?;
        let readonly = Self::is_readonly(config);
        let sql = sql.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = open_connection(&path, readonly)?;
            execute_query_to_json(&conn, &sql)
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
    }

    /// Run a PRAGMA command and transform the output to match expected field names.
    async fn run_pragma_columns(config: &ConnConfig, table: &str) -> Result<Value, String> {
        let path = Self::get_path(config)?;
        let readonly = Self::is_readonly(config);
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = open_connection(&path, readonly)?;
            let pragma_sql = super::sql::get_columns_pragma(&table);
            let raw = execute_query_to_json(&conn, &pragma_sql)?;

            // Transform PRAGMA table_info output to standard column format
            let columns: Vec<Value> = raw.as_array().unwrap_or(&vec![]).iter().map(|row| {
                serde_json::json!({
                    "name": row["name"],
                    "data_type": row["type"].as_str().unwrap_or("TEXT"),
                    "max_length": Value::Null,
                    "precision": Value::Null,
                    "scale": Value::Null,
                    "is_nullable": if row["notnull"].as_i64() == Some(1) { 0 } else { 1 },
                    "is_primary_key": if row["pk"].as_i64().unwrap_or(0) > 0 { 1 } else { 0 },
                    "is_foreign_key": 0,
                    "is_identity": 0,
                    "default_value": row["dflt_value"],
                    "ordinal_position": row["cid"].as_i64().unwrap_or(0) + 1,
                })
            }).collect();

            Ok(Value::Array(columns))
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
    }

    async fn run_pragma_indexes(config: &ConnConfig, table: &str) -> Result<Value, String> {
        let path = Self::get_path(config)?;
        let readonly = Self::is_readonly(config);
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = open_connection(&path, readonly)?;

            // Get index list
            let list_sql = super::sql::get_indexes_pragma(&table);
            let index_list = execute_query_to_json(&conn, &list_sql)?;

            let mut indexes: Vec<Value> = Vec::new();
            if let Some(list) = index_list.as_array() {
                for idx in list {
                    let idx_name = idx["name"].as_str().unwrap_or("");
                    let is_unique = idx["unique"].as_i64() == Some(1);

                    // Get columns for this index
                    let info_sql = super::sql::get_index_info_pragma(idx_name);
                    let cols = execute_query_to_json(&conn, &info_sql)?;

                    let col_names: Vec<String> = cols.as_array().unwrap_or(&vec![])
                        .iter()
                        .map(|c| c["name"].as_str().unwrap_or("").to_string())
                        .collect();

                    indexes.push(serde_json::json!({
                        "name": idx_name,
                        "type": "btree",
                        "is_unique": if is_unique { 1 } else { 0 },
                        "is_primary_key": 0,
                        "columns": col_names.join(", "),
                    }));
                }
            }

            Ok(Value::Array(indexes))
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
    }

    async fn run_pragma_foreign_keys(config: &ConnConfig, table: &str) -> Result<Value, String> {
        let path = Self::get_path(config)?;
        let readonly = Self::is_readonly(config);
        let table = table.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = open_connection(&path, readonly)?;
            let pragma_sql = super::sql::get_foreign_keys_pragma(&table);
            let raw = execute_query_to_json(&conn, &pragma_sql)?;

            let fks: Vec<Value> = raw.as_array().unwrap_or(&vec![]).iter().map(|row| {
                serde_json::json!({
                    "name": format!("fk_{}_{}", table, row["from"].as_str().unwrap_or("")),
                    "column": row["from"],
                    "referenced_table": row["table"],
                    "referenced_column": row["to"],
                    "referenced_schema": "main",
                    "on_delete": row["on_delete"].as_str().unwrap_or("NO ACTION"),
                    "on_update": row["on_update"].as_str().unwrap_or("NO ACTION"),
                })
            }).collect();

            Ok(Value::Array(fks))
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
    }
}

#[async_trait]
impl DatabaseDriver for SqliteDriver {
    // === Metadata ===

    fn name(&self) -> &str { "sqlite" }
    fn display_name(&self) -> &str { "SQLite" }
    fn dialect(&self) -> &str { "sqlite" }
    fn default_port(&self) -> u16 { 0 }
    fn default_schema(&self) -> &str { "main" }
    fn default_database(&self) -> &str { "" }

    fn connection_params(&self) -> Vec<ConnectionParam> {
        vec![
            ConnectionParam {
                key: "file_path".into(), label: "Database File".into(),
                param_type: ParamType::FilePath(vec!["db".into(), "sqlite".into(), "sqlite3".into()]),
                required: true, default_value: None,
                group: "connection".into(),
                placeholder: Some("Select or drop a .sqlite file".into()), order: 1,
            },
            ConnectionParam {
                key: "readonly".into(), label: "Read Only".into(),
                param_type: ParamType::Toggle, required: false,
                default_value: Some("false".into()),
                group: "connection".into(),
                placeholder: None, order: 2,
            },
        ]
    }

    fn object_types(&self) -> Vec<ObjectTypeDescriptor> {
        vec![
            ObjectTypeDescriptor {
                key: "table".into(), label: "Tables".into(),
                label_singular: "Table".into(), icon: "table2".into(),
                color: "#3b82f6".into(), order: 1, has_schema: false,
                tabs: vec![
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "indexes".into(), label: "Indexes".into(), data_key: "indexes".into(), renderer: TabRenderer::Indexes },
                    TabDescriptor { key: "foreign_keys".into(), label: "Foreign Keys".into(), data_key: "foreign_keys".into(), renderer: TabRenderer::ForeignKeys },
                    TabDescriptor { key: "data".into(), label: "Data".into(), data_key: "data".into(), renderer: TabRenderer::DataPreview },
                    TabDescriptor { key: "annotations".into(), label: "Notes".into(), data_key: "annotations".into(), renderer: TabRenderer::Annotations },
                ],
                context_actions: vec![
                    ContextAction { key: "select_top".into(), label: "SELECT LIMIT 100".into(), confirm: false, destructive: false },
                    ContextAction { key: "count".into(), label: "Count Rows".into(), confirm: false, destructive: false },
                    ContextAction { key: "inspect".into(), label: "Inspect Table".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "view".into(), label: "Views".into(),
                label_singular: "View".into(), icon: "eye".into(),
                color: "#a855f7".into(), order: 2, has_schema: false,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "execute".into(), label: "Results".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect View".into(), confirm: false, destructive: false },
                    ContextAction { key: "select_top".into(), label: "SELECT LIMIT 100".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "trigger".into(), label: "Triggers".into(),
                label_singular: "Trigger".into(), icon: "zap".into(),
                color: "#f59e0b".into(), order: 3, has_schema: false,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                ],
                context_actions: vec![],
            },
        ]
    }

    fn capabilities(&self) -> Value {
        serde_json::json!({
            "supports_schemas": false,
            "supports_execution_plan": true,
            "supports_procedures": false,
            "supports_functions": false,
            "supports_discovery": false,
            "supports_multiple_databases": false,
            "supports_windows_auth": false,
            "plan_format": "text",
        })
    }

    fn health(&self) -> Result<Value, String> {
        Ok(serde_json::json!({"status": "ok"}))
    }

    // === Connection ===

    async fn test_connection(&self, config: &ConnConfig) -> Result<Value, String> {
        let result = Self::run_sql(config, "SELECT sqlite_version() AS version").await?;
        let version = result.as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row.get("version"))
            .and_then(|v| v.as_str())
            .map(|s| format!("SQLite {}", s))
            .unwrap_or_else(|| "SQLite".to_string());
        Ok(serde_json::json!({ "version": version }))
    }

    async fn list_databases(&self, config: &ConnConfig) -> Result<Value, String> {
        // SQLite has no databases — the file IS the database
        let path = Self::get_path(config)?;
        let name = std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&path)
            .to_string();
        Ok(Value::Array(vec![Value::String(name)]))
    }

    // === Query Execution ===

    async fn run_query(&self, config: &ConnConfig, sql: &str, _params: Option<Value>) -> Result<Value, String> {
        Self::run_sql(config, sql).await
    }

    async fn get_query_plan(&self, config: &ConnConfig, sql: &str) -> Result<Value, String> {
        let explain_sql = format!("EXPLAIN QUERY PLAN {}", sql);
        Self::run_sql(config, &explain_sql).await
    }

    // === Schema ===

    async fn get_all_columns(&self, config: &ConnConfig) -> Result<Value, String> {
        let path = Self::get_path(config)?;
        let readonly = Self::is_readonly(config);

        tokio::task::spawn_blocking(move || {
            let conn = open_connection(&path, readonly)?;

            // Get all table names
            let tables = execute_query_to_json(&conn, super::sql::LIST_TABLES_SQL)?;
            let mut all_columns: Vec<Value> = Vec::new();

            if let Some(table_arr) = tables.as_array() {
                for table in table_arr {
                    let table_name = table["name"].as_str().unwrap_or("");

                    // Build FK lookup: column_name → (referenced_table, referenced_column)
                    let mut fk_map: std::collections::HashMap<String, (String, String)> = std::collections::HashMap::new();
                    let fk_sql = format!("PRAGMA foreign_key_list(\"{}\")", table_name.replace('"', "\"\""));
                    if let Ok(fks) = execute_query_to_json(&conn, &fk_sql) {
                        if let Some(fk_arr) = fks.as_array() {
                            for fk in fk_arr {
                                if let (Some(from_col), Some(to_table), Some(to_col)) = (
                                    fk["from"].as_str(),
                                    fk["table"].as_str(),
                                    fk["to"].as_str(),
                                ) {
                                    fk_map.insert(from_col.to_string(), (to_table.to_string(), to_col.to_string()));
                                }
                            }
                        }
                    }

                    let pragma_sql = super::sql::get_columns_pragma(table_name);
                    if let Ok(cols) = execute_query_to_json(&conn, &pragma_sql) {
                        if let Some(col_arr) = cols.as_array() {
                            for col in col_arr {
                                let col_name = col["name"].as_str().unwrap_or("");
                                let (is_fk, fk_table, fk_column) = if let Some((ref_table, ref_col)) = fk_map.get(col_name) {
                                    (1, Value::String(ref_table.clone()), Value::String(ref_col.clone()))
                                } else {
                                    (0, Value::Null, Value::Null)
                                };
                                all_columns.push(serde_json::json!({
                                    "schema_name": "main",
                                    "table_name": table_name,
                                    "name": col["name"],
                                    "data_type": col["type"].as_str().unwrap_or("TEXT"),
                                    "max_length": Value::Null,
                                    "precision": Value::Null,
                                    "scale": Value::Null,
                                    "is_nullable": if col["notnull"].as_i64() == Some(1) { 0 } else { 1 },
                                    "is_primary_key": if col["pk"].as_i64().unwrap_or(0) > 0 { 1 } else { 0 },
                                    "is_foreign_key": is_fk,
                                    "is_identity": 0,
                                    "ordinal_position": col["cid"].as_i64().unwrap_or(0) + 1,
                                    "fk_table": fk_table,
                                    "fk_column": fk_column,
                                }));
                            }
                        }
                    }
                }
            }

            Ok(Value::Array(all_columns))
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?
    }

    // === Generic Object Operations ===

    async fn list_objects(&self, config: &ConnConfig, object_type: &str) -> Result<Value, String> {
        match object_type {
            "table" => {
                // Fetch tables with row counts (SQLite needs per-table COUNT)
                let path = Self::get_path(config)?;
                let readonly = Self::is_readonly(config);
                tokio::task::spawn_blocking(move || {
                    let conn = open_connection(&path, readonly)?;
                    let tables = execute_query_to_json(&conn, super::sql::LIST_TABLES_SQL)?;
                    let mut result: Vec<Value> = Vec::new();
                    if let Some(arr) = tables.as_array() {
                        for t in arr {
                            let name = t["name"].as_str().unwrap_or("");
                            let count_sql = format!("SELECT COUNT(*) AS c FROM \"{}\"", name.replace('"', "\"\""));
                            let row_count = execute_query_to_json(&conn, &count_sql).ok()
                                .and_then(|r| r.as_array()?.first()?.get("c")?.as_i64());
                            let mut obj = t.as_object().cloned().unwrap_or_default();
                            obj.insert("row_count".to_string(), row_count.map(Value::from).unwrap_or(Value::Null));
                            result.push(Value::Object(obj));
                        }
                    }
                    Ok(Value::Array(result))
                }).await.map_err(|e| format!("Task failed: {}", e))?
            }
            "view" => Self::run_sql(config, super::sql::LIST_VIEWS_SQL).await,
            "trigger" => Self::run_sql(config, super::sql::LIST_TRIGGERS_SQL).await,
            _ => Ok(Value::Array(vec![]))
        }
    }

    async fn get_object_data(
        &self, config: &ConnConfig, object_type: &str,
        name: &str, _schema: &str, data_key: &str,
    ) -> Result<Value, String> {
        match data_key {
            "columns" => Self::run_pragma_columns(config, name).await,
            "indexes" => Self::run_pragma_indexes(config, name).await,
            "foreign_keys" => Self::run_pragma_foreign_keys(config, name).await,
            "definition" => {
                let sql = super::sql::get_definition_sql(name);
                let result = Self::run_sql(config, &sql).await?;
                let definition = result.as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|row| row.get("definition"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                Ok(serde_json::json!({ "definition": definition }))
            }
            "data" => {
                let sql = super::sql::get_preview_sql(name, 100, 0);
                Self::run_sql(config, &sql).await
            }
            "ghost_fk_columns" => {
                // Return all columns for ghost FK detection
                Self::run_pragma_columns(config, name).await
            }
            _ => Err(format!("Unsupported data key '{}' for SQLite '{}'", data_key, object_type)),
        }
    }
}
