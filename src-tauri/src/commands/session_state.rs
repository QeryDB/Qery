use serde_json::{json, Value};

#[tauri::command]
pub async fn get_session_state(
    state: tauri::State<'_, crate::AppState>,
    prefix: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let map = crate::repositories::session_state::get_by_prefix(&db, &prefix)?;
    Ok(json!(map))
}

#[tauri::command]
pub async fn set_session_state(
    state: tauri::State<'_, crate::AppState>,
    key: String,
    value: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::session_state::set(&db, &key, &value)?;
    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn delete_session_state(
    state: tauri::State<'_, crate::AppState>,
    key: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::session_state::delete(&db, &key)?;
    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn delete_session_state_prefix(
    state: tauri::State<'_, crate::AppState>,
    prefix: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let count = crate::repositories::session_state::delete_by_prefix(&db, &prefix)?;
    Ok(json!({"ok": true, "deleted": count}))
}
