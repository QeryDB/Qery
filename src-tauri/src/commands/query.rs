use serde_json::{json, Value};

#[tauri::command]
pub async fn execute_query(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    sql: String,
    params: Option<Value>,
    query_id: Option<String>,
) -> Result<Value, String> {
    let query_id = query_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Resolve driver + config while holding db lock
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };

    let start = std::time::Instant::now();

    // Clone values for the spawned task
    let sql_clone = sql.clone();

    // Spawn as a separate task so it can be aborted
    let handle = tokio::spawn(async move {
        driver.run_query(&config, &sql_clone, params).await
    });

    // Store abort handle so cancel_query can kill it
    state.active_queries.lock().await.insert(query_id.clone(), handle.abort_handle());

    // Await the task
    let task_result = handle.await;

    // Clean up
    state.active_queries.lock().await.remove(&query_id);

    match task_result {
        Ok(Ok(result)) => {
            let duration_ms = start.elapsed().as_millis() as i64;
            let rows = result.as_array().cloned().unwrap_or_default();
            let row_count = rows.len() as i64;

            // Derive column metadata from all rows to handle sparse nulls
            let columns: Vec<Value> = {
                let mut seen = indexmap::IndexSet::new();
                let mut type_map = std::collections::HashMap::new();
                for row in &rows {
                    if let Some(obj) = row.as_object() {
                        for (k, v) in obj {
                            seen.insert(k.clone());
                            if !type_map.contains_key(k) || matches!(type_map.get(k), Some(&"null")) {
                                let typ = match v {
                                    Value::Number(_) => "number",
                                    Value::Bool(_) => "boolean",
                                    Value::Null => "null",
                                    _ => "string",
                                };
                                type_map.insert(k.clone(), typ);
                            }
                        }
                    }
                }
                seen.iter()
                    .map(|k| json!({ "name": k, "type": type_map.get(k).unwrap_or(&"string") }))
                    .collect()
            };

            // Record success in history
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let entry = json!({
                    "connection_id": connection_id,
                    "database_name": database_name,
                    "sql_text": sql,
                    "duration_ms": duration_ms,
                    "row_count": row_count,
                    "status": "success",
                });
                let _ = crate::repositories::query_history::add_query_history(&db, &entry);
            }

            Ok(json!({
                "columns": columns,
                "rows": rows,
                "row_count": row_count,
                "duration_ms": duration_ms,
            }))
        }
        Ok(Err(e)) => {
            let duration_ms = start.elapsed().as_millis() as i64;

            // Record error in history
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let entry = json!({
                    "connection_id": connection_id,
                    "database_name": database_name,
                    "sql_text": sql,
                    "duration_ms": duration_ms,
                    "row_count": 0,
                    "status": "error",
                    "error_message": e,
                });
                let _ = crate::repositories::query_history::add_query_history(&db, &entry);
            }

            Err(e)
        }
        Err(e) if e.is_cancelled() => {
            let duration_ms = start.elapsed().as_millis() as i64;
            {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let entry = json!({
                    "connection_id": connection_id,
                    "database_name": database_name,
                    "sql_text": sql,
                    "duration_ms": duration_ms,
                    "row_count": 0,
                    "status": "error",
                    "error_message": "Query cancelled",
                });
                let _ = crate::repositories::query_history::add_query_history(&db, &entry);
            }

            Err("Query cancelled".to_string())
        }
        Err(e) => Err(format!("Task error: {}", e)),
    }
}

#[tauri::command]
pub async fn cancel_query(
    state: tauri::State<'_, crate::AppState>,
    query_id: String,
) -> Result<Value, String> {
    let mut queries = state.active_queries.lock().await;
    if let Some(handle) = queries.remove(&query_id) {
        handle.abort();
        Ok(json!({"ok": true, "cancelled": true}))
    } else {
        Ok(json!({"ok": true, "cancelled": false}))
    }
}

#[tauri::command]
pub async fn explain_query(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    sql: String,
) -> Result<Value, String> {
    // Resolve driver + config while holding db lock
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };

    let rows_val = driver.get_query_plan(&config, &sql).await?;

    // SHOWPLAN_XML returns a single row with a single column containing the XML
    let plan_xml = rows_val
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.as_object())
        .and_then(|obj| obj.values().next())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(json!({ "planXml": plan_xml }))
}

#[tauri::command]
pub async fn estimate_index_size(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    schema: String,
    table: String,
    columns: Vec<String>,
) -> Result<Value, String> {
    // Resolve driver + config while holding db lock
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };

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
            json!({
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

    Ok(json!({
        "rowCount": row_count,
        "estimatedSizeMB": estimated_size_mb,
        "columnDetails": column_details,
    }))
}

#[tauri::command]
pub async fn get_query_history(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let rows = crate::repositories::query_history::get_query_history(
        &db,
        &connection_id,
        limit,
        offset,
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn clear_query_history(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::query_history::clear_query_history(&db, &connection_id)?;
    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn list_saved_queries(
    state: tauri::State<'_, crate::AppState>,
    connection_id: Option<String>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = crate::repositories::saved_queries::list_saved_queries(
        &db,
        connection_id.as_deref(),
    )?;
    Ok(Value::Array(rows))
}

#[tauri::command]
pub async fn create_saved_query(
    state: tauri::State<'_, crate::AppState>,
    input: Value,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::saved_queries::create_saved_query(&db, &input)
}

#[tauri::command]
pub async fn update_saved_query(
    state: tauri::State<'_, crate::AppState>,
    id: String,
    input: Value,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    crate::repositories::saved_queries::update_saved_query(&db, &id, &input)?
        .ok_or_else(|| "Saved query not found".to_string())
}

#[tauri::command]
pub async fn delete_saved_query(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let deleted = crate::repositories::saved_queries::delete_saved_query(&db, &id)?;
    if !deleted {
        return Err("Saved query not found".to_string());
    }
    Ok(json!({"ok": true}))
}
