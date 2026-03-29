use serde_json::Value;
use tokio_postgres::{Client, Row};
use postgres_types::Type;

/// Execute a SQL query and return results as a JSON array of objects.
pub async fn execute_query_to_json(client: &Client, sql: &str) -> Result<Value, String> {
    let rows = client
        .simple_query(sql)
        .await
        .map_err(|e| {
            let detail = e.as_db_error().map(|db| format!("{}: {}", db.severity(), db.message())).unwrap_or_else(|| e.to_string());
            format!("Query failed: {}", detail)
        })?;

    let mut result = Vec::new();

    for msg in rows {
        if let tokio_postgres::SimpleQueryMessage::Row(row) = msg {
            let mut obj = serde_json::Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                let val = row.get(i);
                let json_val = match val {
                    None => Value::Null,
                    Some(s) => string_to_typed_json(s, col.name()),
                };
                obj.insert(col.name().to_string(), json_val);
            }
            result.push(Value::Object(obj));
        }
    }

    Ok(Value::Array(result))
}

/// Execute a query using the extended protocol (typed results).
pub async fn execute_typed_query(client: &Client, sql: &str) -> Result<Value, String> {
    let stmt = client
        .prepare(sql)
        .await
        .map_err(|e| format!("Prepare failed: {}", e))?;

    let rows = client
        .query(&stmt, &[])
        .await
        .map_err(|e| {
            let detail = e.as_db_error().map(|db| format!("{}: {}", db.severity(), db.message())).unwrap_or_else(|| e.to_string());
            format!("Query failed: {}", detail)
        })?;

    let mut result = Vec::new();

    for row in &rows {
        let mut obj = serde_json::Map::new();
        for (i, col) in row.columns().iter().enumerate() {
            let json_val = column_to_json(row, i, col.type_());
            obj.insert(col.name().to_string(), json_val);
        }
        result.push(Value::Object(obj));
    }

    Ok(Value::Array(result))
}

/// Convert a typed PostgreSQL column value to JSON.
fn column_to_json(row: &Row, idx: usize, pg_type: &Type) -> Value {
    // Try typed extraction based on PostgreSQL type
    match *pg_type {
        // Booleans
        Type::BOOL => row.try_get::<_, bool>(idx).ok().map(Value::Bool).unwrap_or(Value::Null),

        // Integers
        Type::INT2 => row.try_get::<_, i16>(idx).ok().map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
        Type::INT4 => row.try_get::<_, i32>(idx).ok().map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
        Type::INT8 => row.try_get::<_, i64>(idx).ok().map(|v| Value::Number(v.into())).unwrap_or(Value::Null),
        Type::OID => row.try_get::<_, u32>(idx).ok().map(|v| Value::Number(v.into())).unwrap_or(Value::Null),

        // Floats
        Type::FLOAT4 => row.try_get::<_, f32>(idx).ok()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(Value::Number).unwrap_or(Value::Null),
        Type::FLOAT8 => row.try_get::<_, f64>(idx).ok()
            .and_then(|v| serde_json::Number::from_f64(v))
            .map(Value::Number).unwrap_or(Value::Null),
        Type::NUMERIC => row.try_get::<_, String>(idx).ok()
            .and_then(|s| s.parse::<f64>().ok())
            .and_then(|v| serde_json::Number::from_f64(v))
            .map(Value::Number).unwrap_or(Value::Null),

        // Strings
        Type::TEXT | Type::VARCHAR | Type::CHAR | Type::NAME | Type::BPCHAR => {
            row.try_get::<_, String>(idx).ok().map(Value::String).unwrap_or(Value::Null)
        }

        // UUID
        Type::UUID => row.try_get::<_, uuid::Uuid>(idx).ok()
            .map(|v| Value::String(v.to_string())).unwrap_or(Value::Null),

        // Date/time
        Type::TIMESTAMP => row.try_get::<_, chrono::NaiveDateTime>(idx).ok()
            .map(|v| Value::String(v.format("%Y-%m-%dT%H:%M:%S%.3f").to_string())).unwrap_or(Value::Null),
        Type::TIMESTAMPTZ => row.try_get::<_, chrono::DateTime<chrono::Utc>>(idx).ok()
            .map(|v| Value::String(v.format("%Y-%m-%dT%H:%M:%S%.3f").to_string())).unwrap_or(Value::Null),
        Type::DATE => row.try_get::<_, chrono::NaiveDate>(idx).ok()
            .map(|v| Value::String(v.format("%Y-%m-%d").to_string())).unwrap_or(Value::Null),
        Type::TIME => row.try_get::<_, chrono::NaiveTime>(idx).ok()
            .map(|v| Value::String(v.format("%H:%M:%S%.3f").to_string())).unwrap_or(Value::Null),

        // JSON
        Type::JSON | Type::JSONB => row.try_get::<_, serde_json::Value>(idx).ok().unwrap_or(Value::Null),

        // Binary
        Type::BYTEA => row.try_get::<_, Vec<u8>>(idx).ok()
            .map(|v| Value::String(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &v)))
            .unwrap_or(Value::Null),

        // Fallback: try as string
        _ => row.try_get::<_, String>(idx).ok().map(Value::String).unwrap_or(Value::Null),
    }
}

/// Best-effort conversion of a SimpleQuery string result to a typed JSON value.
fn string_to_typed_json(s: &str, _col_name: &str) -> Value {
    // Try integer
    if let Ok(n) = s.parse::<i64>() {
        return Value::Number(n.into());
    }
    // Try float
    if let Ok(f) = s.parse::<f64>() {
        if let Some(n) = serde_json::Number::from_f64(f) {
            return Value::Number(n);
        }
    }
    // Try boolean
    match s {
        "t" | "true" => return Value::Bool(true),
        "f" | "false" => return Value::Bool(false),
        _ => {}
    }
    Value::String(s.to_string())
}
