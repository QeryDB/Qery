use std::collections::HashMap;
use rusqlite::Connection;
use serde_json::Value;
use crate::repositories::connections;
use crate::drivers::traits::{ConnConfig, DatabaseDriver};

pub fn list_connections(db: &Connection) -> Result<Vec<Value>, String> {
    connections::list_connections(db)
}

pub fn get_connection(db: &Connection, id: &str) -> Result<Option<Value>, String> {
    connections::get_connection(db, id)
}

pub fn create_connection(db: &Connection, input: &Value) -> Result<Value, String> {
    connections::create_connection(db, input)
}

pub fn update_connection(db: &Connection, id: &str, input: &Value) -> Result<Option<Value>, String> {
    connections::update_connection(db, id, input)
}

pub fn delete_connection(db: &Connection, id: &str) -> Result<bool, String> {
    // Clean up all session state for this connection
    let prefix = format!("{}:", id);
    crate::repositories::session_state::delete_by_prefix(db, &prefix)?;
    connections::delete_connection(db, id)
}

pub fn reorder_connections(db: &Connection, ids: &[String]) -> Result<(), String> {
    connections::reorder_connections(db, ids)
}

pub async fn test_connection(driver: &dyn DatabaseDriver, config: &ConnConfig) -> Result<Value, String> {
    match driver.test_connection(config).await {
        Ok(result) => {
            let version = result.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
            Ok(serde_json::json!({
                "ok": true,
                "message": "Connection successful",
                "serverVersion": version,
            }))
        }
        Err(e) => Ok(serde_json::json!({ "ok": false, "message": e })),
    }
}

pub async fn test_connection_by_id(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    id: &str,
) -> Result<Value, String> {
    let conn = connections::get_connection(db, id)?;
    let conn = conn.ok_or("Connection not found")?;

    let auth = conn["auth_type"].as_str().unwrap_or("integrated");
    let password = if auth == "sql" {
        connections::get_connection_password(db, id)?
    } else {
        None
    };

    let host = conn["server"].as_str().unwrap_or("localhost");
    let port = conn["port"].as_i64().unwrap_or(1433);
    let database = conn["database_name"].as_str().unwrap_or("master");

    let mut params = HashMap::new();
    params.insert("host".to_string(), host.to_string());
    params.insert("port".to_string(), port.to_string());
    params.insert("database".to_string(), database.to_string());
    params.insert("auth_type".to_string(), auth.to_string());
    if let Some(u) = conn["username"].as_str() {
        params.insert("username".to_string(), u.to_string());
    }
    if let Some(pw) = password {
        params.insert("password".to_string(), pw);
    }

    let config = ConnConfig::from_map(params);
    test_connection(driver, &config).await
}

pub async fn discover_servers(driver: &dyn DatabaseDriver) -> Result<Value, String> {
    driver.discover_servers(None, false, "integrated", None, None).await
}

pub async fn list_databases(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
) -> Result<Value, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config("master");
    let result = driver.list_databases(&config).await?;
    connections::update_last_connected(db, connection_id)?;
    Ok(result)
}

pub struct ConnectionCredentials {
    pub host: String,
    pub port: i64,
    pub auth: String,
    pub user: Option<String>,
    pub password: Option<String>,
}

impl ConnectionCredentials {
    /// Convert to a ConnConfig with the given database name.
    pub fn to_conn_config(&self, database: &str) -> ConnConfig {
        let mut params = HashMap::new();
        params.insert("host".to_string(), self.host.clone());
        params.insert("port".to_string(), self.port.to_string());
        params.insert("database".to_string(), database.to_string());
        params.insert("auth_type".to_string(), self.auth.clone());
        if let Some(ref u) = self.user {
            params.insert("username".to_string(), u.clone());
        }
        if let Some(ref p) = self.password {
            params.insert("password".to_string(), p.clone());
        }
        ConnConfig::from_map(params)
    }
}

/// Get connection credentials from the database.
/// Kept for backward compatibility — commands should use `drivers::resolve::resolve_connection` instead.
pub fn get_connection_credentials(
    db: &Connection,
    connection_id: &str,
) -> Result<ConnectionCredentials, String> {
    let conn = connections::get_connection(db, connection_id)?
        .ok_or("Connection not found")?;

    let auth = conn["auth_type"]
        .as_str()
        .unwrap_or("integrated")
        .to_string();
    let password = if auth == "sql" {
        connections::get_connection_password(db, connection_id)?
    } else {
        None
    };

    let host = conn["server"].as_str().unwrap_or("localhost").to_string();
    let port = conn["port"].as_i64().unwrap_or(1433);

    Ok(ConnectionCredentials {
        host,
        port,
        auth,
        user: conn["username"].as_str().map(|s| s.to_string()),
        password,
    })
}
