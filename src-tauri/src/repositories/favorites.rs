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

pub fn get_favorites(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<Vec<Value>, String> {
    query_all(
        db,
        "SELECT * FROM table_favorites
         WHERE connection_id = ? AND database_name = ?
         ORDER BY schema_name, table_name",
        &[&connection_id, &database_name],
    )
}

pub fn add_favorite(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    schema_name: &str,
    table_name: &str,
) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();

    db.execute(
        "INSERT OR IGNORE INTO table_favorites (id, connection_id, database_name, schema_name, table_name)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, connection_id, database_name, schema_name, table_name],
    )
    .map_err(|e| e.to_string())?;

    // Return the row (which may already exist if INSERT OR IGNORE skipped)
    query_one(
        db,
        "SELECT * FROM table_favorites
         WHERE connection_id = ? AND database_name = ? AND schema_name = ? AND table_name = ?",
        &[&connection_id, &database_name, &schema_name, &table_name],
    )?
    .ok_or_else(|| "Failed to read back favorite".to_string())
}

pub fn remove_favorite(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    schema_name: &str,
    table_name: &str,
) -> Result<bool, String> {
    let changes = db
        .execute(
            "DELETE FROM table_favorites
             WHERE connection_id = ? AND database_name = ? AND schema_name = ? AND table_name = ?",
            params![connection_id, database_name, schema_name, table_name],
        )
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}
