use async_trait::async_trait;
use serde_json::Value;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::drivers::traits::{
    ConnConfig, ConnectionParam, ContextAction, DatabaseDriver,
    ObjectTypeDescriptor, ParamType, SelectOption, TabDescriptor, TabRenderer,
};
use super::query::execute_query_to_json;

/// Resolve a named SQL Server instance port via SQL Browser (UDP 1434).
async fn resolve_named_instance(host: &str, instance: &str) -> Result<u16, String> {
    use tokio::net::UdpSocket;
    use std::time::Duration;

    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("UDP socket error: {}", e))?;

    let browser_addr = format!("{}:1434", host);
    let mut request = vec![0x04u8];
    request.extend_from_slice(instance.as_bytes());

    socket
        .send_to(&request, &browser_addr)
        .await
        .map_err(|e| format!("SQL Browser send failed: {}", e))?;

    let mut buf = [0u8; 4096];
    let result = tokio::time::timeout(Duration::from_secs(2), socket.recv_from(&mut buf)).await;

    match result {
        Ok(Ok((len, _))) => {
            if len < 3 {
                return Err("SQL Browser response too short".to_string());
            }
            let response = String::from_utf8_lossy(&buf[3..len]);
            let parts: Vec<&str> = response.split(';').collect();
            for i in 0..parts.len().saturating_sub(1) {
                if parts[i].eq_ignore_ascii_case("tcp") {
                    if let Ok(port) = parts[i + 1].parse::<u16>() {
                        return Ok(port);
                    }
                }
            }
            Err(format!("No TCP port in SQL Browser response: {}", response))
        }
        Ok(Err(e)) => Err(format!("SQL Browser recv error: {}", e)),
        Err(_) => Err("SQL Browser timeout — service may not be running".to_string()),
    }
}

pub struct MssqlDriver;

impl MssqlDriver {
    pub fn new() -> Self {
        Self
    }

    /// Build a tiberius Client from the new HashMap-based ConnConfig.
    async fn connect(conn_config: &ConnConfig) -> Result<Client<Compat<TcpStream>>, String> {
        let mut config = Config::new();

        let host_raw = conn_config.get_or("host", "localhost");
        let port_raw = conn_config.port(1433);
        let instance = conn_config.get("instance");

        // Determine (host, port): if an instance is specified, resolve via SQL Browser
        let (host, port) = if let Some(inst) = instance {
            if !inst.is_empty() {
                match resolve_named_instance(host_raw, inst).await {
                    Ok(p) => (host_raw.to_string(), p),
                    Err(_) => (host_raw.to_string(), port_raw),
                }
            } else {
                (host_raw.to_string(), port_raw)
            }
        } else {
            // Legacy support: host might contain backslash (host\instance)
            if let Some(bs) = host_raw.find('\\') {
                let h = &host_raw[..bs];
                let inst = &host_raw[bs + 1..];
                match resolve_named_instance(h, inst).await {
                    Ok(p) => (h.to_string(), p),
                    Err(_) => (h.to_string(), 1433),
                }
            } else if let Some(comma) = host_raw.rfind(',') {
                // Legacy: "host,port" format
                let h = &host_raw[..comma];
                let p = host_raw[comma + 1..].trim().parse::<u16>().unwrap_or(port_raw);
                (h.to_string(), p)
            } else {
                (host_raw.to_string(), port_raw)
            }
        };

        config.host(&host);
        config.port(port);

        let database = conn_config.get_or("database", "master");
        config.database(database);
        config.trust_cert();
        config.encryption(EncryptionLevel::NotSupported);

        let auth = conn_config.get_or("auth_type", "integrated");
        match auth {
            "sql" => {
                let u = conn_config.get_or("username", "");
                let p = conn_config.get_or("password", "");
                config.authentication(AuthMethod::sql_server(u, p));
            }
            _ => {
                #[cfg(all(windows, feature = "desktop"))]
                {
                    config.authentication(AuthMethod::Integrated);
                }
                #[cfg(not(all(windows, feature = "desktop")))]
                {
                    return Err("Windows Authentication is only supported on Windows desktop".to_string());
                }
            }
        }

        let tcp = TcpStream::connect(config.get_addr())
            .await
            .map_err(|e| format!("TCP connection failed to {}:{} - {}", host, port, e))?;

        tcp.set_nodelay(true).ok();

        let client = Client::connect(config, tcp.compat_write())
            .await
            .map_err(|e| format!("TDS connection failed: {}", e))?;

        Ok(client)
    }
}

#[async_trait]
impl DatabaseDriver for MssqlDriver {
    // === Metadata ===

    fn name(&self) -> &str {
        "mssql"
    }

    fn display_name(&self) -> &str {
        "SQL Server"
    }

    fn dialect(&self) -> &str {
        "mssql"
    }

    fn default_port(&self) -> u16 {
        1433
    }

    fn default_schema(&self) -> &str {
        "dbo"
    }

    fn default_database(&self) -> &str {
        "master"
    }

    fn connection_params(&self) -> Vec<ConnectionParam> {
        vec![
            ConnectionParam {
                key: "host".into(),
                label: "Server".into(),
                param_type: ParamType::Text,
                required: true,
                default_value: Some("localhost".into()),
                group: "connection".into(),
                placeholder: Some("hostname or IP".into()),
                order: 1,
            },
            ConnectionParam {
                key: "port".into(),
                label: "Port".into(),
                param_type: ParamType::Number,
                required: true,
                default_value: Some("1433".into()),
                group: "connection".into(),
                placeholder: None,
                order: 2,
            },
            ConnectionParam {
                key: "instance".into(),
                label: "Instance".into(),
                param_type: ParamType::Text,
                required: false,
                default_value: None,
                group: "connection".into(),
                placeholder: Some("e.g. SQLEXPRESS".into()),
                order: 3,
            },
            ConnectionParam {
                key: "database".into(),
                label: "Database".into(),
                param_type: ParamType::Text,
                required: false,
                default_value: None,
                group: "connection".into(),
                placeholder: None,
                order: 4,
            },
            ConnectionParam {
                key: "auth_type".into(),
                label: "Authentication".into(),
                param_type: ParamType::Select(vec![
                    SelectOption { value: "integrated".into(), label: "Windows (Integrated)".into() },
                    SelectOption { value: "sql".into(), label: "SQL Server Authentication".into() },
                ]),
                required: true,
                default_value: Some("integrated".into()),
                group: "auth".into(),
                placeholder: None,
                order: 5,
            },
            ConnectionParam {
                key: "username".into(),
                label: "Username".into(),
                param_type: ParamType::Text,
                required: false,
                default_value: None,
                group: "auth".into(),
                placeholder: None,
                order: 6,
            },
            ConnectionParam {
                key: "password".into(),
                label: "Password".into(),
                param_type: ParamType::Password,
                required: false,
                default_value: None,
                group: "auth".into(),
                placeholder: None,
                order: 7,
            },
        ]
    }

    fn object_types(&self) -> Vec<ObjectTypeDescriptor> {
        vec![
            ObjectTypeDescriptor {
                key: "table".into(),
                label: "Tables".into(),
                label_singular: "Table".into(),
                icon: "table2".into(),
                color: "#3b82f6".into(),
                order: 1,
                has_schema: true,
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
                    ContextAction { key: "select_top".into(), label: "SELECT TOP 100".into(), confirm: false, destructive: false },
                    ContextAction { key: "count".into(), label: "Count Rows".into(), confirm: false, destructive: false },
                    ContextAction { key: "inspect".into(), label: "Inspect Table".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "view".into(),
                label: "Views".into(),
                label_singular: "View".into(),
                icon: "eye".into(),
                color: "#a855f7".into(),
                order: 2,
                has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "columns".into(), label: "Columns".into(), data_key: "columns".into(), renderer: TabRenderer::Columns },
                    TabDescriptor { key: "execute".into(), label: "Results".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect View".into(), confirm: false, destructive: false },
                    ContextAction { key: "view_definition".into(), label: "View Definition".into(), confirm: false, destructive: false },
                    ContextAction { key: "select_top".into(), label: "SELECT TOP 100".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "procedure".into(),
                label: "Procedures".into(),
                label_singular: "Procedure".into(),
                icon: "code2".into(),
                color: "#f97316".into(),
                order: 3,
                has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "execute".into(), label: "Execute".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "parameters".into(), label: "Variables".into(), data_key: "parameters".into(), renderer: TabRenderer::Parameters },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect Procedure".into(), confirm: false, destructive: false },
                    ContextAction { key: "view_definition".into(), label: "View Definition".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "function".into(),
                label: "Functions".into(),
                label_singular: "Function".into(),
                icon: "function-square".into(),
                color: "#14b8a6".into(),
                order: 4,
                has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                    TabDescriptor { key: "execute".into(), label: "Execute".into(), data_key: "execute".into(), renderer: TabRenderer::Executor },
                    TabDescriptor { key: "parameters".into(), label: "Parameters".into(), data_key: "parameters".into(), renderer: TabRenderer::Parameters },
                    TabDescriptor { key: "dependencies".into(), label: "Dependencies".into(), data_key: "dependencies".into(), renderer: TabRenderer::Dependencies },
                    TabDescriptor { key: "used_by".into(), label: "Used By".into(), data_key: "used_by".into(), renderer: TabRenderer::Dependencies },
                ],
                context_actions: vec![
                    ContextAction { key: "inspect".into(), label: "Inspect Function".into(), confirm: false, destructive: false },
                    ContextAction { key: "view_definition".into(), label: "View Definition".into(), confirm: false, destructive: false },
                ],
            },
            ObjectTypeDescriptor {
                key: "trigger".into(),
                label: "Triggers".into(),
                label_singular: "Trigger".into(),
                icon: "zap".into(),
                color: "#f59e0b".into(),
                order: 5,
                has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "details".into(), label: "Details".into(), data_key: "details".into(), renderer: TabRenderer::KeyValue },
                    TabDescriptor { key: "definition".into(), label: "Definition".into(), data_key: "definition".into(), renderer: TabRenderer::Definition },
                ],
                context_actions: vec![],
            },
            ObjectTypeDescriptor {
                key: "sequence".into(),
                label: "Sequences".into(),
                label_singular: "Sequence".into(),
                icon: "hash".into(),
                color: "#06b6d4".into(),
                order: 6,
                has_schema: true,
                tabs: vec![
                    TabDescriptor { key: "details".into(), label: "Details".into(), data_key: "details".into(), renderer: TabRenderer::KeyValue },
                ],
                context_actions: vec![],
            },
        ]
    }

    fn capabilities(&self) -> serde_json::Value {
        serde_json::json!({
            "supports_schemas": true,
            "supports_execution_plan": true,
            "supports_procedures": true,
            "supports_functions": true,
            "supports_discovery": true,
            "supports_multiple_databases": true,
            "supports_windows_auth": true,
        })
    }

    fn health(&self) -> Result<Value, String> {
        Ok(serde_json::json!({"status": "ok"}))
    }

    // === Connection ===

    async fn test_connection(&self, config: &ConnConfig) -> Result<Value, String> {
        let mut client = Self::connect(config).await?;
        let result = execute_query_to_json(&mut client, "SELECT @@VERSION AS version").await?;

        let version = result
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|row| row.get("version"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        Ok(serde_json::json!({ "version": version }))
    }

    async fn list_databases(&self, config: &ConnConfig) -> Result<Value, String> {
        let mut client = Self::connect(config).await?;
        let result = execute_query_to_json(
            &mut client,
            "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name",
        ).await?;

        let names: Vec<Value> = result
            .as_array()
            .map(|arr| arr.iter().filter_map(|row| row.get("name").cloned()).collect())
            .unwrap_or_default();

        Ok(Value::Array(names))
    }

    // === Query Execution ===

    async fn run_query(
        &self,
        config: &ConnConfig,
        sql: &str,
        _params: Option<Value>,
    ) -> Result<Value, String> {
        let mut client = Self::connect(config).await?;
        execute_query_to_json(&mut client, sql).await
    }

    async fn get_query_plan(&self, config: &ConnConfig, sql: &str) -> Result<Value, String> {
        let mut client = Self::connect(config).await?;

        execute_query_to_json(&mut client, "SET SHOWPLAN_XML ON").await?;
        let result = execute_query_to_json(&mut client, sql).await?;
        let _ = execute_query_to_json(&mut client, "SET SHOWPLAN_XML OFF").await;

        Ok(result)
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
            "procedure" => super::sql::LIST_PROCEDURES_SQL,
            "function" => super::sql::LIST_FUNCTIONS_SQL,
            "trigger" => super::sql::LIST_TRIGGERS_SQL,
            "sequence" => super::sql::LIST_SEQUENCES_SQL,
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
        let _ = object_type; // Used for future per-type routing
        match data_key {
            "columns" => {
                let sql = super::sql::get_columns_sql(name, schema);
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
                // Try OBJECT_DEFINITION first (single row, handles any size)
                let sql = super::sql::get_definition_sql(name, schema);
                let rows = self.run_query(config, &sql, None).await?;
                let definition = rows.as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|row| row["definition"].as_str())
                    .map(|s| s.to_string());

                if let Some(def) = definition {
                    Ok(serde_json::json!({ "definition": def }))
                } else {
                    // Fallback to sp_helptext for encrypted or permission-restricted objects
                    let fallback_sql = format!("EXEC sp_helptext '{}.{}'", schema, name);
                    match self.run_query(config, &fallback_sql, None).await {
                        Ok(rows) => {
                            let def: String = rows.as_array()
                                .map(|arr| arr.iter().filter_map(|r| r["Text"].as_str()).collect())
                                .unwrap_or_default();
                            Ok(serde_json::json!({ "definition": if def.is_empty() { None } else { Some(def) } }))
                        }
                        Err(_) => Ok(serde_json::json!({ "definition": null })),
                    }
                }
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
            "view_columns" => {
                let sql = super::sql::get_view_columns_sql(name, schema);
                self.run_query(config, &sql, None).await
            }
            "ghost_fk_columns" => {
                let sql = super::sql::get_ghost_fk_columns_sql(schema);
                self.run_query(config, &sql, None).await
            }
            "data" => {
                // Build column list with CAST for sql_variant columns to avoid tiberius SSVariant panic
                let cols_sql = format!(
                    "SELECT c.name, tp.name AS type_name FROM sys.columns c \
                     INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id \
                     WHERE c.object_id = OBJECT_ID('[{}].[{}]') ORDER BY c.column_id",
                    schema, name
                );
                let cols_result = self.run_query(config, &cols_sql, None).await?;
                let col_list = if let Some(cols) = cols_result.as_array() {
                    cols.iter().map(|c| {
                        let col_name = c["name"].as_str().unwrap_or("?");
                        let type_name = c["type_name"].as_str().unwrap_or("");
                        if type_name == "sql_variant" {
                            format!("CAST([{}] AS NVARCHAR(MAX)) AS [{}]", col_name, col_name)
                        } else {
                            format!("[{}]", col_name)
                        }
                    }).collect::<Vec<_>>().join(", ")
                } else {
                    "*".to_string()
                };
                let sql = format!("SELECT TOP 100 {} FROM [{}].[{}]", col_list, schema, name);
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
                    _ => Err(format!("No details for object type '{}'", object_type)),
                }
            }
            _ => Err(format!("Unsupported data key '{}' for object type '{}'", data_key, object_type)),
        }
    }

    // === Discovery ===

    async fn discover_servers(
        &self,
        target: Option<&str>,
        _network: bool,
        auth: &str,
        user: Option<&str>,
        password: Option<&str>,
    ) -> Result<Value, String> {
        let servers = super::discovery::discover_local(target, auth, user, password).await;
        Ok(serde_json::json!({ "servers": servers }))
    }
}
