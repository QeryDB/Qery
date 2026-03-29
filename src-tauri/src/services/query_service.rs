use rusqlite::Connection;
use serde_json::Value;
use crate::drivers::traits::DatabaseDriver;
use crate::repositories::query_history;
use crate::services::connection_service::get_connection_credentials;

/// Execute a SQL query via the driver, record in history, and return results.
pub async fn execute_query(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    sql: &str,
    params: Option<Value>,
) -> Result<Value, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);
    let start = std::time::Instant::now();

    match driver.run_query(&config, sql, params).await {
        Ok(result) => {
            let duration_ms = start.elapsed().as_millis() as i64;
            let rows = result.as_array().cloned().unwrap_or_default();
            let row_count = rows.len() as i64;

            // Derive column metadata from the first row
            let columns: Vec<Value> = if let Some(first) = rows.first() {
                if let Some(obj) = first.as_object() {
                    obj.keys()
                        .map(|k| {
                            let typ = match &obj[k] {
                                Value::Number(_) => "number",
                                Value::Bool(_) => "boolean",
                                Value::Null => "null",
                                _ => "string",
                            };
                            serde_json::json!({ "name": k, "type": typ })
                        })
                        .collect()
                } else {
                    vec![]
                }
            } else {
                vec![]
            };

            // Record success in history
            query_history::add_query_history(
                db,
                &serde_json::json!({
                    "connection_id": connection_id,
                    "database_name": database_name,
                    "sql_text": sql,
                    "duration_ms": duration_ms,
                    "row_count": row_count,
                    "status": "success",
                }),
            )?;

            Ok(serde_json::json!({
                "columns": columns,
                "rows": rows,
                "row_count": row_count,
                "duration_ms": duration_ms,
            }))
        }
        Err(e) => {
            let duration_ms = start.elapsed().as_millis() as i64;

            // Record error in history
            let _ = query_history::add_query_history(
                db,
                &serde_json::json!({
                    "connection_id": connection_id,
                    "database_name": database_name,
                    "sql_text": sql,
                    "duration_ms": duration_ms,
                    "row_count": 0,
                    "status": "error",
                    "error_message": e,
                }),
            );

            Err(e)
        }
    }
}

/// Retrieve the XML execution plan for a SQL statement (SHOWPLAN_XML).
pub async fn get_execution_plan(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    sql: &str,
) -> Result<Value, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);

    let rows_val = driver.get_query_plan(&config, sql).await?;

    // SHOWPLAN_XML returns a single row with a single column containing the XML
    let plan_xml = rows_val
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.as_object())
        .and_then(|obj| obj.values().next())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({ "planXml": plan_xml }))
}

/// Estimate the storage size of a potential index on the given columns.
pub async fn estimate_index_size(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    schema: &str,
    table: &str,
    columns: &[String],
) -> Result<Value, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);

    let sch = schema.replace('\'', "''");
    let tbl = table.replace('\'', "''");
    let col_list = columns
        .iter()
        .map(|c| format!("'{}'", c.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");

    let sql = format!(
        "SELECT
           c.name AS col_name,
           c.max_length AS col_max_length,
           p.rows AS tbl_rows
         FROM sys.columns c
         JOIN sys.tables t ON c.object_id = t.object_id
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id <= 1
         WHERE s.name = '{}' AND t.name = '{}' AND c.name IN ({})",
        sch, tbl, col_list
    );

    let result = driver.run_query(&config, &sql, None).await?;

    let rows = result.as_array().cloned().unwrap_or_default();

    let row_count = rows
        .first()
        .and_then(|r| r.get("tbl_rows"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let column_details: Vec<Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "name": r.get("col_name").and_then(|v| v.as_str()).unwrap_or(""),
                "maxLength": r.get("col_max_length").and_then(|v| v.as_i64()).unwrap_or(0),
            })
        })
        .collect();

    let total_col_bytes: i64 = column_details
        .iter()
        .map(|c| c["maxLength"].as_i64().unwrap_or(0))
        .sum();

    // Row overhead (~11 bytes) + 20% page overhead
    let estimated_size_mb =
        ((row_count as f64 * (total_col_bytes as f64 + 11.0) * 1.2) / 1024.0 / 1024.0 * 100.0)
            .round()
            / 100.0;

    Ok(serde_json::json!({
        "rowCount": row_count,
        "estimatedSizeMB": estimated_size_mb,
        "columnDetails": column_details,
    }))
}

/// Retrieve query execution history for a connection.
pub fn get_query_history(
    db: &Connection,
    connection_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Value>, String> {
    query_history::get_query_history(db, connection_id, limit, offset)
}

/// Clear all query history for a connection.
pub fn clear_query_history(db: &Connection, connection_id: &str) -> Result<(), String> {
    query_history::clear_query_history(db, connection_id)
}
