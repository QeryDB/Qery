use rusqlite::{Connection, Row, params};
use serde_json::{Value, Map};
use std::collections::HashSet;
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
                if name == "is_favorite" || name == "is_auto_detected" || name == "is_dismissed" {
                    Value::Bool(n != 0)
                } else {
                    Value::Number(serde_json::Number::from(n))
                }
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

pub fn list_relationships(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    table_name: Option<&str>,
) -> Result<Vec<Value>, String> {
    if let Some(tbl) = table_name {
        query_all(
            db,
            "SELECT * FROM table_relationships
             WHERE connection_id = ? AND database_name = ?
               AND (from_table = ? OR to_table = ?)
             ORDER BY created_at DESC",
            &[&connection_id, &database_name, &tbl, &tbl],
        )
    } else {
        query_all(
            db,
            "SELECT * FROM table_relationships WHERE connection_id = ? AND database_name = ? ORDER BY created_at DESC",
            &[&connection_id, &database_name],
        )
    }
}

pub fn create_relationship(db: &Connection, input: &Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let connection_id = input
        .get("connection_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let database_name = input
        .get("database_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let from_table = input
        .get("from_table")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let from_column = input
        .get("from_column")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let to_table = input
        .get("to_table")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let to_column = input
        .get("to_column")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let description = input.get("description").and_then(|v| v.as_str());

    db.execute(
        "INSERT INTO table_relationships (id, connection_id, database_name, from_table, from_column, to_table, to_column, description, is_auto_detected, is_dismissed, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 0, ?9)",
        params![
            id,
            connection_id,
            database_name,
            from_table,
            from_column,
            to_table,
            to_column,
            description,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    query_one(
        db,
        "SELECT * FROM table_relationships WHERE id = ?",
        &[&id],
    )?
    .ok_or_else(|| "Failed to read back created relationship".to_string())
}

pub fn dismiss_relationship(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    from_table: &str,
    from_col: &str,
    to_table: &str,
    to_col: &str,
) -> Result<(), String> {
    // Check if row already exists
    let existing = query_one(
        db,
        "SELECT id FROM table_relationships
         WHERE connection_id = ? AND database_name = ?
           AND from_table = ? AND from_column = ?
           AND to_table = ? AND to_column = ?",
        &[
            &connection_id,
            &database_name,
            &from_table,
            &from_col,
            &to_table,
            &to_col,
        ],
    )?;

    if let Some(row) = existing {
        let id = row
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        db.execute(
            "UPDATE table_relationships SET is_dismissed = 1 WHERE id = ?",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO table_relationships (id, connection_id, database_name, from_table, from_column, to_table, to_column, is_auto_detected, is_dismissed, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8)",
            params![
                id,
                connection_id,
                database_name,
                from_table,
                from_col,
                to_table,
                to_col,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn undismiss_relationship(db: &Connection, id: &str) -> Result<(), String> {
    db.execute(
        "UPDATE table_relationships SET is_dismissed = 0 WHERE id = ?",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_relationship(db: &Connection, id: &str) -> Result<bool, String> {
    let changes = db
        .execute(
            "DELETE FROM table_relationships WHERE id = ? AND is_auto_detected = 0",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

pub fn get_dismissed_keys(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<HashSet<String>, String> {
    let mut stmt = db
        .prepare(
            "SELECT from_table, from_column, to_table, to_column FROM table_relationships
             WHERE connection_id = ? AND database_name = ? AND is_dismissed = 1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![connection_id, database_name], |row| {
            let from_table: String = row.get(0)?;
            let from_column: String = row.get(1)?;
            let to_table: String = row.get(2)?;
            let to_column: String = row.get(3)?;
            Ok(make_ghost_key(&from_table, &from_column, &to_table, &to_column))
        })
        .map_err(|e| e.to_string())?;

    let mut set = HashSet::new();
    for key in rows {
        set.insert(key.map_err(|e| e.to_string())?);
    }
    Ok(set)
}

pub fn make_ghost_key(from_table: &str, from_col: &str, to_table: &str, to_col: &str) -> String {
    format!(
        "{}|{}|{}|{}",
        from_table.to_lowercase(),
        from_col.to_lowercase(),
        to_table.to_lowercase(),
        to_col.to_lowercase()
    )
}
