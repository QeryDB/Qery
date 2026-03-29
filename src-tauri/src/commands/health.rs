use serde_json::{json, Value};

#[tauri::command]
pub async fn health_check(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Value, String> {
    let timestamp = chrono::Utc::now().to_rfc3339();

    // Check SQLite connection
    let sqlite_ok = {
        match state.db.lock() {
            Ok(db) => db
                .execute_batch("SELECT 1")
                .is_ok(),
            Err(_) => false,
        }
    };

    Ok(json!({
        "status": if sqlite_ok { "ok" } else { "degraded" },
        "timestamp": timestamp,
        "sqlite": sqlite_ok,
        "mssql": true,
    }))
}
