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

pub fn get_cached_schema(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<Option<Value>, String> {
    query_one(
        db,
        "SELECT * FROM cached_schemas WHERE connection_id = ? AND database_name = ?",
        &[&connection_id, &database_name],
    )
}

pub fn set_cached_schema(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    schema_json: &str,
) -> Result<(), String> {
    let existing = get_cached_schema(db, connection_id, database_name)?;

    if let Some(row) = existing {
        let id = row
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        db.execute(
            "UPDATE cached_schemas SET schema_json = ?, cached_at = datetime('now') WHERE id = ?",
            params![schema_json, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO cached_schemas (id, connection_id, database_name, schema_json) VALUES (?, ?, ?, ?)",
            params![id, connection_id, database_name, schema_json],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn delete_cached_schema(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<(), String> {
    db.execute(
        "DELETE FROM cached_schemas WHERE connection_id = ? AND database_name = ?",
        params![connection_id, database_name],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_all_cached_schemas(db: &Connection, connection_id: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM cached_schemas WHERE connection_id = ?",
        params![connection_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
