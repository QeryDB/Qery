use rusqlite::{Connection, Row, params};
use serde_json::{Value, Map};
use uuid::Uuid;
use crate::db::encryption;

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

use base64::Engine as _;

pub fn list_connections(db: &Connection) -> Result<Vec<Value>, String> {
    query_all(
        db,
        "SELECT * FROM connections ORDER BY sort_order ASC, is_favorite DESC, name ASC",
        &[],
    )
}

pub fn get_connection(db: &Connection, id: &str) -> Result<Option<Value>, String> {
    query_one(db, "SELECT * FROM connections WHERE id = ?", &[&id])
}

pub fn create_connection(db: &Connection, input: &Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // If source_connection_id is provided, copy the encrypted password from
    // the source connection (used when creating from a saved server in discovery)
    let encrypted_password = if let Some(source_id) = input.get("source_connection_id").and_then(|v| v.as_str()) {
        let source = get_connection(db, source_id)?
            .ok_or("Source connection not found")?;
        source.get("encrypted_password")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    } else {
        input
            .get("password")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|p| encryption::encrypt(p))
            .transpose()?
    };

    let name = input.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let server = input.get("server").and_then(|v| v.as_str()).unwrap_or("");
    let port = input.get("port").and_then(|v| v.as_i64()).unwrap_or(1433);
    let database_name = input.get("database_name").and_then(|v| v.as_str());
    let auth_type = input
        .get("auth_type")
        .and_then(|v| v.as_str())
        .unwrap_or("integrated");
    let username = input.get("username").and_then(|v| v.as_str());
    let database_type = input.get("database_type").and_then(|v| v.as_str()).unwrap_or("mssql");
    let color = input.get("color").and_then(|v| v.as_str());
    let is_favorite = input
        .get("is_favorite")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    db.execute(
        "INSERT INTO connections (id, name, server, port, database_name, auth_type, username, encrypted_password, database_type, color, is_favorite, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            name,
            server,
            port,
            database_name,
            auth_type,
            username,
            encrypted_password,
            database_type,
            color,
            is_favorite as i32,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_connection(db, &id)?
        .ok_or_else(|| "Failed to read back created connection".to_string())
}

pub fn update_connection(db: &Connection, id: &str, input: &Value) -> Result<Option<Value>, String> {
    let existing = match get_connection(db, id)? {
        Some(v) => v,
        None => return Ok(None),
    };

    let now = chrono::Utc::now().to_rfc3339();

    // Password handling: if input has "password" key, use it (encrypt or null).
    // Otherwise keep existing encrypted_password.
    let encrypted_password: Option<String> = if input.get("password").is_some() {
        input
            .get("password")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|p| encryption::encrypt(p))
            .transpose()?
    } else {
        existing
            .get("encrypted_password")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    };

    let name = input
        .get("name")
        .and_then(|v| v.as_str())
        .or_else(|| existing.get("name").and_then(|v| v.as_str()))
        .unwrap_or("");
    let server = input
        .get("server")
        .and_then(|v| v.as_str())
        .or_else(|| existing.get("server").and_then(|v| v.as_str()))
        .unwrap_or("");
    let port = input
        .get("port")
        .and_then(|v| v.as_i64())
        .or_else(|| existing.get("port").and_then(|v| v.as_i64()))
        .unwrap_or(1433);

    // For fields that can be explicitly set to null, check if the key exists in input
    let database_name: Option<&str> = if input.get("database_name").is_some() {
        input.get("database_name").and_then(|v| v.as_str())
    } else {
        existing.get("database_name").and_then(|v| v.as_str())
    };

    let auth_type = input
        .get("auth_type")
        .and_then(|v| v.as_str())
        .or_else(|| existing.get("auth_type").and_then(|v| v.as_str()))
        .unwrap_or("integrated");

    let username: Option<&str> = if input.get("username").is_some() {
        input.get("username").and_then(|v| v.as_str())
    } else {
        existing.get("username").and_then(|v| v.as_str())
    };

    let color: Option<&str> = if input.get("color").is_some() {
        input.get("color").and_then(|v| v.as_str())
    } else {
        existing.get("color").and_then(|v| v.as_str())
    };

    let is_favorite: bool = if input.get("is_favorite").is_some() {
        input
            .get("is_favorite")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    } else {
        existing
            .get("is_favorite")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    };

    db.execute(
        "UPDATE connections SET
            name = ?1, server = ?2, port = ?3, database_name = ?4, auth_type = ?5,
            username = ?6, encrypted_password = ?7, color = ?8, is_favorite = ?9, updated_at = ?10
         WHERE id = ?11",
        params![
            name,
            server,
            port,
            database_name,
            auth_type,
            username,
            encrypted_password,
            color,
            is_favorite as i32,
            now,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_connection(db, id)
}

pub fn delete_connection(db: &Connection, id: &str) -> Result<bool, String> {
    let changes = db
        .execute("DELETE FROM connections WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changes > 0)
}

pub fn reorder_connections(db: &Connection, ids: &[String]) -> Result<(), String> {
    let tx = db
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = db
            .prepare("UPDATE connections SET sort_order = ? WHERE id = ?")
            .map_err(|e| e.to_string())?;

        for (index, id) in ids.iter().enumerate() {
            stmt.execute(params![index as i64, id])
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

pub fn update_last_connected(db: &Connection, id: &str) -> Result<(), String> {
    db.execute(
        "UPDATE connections SET last_connected_at = datetime('now') WHERE id = ?",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_connection_password(db: &Connection, id: &str) -> Result<Option<String>, String> {
    let conn = get_connection(db, id)?;
    match conn {
        Some(row) => {
            let enc = row
                .get("encrypted_password")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty());
            match enc {
                Some(encrypted) => Ok(Some(encryption::decrypt(encrypted)?)),
                None => Ok(None),
            }
        }
        None => Ok(None),
    }
}
