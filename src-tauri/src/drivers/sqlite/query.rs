use rusqlite::{Connection, OpenFlags, types::ValueRef};
use serde_json::Value;

/// Open a SQLite connection with appropriate flags.
pub fn open_connection(path: &str, readonly: bool) -> Result<Connection, String> {
    let flags = if readonly {
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX
    } else {
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX
    };

    Connection::open_with_flags(path, flags)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))
}

/// Execute a SQL query and return results as a JSON array of objects.
pub fn execute_query_to_json(conn: &Connection, sql: &str) -> Result<Value, String> {
    let mut stmt = conn.prepare(sql)
        .map_err(|e| format!("Query failed: {}", e))?;

    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let mut rows: Vec<Value> = Vec::new();
    let mut query_rows = stmt.query([])
        .map_err(|e| format!("Query failed: {}", e))?;

    while let Some(row) = query_rows.next().map_err(|e| format!("Row read failed: {}", e))? {
        let mut obj = serde_json::Map::new();
        for (i, name) in column_names.iter().enumerate() {
            let val = match row.get_ref(i) {
                Ok(ValueRef::Null) => Value::Null,
                Ok(ValueRef::Integer(n)) => Value::Number(n.into()),
                Ok(ValueRef::Real(f)) => {
                    serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
                Ok(ValueRef::Text(s)) => {
                    Value::String(String::from_utf8_lossy(s).into_owned())
                }
                Ok(ValueRef::Blob(b)) => {
                    Value::String(base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD, b
                    ))
                }
                Err(_) => Value::Null,
            };
            obj.insert(name.clone(), val);
        }
        rows.push(Value::Object(obj));
    }

    Ok(Value::Array(rows))
}
