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

pub fn get_annotations(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
) -> Result<Vec<Value>, String> {
    query_all(
        db,
        "SELECT * FROM table_annotations
         WHERE connection_id = ? AND database_name = ? AND table_name = ?
         ORDER BY column_name IS NULL DESC, column_name ASC",
        &[&connection_id, &database_name, &table_name],
    )
}

pub fn upsert_annotation(db: &Connection, input: &Value) -> Result<Value, String> {
    let connection_id = input
        .get("connection_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let database_name = input
        .get("database_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let table_name = input
        .get("table_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let col_name: Option<&str> = input
        .get("column_name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let note = input
        .get("note")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let now = chrono::Utc::now().to_rfc3339();

    // Check for existing annotation by composite key.
    // The SQL differs depending on whether column_name is NULL or not.
    let existing: Option<Value> = if let Some(cn) = col_name {
        query_one(
            db,
            "SELECT id FROM table_annotations
             WHERE connection_id = ? AND database_name = ? AND table_name = ? AND column_name = ?",
            &[&connection_id, &database_name, &table_name, &cn],
        )?
    } else {
        query_one(
            db,
            "SELECT id FROM table_annotations
             WHERE connection_id = ? AND database_name = ? AND table_name = ? AND column_name IS NULL",
            &[&connection_id, &database_name, &table_name],
        )?
    };

    if let Some(row) = existing {
        let id = row
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        db.execute(
            "UPDATE table_annotations SET note = ?, updated_at = ? WHERE id = ?",
            params![note, now, id],
        )
        .map_err(|e| e.to_string())?;

        query_one(
            db,
            "SELECT * FROM table_annotations WHERE id = ?",
            &[&id],
        )?
        .ok_or_else(|| "Failed to read back updated annotation".to_string())
    } else {
        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO table_annotations (id, connection_id, database_name, table_name, column_name, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                connection_id,
                database_name,
                table_name,
                col_name,
                note,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        query_one(
            db,
            "SELECT * FROM table_annotations WHERE id = ?",
            &[&id as &dyn rusqlite::types::ToSql],
        )?
        .ok_or_else(|| "Failed to read back created annotation".to_string())
    }
}

pub fn delete_annotation(db: &Connection, id: &str) -> Result<bool, String> {
    let changes = db
        .execute(
            "DELETE FROM table_annotations WHERE id = ?",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}
