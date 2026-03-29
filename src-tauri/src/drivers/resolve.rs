use std::collections::HashMap;
use std::sync::Arc;
use rusqlite::Connection;
use super::traits::{ConnConfig, DatabaseDriver};
use super::registry::DriverRegistry;

/// Resolve a stored connection into a driver and config.
pub fn resolve_connection(
    db: &Connection,
    registry: &DriverRegistry,
    connection_id: &str,
    database: &str,
) -> Result<(Arc<dyn DatabaseDriver>, ConnConfig), String> {
    let conn = crate::repositories::connections::get_connection(db, connection_id)?
        .ok_or("Connection not found")?;

    let db_type = conn["database_type"].as_str().unwrap_or("mssql");
    let driver = registry.get(db_type)?;

    let auth = conn["auth_type"].as_str().unwrap_or("integrated").to_string();
    let password = if auth == "sql" {
        crate::repositories::connections::get_connection_password(db, connection_id)?
    } else {
        None
    };

    let host = conn["server"].as_str().unwrap_or("localhost");
    let port = conn["port"].as_i64().unwrap_or(1433);

    let mut params = HashMap::new();
    params.insert("host".to_string(), normalize_host(host));
    params.insert("port".to_string(), port.to_string());
    params.insert("database".to_string(), database.to_string());
    // For file-based drivers (SQLite), server IS the file path
    params.insert("file_path".to_string(), conn["server"].as_str().unwrap_or("").to_string());
    params.insert("auth_type".to_string(), auth);
    if let Some(user) = conn["username"].as_str() {
        params.insert("username".to_string(), user.to_string());
    }
    if let Some(pw) = password {
        params.insert("password".to_string(), pw);
    }

    let config = ConnConfig::from_map(params);

    Ok((driver, config))
}

/// Normalize host aliases to localhost.
fn normalize_host(host: &str) -> String {
    match host {
        "127.0.0.1" | "." | "(local)" => "localhost".to_string(),
        other => other.to_string(),
    }
}

/// Build server address string for the driver.
/// Named instances (host\instance) are passed as-is.
/// Plain hosts get "host,port" format.
/// Kept for backward compatibility with code that constructs addresses manually.
pub fn build_server_address(host: &str, port: i64) -> String {
    if host.contains('\\') {
        if let Some(bs) = host.find('\\') {
            let host_part = &host[..bs];
            let instance = &host[bs..];
            let effective = match host_part {
                "127.0.0.1" | "." | "(local)" => "localhost",
                other => other,
            };
            format!("{}{}", effective, instance)
        } else {
            host.to_string()
        }
    } else {
        let effective_host = match host {
            "127.0.0.1" | "." | "(local)" => "localhost",
            other => other,
        };
        format!("{},{}", effective_host, port)
    }
}
