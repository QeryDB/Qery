use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

// ========================
// Connection Configuration
// ========================

#[derive(Debug, Clone)]
pub struct ConnConfig {
    pub params: HashMap<String, String>,
}

impl ConnConfig {
    pub fn new() -> Self {
        Self { params: HashMap::new() }
    }

    pub fn from_map(params: HashMap<String, String>) -> Self {
        Self { params }
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.params.get(key).map(|s| s.as_str())
    }

    pub fn require(&self, key: &str) -> Result<&str, String> {
        self.params.get(key).map(|s| s.as_str())
            .ok_or_else(|| format!("Missing required config param: {}", key))
    }

    pub fn get_or<'a>(&'a self, key: &str, default: &'a str) -> &'a str {
        self.params.get(key).map(|s| s.as_str()).unwrap_or(default)
    }

    pub fn port(&self, default: u16) -> u16 {
        self.params.get("port")
            .and_then(|p| p.parse().ok())
            .unwrap_or(default)
    }

    pub fn set(&mut self, key: &str, value: &str) {
        self.params.insert(key.to_string(), value.to_string());
    }
}

// ========================
// Connection Parameter Metadata
// ========================

#[derive(Serialize, Clone, Debug)]
pub struct ConnectionParam {
    pub key: String,
    pub label: String,
    pub param_type: ParamType,
    pub required: bool,
    pub default_value: Option<String>,
    pub group: String,
    pub placeholder: Option<String>,
    pub order: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", content = "options")]
pub enum ParamType {
    Text,
    Password,
    Number,
    Toggle,
    Select(Vec<SelectOption>),
    FilePath(Vec<String>),  // file extension filters e.g. ["db", "sqlite", "sqlite3"]
}

#[derive(Serialize, Clone, Debug)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

// ========================
// Object Type Metadata
// ========================

#[derive(Serialize, Clone, Debug)]
pub struct ObjectTypeDescriptor {
    pub key: String,
    pub label: String,
    pub label_singular: String,
    pub icon: String,
    pub color: String,
    pub order: u16,
    pub has_schema: bool,
    pub tabs: Vec<TabDescriptor>,
    pub context_actions: Vec<ContextAction>,
}

#[derive(Serialize, Clone, Debug)]
pub struct TabDescriptor {
    pub key: String,
    pub label: String,
    pub data_key: String,
    pub renderer: TabRenderer,
}

#[derive(Serialize, Clone, Debug)]
pub enum TabRenderer {
    Columns,
    Indexes,
    ForeignKeys,
    ReferencedBy,
    Relationships,
    Definition,
    Parameters,
    Dependencies,
    DataPreview,
    Annotations,
    KeyValue,
    ValueList,
    Executor,
}

#[derive(Serialize, Clone, Debug)]
pub struct ContextAction {
    pub key: String,
    pub label: String,
    pub confirm: bool,
    pub destructive: bool,
}

// ========================
// Database Driver Trait
// ========================

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    // === Metadata (synchronous) ===
    fn name(&self) -> &str;
    fn display_name(&self) -> &str;
    fn dialect(&self) -> &str;
    fn default_port(&self) -> u16;
    fn default_schema(&self) -> &str;
    fn default_database(&self) -> &str;
    fn connection_params(&self) -> Vec<ConnectionParam>;
    fn object_types(&self) -> Vec<ObjectTypeDescriptor>;
    fn capabilities(&self) -> Value;
    fn health(&self) -> Result<Value, String>;

    // === Connection ===
    async fn test_connection(&self, config: &ConnConfig) -> Result<Value, String>;
    async fn list_databases(&self, config: &ConnConfig) -> Result<Value, String>;

    // === Query Execution ===
    async fn run_query(&self, config: &ConnConfig, sql: &str, params: Option<Value>) -> Result<Value, String>;
    async fn get_query_plan(&self, config: &ConnConfig, sql: &str) -> Result<Value, String>;

    // === Schema (columns needed globally for tree + search) ===
    async fn get_all_columns(&self, config: &ConnConfig) -> Result<Value, String>;

    // === Generic Object Operations ===
    async fn list_objects(&self, config: &ConnConfig, object_type: &str) -> Result<Value, String>;
    async fn get_object_data(
        &self,
        config: &ConnConfig,
        object_type: &str,
        name: &str,
        schema: &str,
        data_key: &str,
    ) -> Result<Value, String>;
    async fn execute_object_action(
        &self,
        config: &ConnConfig,
        object_type: &str,
        name: &str,
        schema: &str,
        action: &str,
    ) -> Result<Value, String> {
        let _ = (config, name, schema);
        Err(format!("Action '{}' not supported for '{}'", action, object_type))
    }

    // === Discovery (optional) ===
    async fn discover_servers(
        &self,
        _target: Option<&str>,
        _network: bool,
        _auth: &str,
        _user: Option<&str>,
        _password: Option<&str>,
    ) -> Result<Value, String> {
        Ok(serde_json::json!({ "servers": [] }))
    }
}
