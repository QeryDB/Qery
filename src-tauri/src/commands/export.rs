use serde_json::{json, Value};

#[tauri::command]
pub async fn export_csv(
    _state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let columns = input["columns"]
        .as_array()
        .ok_or("columns array is required")?;
    let rows = input["rows"]
        .as_array()
        .ok_or("rows array is required")?;

    let csv = crate::services::export_service::to_csv(columns, rows);
    Ok(json!({ "csv": csv }))
}

#[tauri::command]
pub async fn export_json(
    _state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let rows = input["rows"]
        .as_array()
        .ok_or("rows array is required")?;

    let json_str = crate::services::export_service::to_json(rows);
    Ok(json!({ "json": json_str }))
}
