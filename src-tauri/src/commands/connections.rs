use serde_json::{json, Value};
use std::collections::HashMap;
use crate::drivers::traits::ConnConfig;

#[tauri::command]
pub async fn list_connections(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::services::connection_service::list_connections(&db).map(|v| Value::Array(v))
}

#[tauri::command]
pub async fn create_connection(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::services::connection_service::create_connection(&db, &input)
}

#[tauri::command]
pub async fn update_connection(
    state: tauri::State<'_, crate::AppState>,
    id: String,
    input: Value,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::services::connection_service::update_connection(&db, &id, &input)?
        .ok_or_else(|| "Connection not found".to_string())
}

#[tauri::command]
pub async fn delete_connection(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let deleted = crate::services::connection_service::delete_connection(&db, &id)?;
    if !deleted {
        return Err("Connection not found".to_string());
    }
    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn reorder_connections(
    state: tauri::State<'_, crate::AppState>,
    ids: Vec<String>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::services::connection_service::reorder_connections(&db, &ids)?;
    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn test_connection(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let db_type = input["database_type"].as_str().unwrap_or("mssql");
    let driver = state.registry.get(db_type)?;

    let host = input["server"].as_str().unwrap_or("localhost");
    let port = input["port"].as_i64().unwrap_or(driver.default_port() as i64);
    let database = input["database_name"].as_str().unwrap_or(driver.default_database());
    let auth = input["auth_type"].as_str().unwrap_or("integrated");
    let user = input["username"].as_str();
    let password = input["password"].as_str();

    let mut params = HashMap::new();
    params.insert("host".to_string(), host.to_string());
    params.insert("port".to_string(), port.to_string());
    params.insert("database".to_string(), database.to_string());
    params.insert("auth_type".to_string(), auth.to_string());
    if let Some(u) = user {
        params.insert("username".to_string(), u.to_string());
    }
    if let Some(p) = password {
        params.insert("password".to_string(), p.to_string());
    }

    let config = ConnConfig::from_map(params);

    match driver.test_connection(&config).await {
        Ok(result) => {
            let version = result.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
            Ok(json!({
                "ok": true,
                "message": "Connection successful",
                "serverVersion": version,
            }))
        }
        Err(e) => Ok(json!({ "ok": false, "message": e })),
    }
}

#[tauri::command]
pub async fn discover_servers_simple(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Value, String> {
    let driver = state.registry.get("mssql")?;
    driver.discover_servers(None, false, "integrated", None, None).await
}

#[tauri::command]
pub async fn ping_connection(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<Value, String> {
    let start = std::time::Instant::now();

    // Resolve driver + config — use the driver's default database for ping
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = crate::repositories::connections::get_connection(&db, &id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        let drv = state.registry.get(db_type)?;
        let default_db = drv.default_database().to_string();
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &id, &default_db)?
    };

    match driver.test_connection(&config).await {
        Ok(_) => {
            let latency = start.elapsed().as_millis();
            Ok(json!({
                "ok": true,
                "latency_ms": latency,
                "error": Value::Null
            }))
        }
        Err(e) => Ok(json!({
            "ok": false,
            "latency_ms": start.elapsed().as_millis(),
            "error": e
        })),
    }
}

#[tauri::command]
pub async fn list_databases(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<Value, String> {
    // Resolve driver + config — use driver's default database
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = crate::repositories::connections::get_connection(&db, &id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        let drv = state.registry.get(db_type)?;
        let default_db = drv.default_database().to_string();
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &id, &default_db)?
    };

    let result = driver.list_databases(&config).await?;

    // Update last_connected timestamp
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::connections::update_last_connected(&db, &id)?;

    Ok(result)
}

#[tauri::command]
pub async fn list_available_drivers(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Value, String> {
    Ok(Value::Array(state.registry.list_drivers()))
}
