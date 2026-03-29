use serde_json::{json, Value};

#[tauri::command]
pub async fn get_favorites(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = crate::repositories::favorites::get_favorites(
        &db,
        &connection_id,
        &database_name,
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn add_favorite(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    input: Value,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let default_schema = {
        let conn = crate::repositories::connections::get_connection(&db, &connection_id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        state.registry.get(db_type).map(|d| d.default_schema().to_string()).unwrap_or_else(|_| "dbo".to_string())
    };
    let schema = input["schema"]
        .as_str()
        .unwrap_or(&default_schema);
    let table = input["table"]
        .as_str()
        .ok_or("table is required")?;
    crate::repositories::favorites::add_favorite(
        &db,
        &connection_id,
        &database_name,
        schema,
        table,
    )
}

#[tauri::command]
pub async fn remove_favorite(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    schema_name: String,
    table_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let removed = crate::repositories::favorites::remove_favorite(
        &db,
        &connection_id,
        &database_name,
        &schema_name,
        &table_name,
    )?;
    if !removed {
        return Err("Favorite not found".to_string());
    }
    Ok(json!({"ok": true}))
}
