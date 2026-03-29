use serde_json::{json, Value};

#[tauri::command]
pub async fn get_annotations(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = crate::repositories::annotations::get_annotations(
        &db,
        &connection_id,
        &database_name,
        &table_name,
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn upsert_annotation(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    input: Value,
) -> Result<Value, String> {
    let _column_name = input["column_name"]
        .as_str()
        .ok_or("column_name is required")?;
    let _note = input["note"]
        .as_str()
        .ok_or("note is required")?;

    // Build the full input value for the repository
    let mut full_input = input.clone();
    if let Some(obj) = full_input.as_object_mut() {
        obj.insert("connection_id".to_string(), json!(connection_id));
        obj.insert("database_name".to_string(), json!(database_name));
        obj.insert("table_name".to_string(), json!(table_name));
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = crate::repositories::annotations::upsert_annotation(&db, &full_input)?;

    Ok(result)
}

#[tauri::command]
pub async fn delete_annotation(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let deleted = crate::repositories::annotations::delete_annotation(&db, &id)?;
    if !deleted {
        return Err("Annotation not found".to_string());
    }

    Ok(json!({"ok": true}))
}
