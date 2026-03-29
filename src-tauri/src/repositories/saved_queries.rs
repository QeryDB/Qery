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

pub fn list_saved_queries(
    db: &Connection,
    connection_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    if let Some(cid) = connection_id {
        query_all(
            db,
            "SELECT * FROM saved_queries WHERE connection_id = ? OR connection_id IS NULL ORDER BY updated_at DESC",
            &[&cid],
        )
    } else {
        query_all(
            db,
            "SELECT * FROM saved_queries ORDER BY updated_at DESC",
            &[],
        )
    }
}

pub fn get_saved_query(db: &Connection, id: &str) -> Result<Option<Value>, String> {
    query_one(db, "SELECT * FROM saved_queries WHERE id = ?", &[&id])
}

pub fn create_saved_query(db: &Connection, input: &Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let connection_id = input.get("connection_id").and_then(|v| v.as_str());
    let title = input
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let description = input.get("description").and_then(|v| v.as_str());
    let sql_text = input
        .get("sql_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let tags = input.get("tags").and_then(|v| v.as_str());
    let project_name = input.get("project_name").and_then(|v| v.as_str());
    let folder_name = input.get("folder_name").and_then(|v| v.as_str());

    db.execute(
        "INSERT INTO saved_queries (id, connection_id, title, description, sql_text, tags, project_name, folder_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            connection_id,
            title,
            description,
            sql_text,
            tags,
            project_name,
            folder_name,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_saved_query(db, &id)?
        .ok_or_else(|| "Failed to read back created saved query".to_string())
}

pub fn update_saved_query(
    db: &Connection,
    id: &str,
    input: &Value,
) -> Result<Option<Value>, String> {
    let existing = match get_saved_query(db, id)? {
        Some(v) => v,
        None => return Ok(None),
    };

    // For nullable fields, check if the key exists in input to allow explicit null
    let connection_id: Option<&str> = if input.get("connection_id").is_some() {
        input.get("connection_id").and_then(|v| v.as_str())
    } else {
        existing.get("connection_id").and_then(|v| v.as_str())
    };

    let title = input
        .get("title")
        .and_then(|v| v.as_str())
        .or_else(|| existing.get("title").and_then(|v| v.as_str()))
        .unwrap_or("");

    let description: Option<&str> = if input.get("description").is_some() {
        input.get("description").and_then(|v| v.as_str())
    } else {
        existing.get("description").and_then(|v| v.as_str())
    };

    let sql_text = input
        .get("sql_text")
        .and_then(|v| v.as_str())
        .or_else(|| existing.get("sql_text").and_then(|v| v.as_str()))
        .unwrap_or("");

    let tags: Option<&str> = if input.get("tags").is_some() {
        input.get("tags").and_then(|v| v.as_str())
    } else {
        existing.get("tags").and_then(|v| v.as_str())
    };

    let project_name: Option<&str> = if input.get("project_name").is_some() {
        input.get("project_name").and_then(|v| v.as_str())
    } else {
        existing.get("project_name").and_then(|v| v.as_str())
    };

    let folder_name: Option<&str> = if input.get("folder_name").is_some() {
        input.get("folder_name").and_then(|v| v.as_str())
    } else {
        existing.get("folder_name").and_then(|v| v.as_str())
    };

    db.execute(
        "UPDATE saved_queries SET
            connection_id = ?1, title = ?2, description = ?3, sql_text = ?4, tags = ?5,
            project_name = ?6, folder_name = ?7, updated_at = datetime('now')
         WHERE id = ?8",
        params![
            connection_id,
            title,
            description,
            sql_text,
            tags,
            project_name,
            folder_name,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_saved_query(db, id)
}

pub fn delete_saved_query(db: &Connection, id: &str) -> Result<bool, String> {
    let changes = db
        .execute("DELETE FROM saved_queries WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}
