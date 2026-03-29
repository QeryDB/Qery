use serde_json::{json, Value};
use std::collections::HashMap;
use crate::drivers::traits::ConnConfig;

#[tauri::command]
pub async fn progressive_discovery(
    state: tauri::State<'_, crate::AppState>,
    input: Option<Value>,
) -> Result<Value, String> {
    let driver = state.registry.get("mssql")?;
    let input = input.unwrap_or(json!({}));

    let auth = input["auth"].as_str().unwrap_or("integrated");
    let username = input["username"].as_str();
    let password = input["password"].as_str();
    let max_level = input["maxLevel"].as_str().unwrap_or("full");
    let progressive = input["progressive"].as_bool().unwrap_or(false);

    crate::services::discovery_service::progressive_discovery(
        driver.as_ref(),
        auth,
        username,
        password,
        max_level,
        false,
        progressive,
    )
    .await
}

#[tauri::command]
pub async fn full_discovery(
    state: tauri::State<'_, crate::AppState>,
    input: Option<Value>,
) -> Result<Value, String> {
    let driver = state.registry.get("mssql")?;
    let input = input.unwrap_or(json!({}));

    let auth = input["auth"].as_str().unwrap_or("integrated");
    let username = input["username"].as_str();
    let password = input["password"].as_str();

    driver.discover_servers(None, true, auth, username, password).await
}

#[tauri::command]
pub async fn discover_databases(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    // Determine driver from input or stored connection
    let (driver, config) = if let Some(conn_id) = input["connection_id"].as_str() {
        let (driver, config) = {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            // Resolve driver first to get its default database (master for MSSQL, postgres for PG)
            let conn = crate::repositories::connections::get_connection(&db, conn_id)?
                .ok_or("Connection not found")?;
            let db_type = conn["database_type"].as_str().unwrap_or("mssql");
            let drv = state.registry.get(db_type)?;
            let default_db = drv.default_database().to_string();
            crate::drivers::resolve::resolve_connection(&db, &state.registry, conn_id, &default_db)?
        };
        (driver, config)
    } else {
        let db_type = input["database_type"].as_str().unwrap_or("mssql");
        let driver = state.registry.get(db_type)?;
        let default_db = driver.default_database();

        let server_name = input["server"]
            .as_str()
            .ok_or("server is required")?;
        let port = input["port"].as_i64().unwrap_or(driver.default_port() as i64);
        let auth = input["auth"].as_str().unwrap_or("integrated");
        let username = input["username"].as_str();
        let password = input["password"].as_str();

        let mut params = HashMap::new();
        params.insert("host".to_string(), server_name.to_string());
        params.insert("port".to_string(), port.to_string());
        params.insert("database".to_string(), default_db.to_string());
        params.insert("auth_type".to_string(), auth.to_string());
        if let Some(u) = username {
            params.insert("username".to_string(), u.to_string());
        }
        if let Some(p) = password {
            params.insert("password".to_string(), p.to_string());
        }
        (driver, ConnConfig::from_map(params))
    };

    let raw = crate::services::discovery_service::get_databases_from_server(
        driver.as_ref(),
        &config,
    )
    .await?;

    let empty = vec![];
    let db_list = raw.as_array().unwrap_or(&empty);
    let is_object_array = db_list.first().map(|v| v.is_object()).unwrap_or(false);

    let mut databases: Vec<Value> = Vec::new();
    for db in db_list {
        let name = if is_object_array {
            db["name"].as_str().unwrap_or("").to_string()
        } else {
            db.as_str().unwrap_or("").to_string()
        };

        if name.is_empty() {
            continue;
        }

        databases.push(json!({
            "name": name,
            "displayName": name,
        }));
    }

    let total = databases.len();
    Ok(json!({
        "success": true,
        "databases": databases,
        "total": total,
        "message": format!("{} databases found", total),
    }))
}

#[tauri::command]
pub async fn manual_discovery(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let db_type = input["database_type"].as_str().unwrap_or("mssql");
    let driver = state.registry.get(db_type)?;

    let server = input["server"]
        .as_str()
        .ok_or("server is required")?;
    let port = input["port"].as_i64().unwrap_or(driver.default_port() as i64);
    let auth = input["auth"].as_str().unwrap_or("integrated");
    let username = input["username"].as_str();
    let password = input["password"].as_str();

    let mut params = HashMap::new();
    params.insert("host".to_string(), server.to_string());
    params.insert("port".to_string(), port.to_string());
    params.insert("database".to_string(), driver.default_database().to_string());
    params.insert("auth_type".to_string(), auth.to_string());
    if let Some(u) = username {
        params.insert("username".to_string(), u.to_string());
    }
    if let Some(p) = password {
        params.insert("password".to_string(), p.to_string());
    }

    let test_config = ConnConfig::from_map(params);

    let test_result = match driver.test_connection(&test_config).await {
        Ok(result) => {
            let version = result.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
            json!({
                "ok": true,
                "message": "Connection successful",
                "serverVersion": version,
            })
        }
        Err(e) => json!({ "ok": false, "message": e }),
    };

    let ok = test_result["ok"].as_bool().unwrap_or(false);

    if !ok {
        return Ok(json!({
            "success": false,
            "level": "manual",
            "servers": [],
            "scanTime": 0,
            "message": test_result["message"],
            "autoSelected": false,
            "selectedServer": null,
            "recommendedDatabase": null,
        }));
    }

    let databases = crate::services::discovery_service::get_databases_from_server(
        driver.as_ref(),
        &test_config,
    )
    .await?;

    let version = test_result["serverVersion"].as_str().unwrap_or("").to_string();

    let empty = vec![];
    let db_list = databases.as_array().unwrap_or(&empty);
    let db_names: Vec<String> = db_list
        .iter()
        .filter_map(|d| {
            d.as_str()
                .map(|s| s.to_string())
                .or_else(|| d["name"].as_str().map(|s| s.to_string()))
        })
        .collect();

    let display_name = server.to_uppercase();
    let server_obj = json!({
        "id": format!("manual-{}-{}", server, port),
        "displayName": display_name,
        "hostname": server,
        "originalHostname": server,
        "ip": server,
        "port": port,
        "instance": null,
        "version": version,
        "verificationLevel": "L3",
        "responseTime": null,
        "databases": db_names,
        "priority": 100,
        "error": null,
    });

    Ok(json!({
        "success": true,
        "level": "manual",
        "servers": [server_obj],
        "scanTime": 0,
        "message": "Connection successful",
        "autoSelected": false,
        "selectedServer": server_obj,
        "recommendedDatabase": null,
    }))
}
