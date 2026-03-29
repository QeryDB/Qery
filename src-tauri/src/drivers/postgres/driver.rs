use async_trait::async_trait;
use serde_json::Value;
use tokio_postgres::{Client, NoTls};

use crate::drivers::traits::{
    ConnConfig, ConnectionParam, ContextAction, DatabaseDriver,
    ObjectTypeDescriptor, ParamType, SelectOption, TabDescriptor, TabRenderer,
};
use super::query::execute_query_to_json;

pub struct PostgresDriver;

impl PostgresDriver {
    pub fn new() -> Self {
        Self
    }

    async fn connect(config: &ConnConfig) -> Result<Client, String> {
        let host = config.get_or("host", "localhost");
        let port = config.port(5432);
        let database = config.get_or("database", "postgres");
        let user = config.get_or("username", "postgres");
        let password = config.get("password").unwrap_or("");

        let mut conn_str = format!(
            "host='{}' port={} dbname='{}' user='{}'",
            host.replace('\'', "\\'"), port,
            database.replace('\'', "\\'"),
            user.replace('\'', "\\'")
        );
        if !password.is_empty() {
            conn_str.push_str(&format!(" password='{}'", password.replace('\'', "\\'")));
        }

        let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
            .await
            .map_err(|e| {
                let detail = e.as_db_error().map(|db| format!("{}: {}", db.severity(), db.message())).unwrap_or_else(|| e.to_string());
                format!("PostgreSQL connection failed: {}", detail)
            })?;

        // Spawn connection task — it runs in the background
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("PostgreSQL connection error: {}", e);
            }
        });

        Ok(client)
    }
}

#[async_trait]
impl DatabaseDriver for PostgresDriver {
    // === Metadata ===

    fn name(&self) -> &str { "postgres" }
    fn display_name(&self) -> &str { "PostgreSQL" }
    fn dialect(&self) -> &str { "postgres" }
    fn default_port(&self) -> u16 { 5432 }
    fn default_schema(&self) -> &str { "public" }
    fn default_database(&self) -> &str { "postgres" }

    fn connection_params(&self) -> Vec<ConnectionParam> {
        vec![
            ConnectionParam {
                key: "host".into(), label: "Host".into(),
                param_type: ParamType::Text, required: true,
                default_value: Some("localhost".into()),
                group: "connection".into(),
                placeholder: Some("hostname or IP".into()), order: 1,
            },
            ConnectionParam {
                key: "port".into(), label: "Port".into(),
                param_type: ParamType::Number, required: true,
                default_value: Some("5432".into()),
                group: "connection".into(),
                placeholder: None, order: 2,
            },
            ConnectionParam {
                key: "database".into(), label: "Database".into(),
                param_type: ParamType::Text, required: false,
                default_value: Some("postgres".into()),
                group: "connection".into(),
                placeholder: None, order: 3,
            },
            ConnectionParam {
                key: "username".into(), label: "Username".into(),
                param_type: ParamType::Text, required: true,
                default_value: Some("postgres".into()),
                group: "auth".into(),
                placeholder: None, order: 4,
            },
            ConnectionParam {
                key: "password".into(), label: "Password".into(),
                param_type: ParamType::Password, required: false,
                default_value: None,
                group: "auth".into(),
                placeholder: Some("Leave empty for trust auth".into()), order: 5,
            },
            ConnectionParam {
                key: "ssl_mode".into(), label: "SSL Mode".into(),
                param_type: ParamType::Select(vec![
                    SelectOption { value: "disable".into(), label: "Disable".into() },
                    SelectOption { value: "prefer".into(), label: "Prefer".into() },
                    SelectOption { value: "require".into(), label: "Require".into() },
                ]),
                required: false, default_value: Some("disable".into()),
                group: "security".into(),
                placeholder: None, order: 6,
            },
        ]
    }

    fn object_types(&self) -> Vec<ObjectTypeDescriptor> {
        vec![
            ObjectTypeDescriptor {
                key: "table".into(), label: "Tables".into(),
                label_singular: "Table".into(), icon: "table2".into(),
                color: "#3b82f6".into(), order: 1, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "indexes".into(), label: "Indexes".into(), data_key: "indexes".into(), renderer: TabRenderer::Indexes },
                    TabDescriptor { key: "foreign_keys".into(), label: "Foreign Keys".into(), data_key: "foreign_keys".into(), renderer: TabRenderer::ForeignKeys },
                    TabDescriptor { key: "referenced_by".into(), label: "Referenced By".into(), data_key: "referenced_by".into(), renderer: TabRenderer::ReferencedBy },
                    TabDescriptor { key: "dependencies".into(), label: "Used By".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "relationships".into(), label: "Relationships".into(), data_key: "relationships".into(), renderer: TabRenderer::Relationships },
                    TabDescriptor { key: "annotations".into(), label: "Notes".into(), data_key: "annotations".into(), renderer: TabRenderer::Annotations },
                    TabDescriptor { key: "data".into(), label: "Data".into(), data_key: "data".into(), renderer: TabRenderer::DataPreview },
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
                color: "#a855f7".into(), order: 2, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "execute".into(), label: "Results".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect View".into(), confirm: false, destructive: false },
                    ContextAction { key: "select_top".into(), label: "SELECT LIMIT 100".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "materialized_view".into(), label: "Materialized Views".into(),
                label_singular: "Materialized View".into(), icon: "layers".into(),
                color: "#6366f1".into(), order: 3, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "execute".into(), label: "Results".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "indexes".into(), label: "Indexes".into(), data_key: "indexes".into(), renderer: TabRenderer::Indexes },
                    TabDescriptor { key: "details".into(), label: "Details".into(), data_key: "details".into(), renderer: TabRenderer::KeyValue },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "refresh_matview".into(), label: "Refresh".into(), confirm: true, destructive: false },
                    ContextAction { key: "select_top".into(), label: "SELECT LIMIT 100".into(), confirm: false, destructive: false },
                    ContextAction { key: "inspect".into(), label: "Inspect".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "procedure".into(), label: "Procedures".into(),
                label_singular: "Procedure".into(), icon: "code2".into(),
                color: "#f97316".into(), order: 4, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "execute".into(), label: "Execute".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "parameters".into(), label: "Parameters".into(), data_key: "parameters".into(), renderer: TabRenderer::Parameters },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect Procedure".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "function".into(), label: "Functions".into(),
                label_singular: "Function".into(), icon: "function-square".into(),
                color: "#14b8a6".into(), order: 5, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "execute".into(), label: "Execute".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "parameters".into(), label: "Parameters".into(), data_key: "parameters".into(), renderer: TabRenderer::Parameters },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect Function".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "sequence".into(), label: "Sequences".into(),
                label_singular: "Sequence".into(), icon: "hash".into(),
                color: "#06b6d4".into(), order: 6, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "details".into(), label: "Details".into(), data_key: "details".into(), renderer: TabRenderer::KeyValue },
                    TabDescriptor { key: "dependencies".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "next_val".into(), label: "Next Value".into(), confirm: false, destructive: false },
                    ContextAction { key: "reset".into(), label: "Reset".into(), confirm: true, destructive: true },
                ],
            },
            ObjectTypeDescriptor {
                key: "enum".into(), label: "Enums".into(),
                label_singular: "Enum".into(), icon: "list".into(),
                color: "#ec4899".into(), order: 7, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "values".into(), label: "Values".into(), data_key: "values".into(), renderer: TabRenderer::ValueList },
                ],
                context_actions: vec![],
            },
            ObjectTypeDescriptor {
                key: "trigger".into(), label: "Triggers".into(),
                label_singular: "Trigger".into(), icon: "zap".into(),
                color: "#f59e0b".into(), order: 8, has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "details".into(), label: "Details".into(), data_key: "details".into(), renderer: TabRenderer::KeyValue },
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "enable".into(), label: "Enable".into(), confirm: false, destructive: false },
                    ContextAction { key: "disable".into(), label: "Disable".into(), confirm: true, destructive: false },
                ],
            },
        ]
    }

    fn capabilities(&self) -> Value {
        serde_json::json!({
            "supports_schemas": true,
            "supports_execution_plan": true,
            "supports_procedures": true,
            "supports_functions": true,
            "supports_discovery": false,
            "supports_multiple_databases": true,
            "supports_windows_auth": false,
            "plan_format": "json",
        })
    }

    fn health(&self) -> Result<Value, String> {
        Ok(serde_json::json!({"status": "ok"}))
    }

    // === Connection ===

    async fn test_connection(&self, config: &ConnConfig) -> Result<Value, String> {
        let client = Self::connect(config).await?;
        let rows = execute_query_to_json(&client, "SELECT version() AS version").await?;
        let version = rows.as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("").to_string();
        Ok(serde_json::json!({ "version": version }))
    }

    async fn list_databases(&self, config: &ConnConfig) -> Result<Value, String> {
        let client = Self::connect(config).await?;
        let result = execute_query_to_json(
            &client,
            "SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname",
        ).await?;
        let names: Vec<Value> = result.as_array()
            .map(|arr| arr.iter().filter_map(|row| row.get("name").cloned()).collect())
            .unwrap_or_default();
        Ok(Value::Array(names))
    }

    // === Query Execution ===

    async fn run_query(&self, config: &ConnConfig, sql: &str, _params: Option<Value>) -> Result<Value, String> {
        let client = Self::connect(config).await?;
        execute_query_to_json(&client, sql).await
    }

    async fn get_query_plan(&self, config: &ConnConfig, sql: &str) -> Result<Value, String> {
        let client = Self::connect(config).await?;
        let explain_sql = format!("EXPLAIN (FORMAT JSON) {}", sql);
        execute_query_to_json(&client, &explain_sql).await
    }

    // === Schema ===

    async fn get_all_columns(&self, config: &ConnConfig) -> Result<Value, String> {
        self.run_query(config, super::sql::GET_ALL_COLUMNS_SQL, None).await
    }

    // === Generic Object Operations ===

    async fn list_objects(&self, config: &ConnConfig, object_type: &str) -> Result<Value, String> {
        let sql = match object_type {
            "table" => super::sql::LIST_TABLES_SQL,
            "view" => super::sql::LIST_VIEWS_SQL,
            "materialized_view" => super::sql::LIST_MATERIALIZED_VIEWS_SQL,
            "procedure" => super::sql::LIST_PROCEDURES_SQL,
            "function" => super::sql::LIST_FUNCTIONS_SQL,
            "sequence" => super::sql::LIST_SEQUENCES_SQL,
            "enum" => super::sql::LIST_ENUMS_SQL,
            "trigger" => super::sql::LIST_TRIGGERS_SQL,
            _ => return Err(format!("Unsupported object type: {}", object_type)),
        };
        self.run_query(config, sql, None).await
    }

    async fn get_object_data(
        &self,
        config: &ConnConfig,
        object_type: &str,
        name: &str,
        schema: &str,
        data_key: &str,
    ) -> Result<Value, String> {
        match data_key {
            "columns" => {
                let sql = if object_type == "view" || object_type == "materialized_view" {
                    super::sql::get_view_columns_sql(name, schema)
                } else {
                    super::sql::get_columns_sql(name, schema)
                };
                self.run_query(config, &sql, None).await
            }
            "view_columns" => {
                let sql = super::sql::get_view_columns_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "indexes" => {
                let sql = super::sql::get_indexes_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "foreign_keys" => {
                let sql = super::sql::get_foreign_keys_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "referenced_by" => {
                let sql = super::sql::get_referenced_by_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "definition" => {
                let sql = if object_type == "trigger" {
                    // Triggers use pg_get_triggerdef + their trigger function source
                    format!(
                        "SELECT pg_get_triggerdef(tg.oid, true) || E'\\n\\n' || pg_get_functiondef(tg.tgfoid) AS definition \
                         FROM pg_trigger tg \
                         JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = tg.tgrelid) \
                         WHERE tg.tgname = '{}' AND n.nspname = '{}' LIMIT 1",
                        name.replace('\'', "''"), schema.replace('\'', "''")
                    )
                } else {
                    super::sql::get_definition_sql(name, schema)
                };
                let result = self.run_query(config, &sql, None).await?;
                let definition = result.as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|row| row.get("definition"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                Ok(serde_json::json!({ "definition": definition }))
            }
            "parameters" => {
                let sql = super::sql::get_parameters_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "dependencies" => {
                let sql = super::sql::get_dependencies_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "used_by" => {
                let sql = super::sql::get_used_by_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "ghost_fk_columns" => {
                let sql = super::sql::get_ghost_fk_columns_sql(schema);
                self.run_query(config, &sql, None).await
            }
            "data" => {
                let sql = format!(
                    "SELECT * FROM \"{}\".\"{}\" LIMIT 100",
                    schema.replace('"', "\"\""),
                    name.replace('"', "\"\"")
                );
                self.run_query(config, &sql, None).await
            }
            "details" => {
                match object_type {
                    "sequence" => {
                        let sql = super::sql::get_sequence_details_sql(name, schema);
                        self.run_query(config, &sql, None).await
                    }
                    "trigger" => {
                        let sql = super::sql::get_trigger_details_sql(name, schema);
                        self.run_query(config, &sql, None).await
                    }
                    "materialized_view" => {
                        let sql = super::sql::get_matview_info_sql(name, schema);
                        self.run_query(config, &sql, None).await
                    }
                    _ => Err(format!("No details for object type '{}'", object_type)),
                }
            }
            "values" => {
                let sql = super::sql::get_enum_values_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            _ => Err(format!("Unsupported data key '{}' for '{}'", data_key, object_type)),
        }
    }

    async fn execute_object_action(
        &self,
        config: &ConnConfig,
        object_type: &str,
        name: &str,
        schema: &str,
        action: &str,
    ) -> Result<Value, String> {
        let sch = schema.replace('"', "\"\"");
        let nm = name.replace('"', "\"\"");

        match (object_type, action) {
            ("materialized_view", "refresh_matview") => {
                let sql = format!("REFRESH MATERIALIZED VIEW \"{}\".\"{}\"", sch, nm);
                self.run_query(config, &sql, None).await?;
                Ok(serde_json::json!({"ok": true, "message": "Materialized view refreshed"}))
            }
            ("sequence", "next_val") => {
                let sql = format!("SELECT nextval('\"{}\".\"{}\"') AS value", sch, nm);
                self.run_query(config, &sql, None).await
            }
            ("sequence", "reset") => {
                let sql = format!("ALTER SEQUENCE \"{}\".\"{}\" RESTART", sch, nm);
                self.run_query(config, &sql, None).await?;
                Ok(serde_json::json!({"ok": true, "message": "Sequence reset"}))
            }
            ("trigger", "enable") => {
                // Need the table name — get trigger details first
                let details = self.get_object_data(config, "trigger", name, schema, "details").await?;
                let table = details.as_array()
                    .and_then(|a| a.first())
                    .and_then(|r| r["table_name"].as_str())
                    .ok_or("Could not determine trigger's table")?;
                let sql = format!("ALTER TABLE \"{}\".\"{}\" ENABLE TRIGGER \"{}\"",
                    sch, table.replace('"', "\"\""), nm);
                self.run_query(config, &sql, None).await?;
                Ok(serde_json::json!({"ok": true, "message": "Trigger enabled"}))
            }
            ("trigger", "disable") => {
                let details = self.get_object_data(config, "trigger", name, schema, "details").await?;
                let table = details.as_array()
                    .and_then(|a| a.first())
                    .and_then(|r| r["table_name"].as_str())
                    .ok_or("Could not determine trigger's table")?;
                let sql = format!("ALTER TABLE \"{}\".\"{}\" DISABLE TRIGGER \"{}\"",
                    sch, table.replace('"', "\"\""), nm);
                self.run_query(config, &sql, None).await?;
                Ok(serde_json::json!({"ok": true, "message": "Trigger disabled"}))
            }
            _ => Err(format!("Action '{}' not supported for '{}'", action, object_type)),
        }
    }
}
