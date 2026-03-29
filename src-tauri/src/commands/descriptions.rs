use serde_json::{json, Value};

#[tauri::command]
pub async fn parse_descriptions(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let default_schema = {
        let conn = crate::repositories::connections::get_connection(&db, &connection_id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        state.registry.get(db_type).map(|d| d.default_schema().to_string()).unwrap_or_else(|_| "dbo".to_string())
    };
    crate::services::description_parser_service::parse_and_store(
        &db,
        &connection_id,
        &database_name,
        &default_schema,
    )
}

#[tauri::command]
pub async fn get_descriptions(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    status: Option<String>,
    search: Option<String>,
    object: Option<String>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let filters = json!({
        "status": status.as_deref().unwrap_or("all"),
        "search": search,
        "objectName": object,
    });
    let rows = crate::repositories::parsed_descriptions::get_descriptions(
        &db,
        &connection_id,
        &database_name,
        Some(&filters),
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn get_description_stats(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::parsed_descriptions::get_description_stats(
        &db,
        &connection_id,
        &database_name,
    )
}

#[tauri::command]
pub async fn get_description_objects(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = crate::repositories::parsed_descriptions::get_distinct_objects(
        &db,
        &connection_id,
        &database_name,
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn update_description_status(
    state: tauri::State<'_, crate::AppState>,
    _connection_id: String,
    _database_name: String,
    desc_id: i64,
    input: Value,
) -> Result<Value, String> {
    let status = input["status"]
        .as_str()
        .ok_or("status is required")?;
    let confirmed_description = input["confirmed_description"].as_str();

    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::parsed_descriptions::update_status(
        &db,
        desc_id,
        status,
        confirmed_description,
    )?;
    Ok(json!({"ok": true, "id": desc_id}))
}

#[tauri::command]
pub async fn bulk_update_description_status(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let ids: Vec<i64> = input["ids"]
        .as_array()
        .ok_or("ids array is required")?
        .iter()
        .filter_map(|v| v.as_i64())
        .collect();
    let status = input["status"]
        .as_str()
        .ok_or("status is required")?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::parsed_descriptions::bulk_update_status(&db, &ids, status)?;
    Ok(json!({"ok": true, "updated": ids.len()}))
}
