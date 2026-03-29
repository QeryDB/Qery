use rusqlite::{Connection, Row, params};
use serde_json::{Value, Map};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn row_to_json(row: &Row, column_names: &[String]) -> Result<Value, rusqlite::Error> {
    let mut map = Map::new();
    for (i, name) in column_names.iter().enumerate() {
        let val: Value = match row.get_ref(i)? {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(n) => {
                Value::Number(serde_json::Number::from(n))
            }
            rusqlite::types::ValueRef::Real(f) => {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            }
            rusqlite::types::ValueRef::Text(s) => {
                Value::String(String::from_utf8_lossy(s).to_string())
            }
            rusqlite::types::ValueRef::Blob(b) => {
                Value::String(base64::engine::general_purpose::STANDARD.encode(b))
            }
        };
        map.insert(name.clone(), val);
    }
    Ok(Value::Object(map))
}

fn query_all(db: &Connection, sql: &str, params: &[&dyn rusqlite::types::ToSql]) -> Result<Vec<Value>, String> {
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt
        .query_map(params, |row| row_to_json(row, &column_names))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn query_one(db: &Connection, sql: &str, params: &[&dyn rusqlite::types::ToSql]) -> Result<Option<Value>, String> {
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row_to_json(row, &column_names).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

use base64::Engine as _;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn add_query_history(db: &Connection, entry: &Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();

    let connection_id = entry
        .get("connection_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let database_name = entry.get("database_name").and_then(|v| v.as_str());
    let sql_text = entry
        .get("sql_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let duration_ms = entry.get("duration_ms").and_then(|v| v.as_i64());
    let row_count = entry.get("row_count").and_then(|v| v.as_i64());
    let status = entry
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("success");
    let error_message = entry.get("error_message").and_then(|v| v.as_str());

    db.execute(
        "INSERT INTO query_history (id, connection_id, database_name, sql_text, duration_ms, row_count, status, error_message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            connection_id,
            database_name,
            sql_text,
            duration_ms,
            row_count,
            status,
            error_message,
        ],
    )
    .map_err(|e| e.to_string())?;

    query_one(db, "SELECT * FROM query_history WHERE id = ?", &[&id])?
        .ok_or_else(|| "Failed to read back inserted query history".to_string())
}

pub fn get_query_history(
    db: &Connection,
    connection_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, String> {
    query_all(
        db,
        "SELECT * FROM query_history WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ? OFFSET ?",
        &[&connection_id, &limit, &offset],
    )
}

pub fn clear_query_history(db: &Connection, connection_id: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM query_history WHERE connection_id = ?",
        params![connection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
