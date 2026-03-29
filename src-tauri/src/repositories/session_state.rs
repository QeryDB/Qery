use rusqlite::{Connection, params};
use std::collections::HashMap;

pub fn get_by_prefix(db: &Connection, prefix: &str) -> Result<HashMap<String, String>, String> {
    let pattern = format!("{}%", prefix);
    let mut stmt = db
        .prepare("SELECT key, value FROM session_state WHERE key LIKE ?")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn set(db: &Connection, key: &str, value: &str) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO session_state (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete(db: &Connection, key: &str) -> Result<bool, String> {
    let changes = db
        .execute("DELETE FROM session_state WHERE key = ?", params![key])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

pub fn delete_by_prefix(db: &Connection, prefix: &str) -> Result<u64, String> {
    let pattern = format!("{}%", prefix);
    let changes = db
        .execute("DELETE FROM session_state WHERE key LIKE ?", params![pattern])
        .map_err(|e| e.to_string())?;
    Ok(changes as u64)
}
