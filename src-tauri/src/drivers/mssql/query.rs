use serde_json::{Map, Value};
use tiberius::{Client, QueryStream, Row, ColumnType};
use tokio::net::TcpStream;
use tokio_util::compat::Compat;

/// Execute a SQL query and return results as a JSON array of objects.
pub async fn execute_query_to_json(
    client: &mut Client<Compat<TcpStream>>,
    sql: &str,
) -> Result<Value, String> {
    let stream = client
        .simple_query(sql)
        .await
        .map_err(|e| format!("Query error: {}", e))?;

    rows_to_json(stream).await
}

/// Convert a QueryStream into a JSON array of row objects.
async fn rows_to_json(mut stream: QueryStream<'_>) -> Result<Value, String> {
    use futures_util::StreamExt;

    let mut rows: Vec<Value> = Vec::new();

    while let Some(item) = stream.next().await {
        match item {
            Ok(tiberius::QueryItem::Row(row)) => {
                let obj = row_to_json_map(&row);
                rows.push(Value::Object(obj));
            }
            Ok(tiberius::QueryItem::Metadata(_)) => {}
            Err(e) => return Err(format!("Stream error: {}", e)),
        }
    }

    Ok(Value::Array(rows))
}

/// Convert a single Row to a JSON Map with column names as keys.
fn row_to_json_map(row: &Row) -> Map<String, Value> {
    let mut map = Map::new();

    for (i, col) in row.columns().iter().enumerate() {
        let name = col.name().to_string();
        let value = column_to_json(row, i, col.column_type());
        map.insert(name, value);
    }

    map
}

/// Convert a column value to the appropriate JSON type.
fn column_to_json(row: &Row, idx: usize, col_type: ColumnType) -> Value {
    // Try to get the value based on the column type
    match col_type {
        // Boolean
        ColumnType::Bit | ColumnType::Bitn => {
            match row.try_get::<bool, _>(idx) {
                Ok(Some(v)) => Value::Bool(v),
                _ => Value::Null,
            }
        }

        // Integer types
        ColumnType::Int1 => {
            match row.try_get::<u8, _>(idx) {
                Ok(Some(v)) => Value::Number(v.into()),
                _ => Value::Null,
            }
        }
        ColumnType::Int2 => {
            match row.try_get::<i16, _>(idx) {
                Ok(Some(v)) => Value::Number(v.into()),
                _ => Value::Null,
            }
        }
        ColumnType::Int4 => {
            match row.try_get::<i32, _>(idx) {
                Ok(Some(v)) => Value::Number(v.into()),
                _ => Value::Null,
            }
        }
        ColumnType::Int8 => {
            match row.try_get::<i64, _>(idx) {
                Ok(Some(v)) => Value::Number(v.into()),
                _ => Value::Null,
            }
        }
        ColumnType::Intn => {
            // Intn can be 1, 2, 4, or 8 bytes - try from largest to smallest
            if let Ok(Some(v)) = row.try_get::<i64, _>(idx) {
                Value::Number(v.into())
            } else if let Ok(Some(v)) = row.try_get::<i32, _>(idx) {
                Value::Number(v.into())
            } else if let Ok(Some(v)) = row.try_get::<i16, _>(idx) {
                Value::Number(v.into())
            } else {
                Value::Null
            }
        }

        // Float types
        ColumnType::Float4 => {
            match row.try_get::<f32, _>(idx) {
                Ok(Some(v)) => {
                    serde_json::Number::from_f64(v as f64)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
                _ => Value::Null,
            }
        }
        ColumnType::Float8 => {
            match row.try_get::<f64, _>(idx) {
                Ok(Some(v)) => {
                    serde_json::Number::from_f64(v)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
                _ => Value::Null,
            }
        }
        ColumnType::Floatn => {
            if let Ok(Some(v)) = row.try_get::<f64, _>(idx) {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else if let Ok(Some(v)) = row.try_get::<f32, _>(idx) {
                serde_json::Number::from_f64(v as f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }

        // Decimal/Money types - read as f64
        ColumnType::Numericn | ColumnType::Decimaln => {
            match row.try_get::<tiberius::numeric::Numeric, _>(idx) {
                Ok(Some(v)) => {
                    let f: f64 = v.into();
                    serde_json::Number::from_f64(f)
                        .map(Value::Number)
                        .unwrap_or(Value::Null)
                }
                _ => Value::Null,
            }
        }
        ColumnType::Money | ColumnType::Money4 => {
            if let Ok(Some(v)) = row.try_get::<f64, _>(idx) {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }

        // String types
        ColumnType::BigVarChar
        | ColumnType::BigChar
        | ColumnType::NVarchar
        | ColumnType::NChar
        | ColumnType::Text
        | ColumnType::NText => {
            match row.try_get::<&str, _>(idx) {
                Ok(Some(v)) => Value::String(v.to_string()),
                _ => Value::Null,
            }
        }

        // XML type
        ColumnType::Xml => {
            match row.try_get::<&str, _>(idx) {
                Ok(Some(v)) => Value::String(v.to_string()),
                _ => Value::Null,
            }
        }

        // GUID
        ColumnType::Guid => {
            match row.try_get::<tiberius::Uuid, _>(idx) {
                Ok(Some(v)) => Value::String(v.to_string()),
                _ => Value::Null,
            }
        }

        // Date/Time types
        ColumnType::Datetime | ColumnType::Datetime2 | ColumnType::Datetime4
        | ColumnType::Datetimen | ColumnType::DatetimeOffsetn => {
            if let Ok(Some(v)) = row.try_get::<chrono::NaiveDateTime, _>(idx) {
                Value::String(v.format("%Y-%m-%dT%H:%M:%S%.3f").to_string())
            } else {
                Value::Null
            }
        }
        ColumnType::Daten => {
            if let Ok(Some(v)) = row.try_get::<chrono::NaiveDate, _>(idx) {
                Value::String(v.format("%Y-%m-%d").to_string())
            } else {
                Value::Null
            }
        }
        ColumnType::Timen => {
            if let Ok(Some(v)) = row.try_get::<chrono::NaiveTime, _>(idx) {
                Value::String(v.format("%H:%M:%S%.3f").to_string())
            } else {
                Value::Null
            }
        }

        // Binary types → base64
        ColumnType::BigBinary | ColumnType::BigVarBin | ColumnType::Image => {
            match row.try_get::<&[u8], _>(idx) {
                Ok(Some(v)) => {
                    use base64::Engine;
                    Value::String(base64::engine::general_purpose::STANDARD.encode(v))
                }
                _ => Value::Null,
            }
        }

        // Fallback: try string, then null
        _ => {
            match row.try_get::<&str, _>(idx) {
                Ok(Some(v)) => Value::String(v.to_string()),
                _ => Value::Null,
            }
        }
    }
}
