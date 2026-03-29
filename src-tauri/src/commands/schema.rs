use serde_json::Value;

#[tauri::command]
pub async fn get_schema(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    // Check cache while holding db lock
    let cached_json = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::cached_schemas::get_cached_schema(&db, &connection_id, &database_name)?
    };

    // If cached, parse the schema_json field and return
    if let Some(cached) = cached_json {
        if let Some(json_str) = cached["schema_json"].as_str() {
            let schema: Value = serde_json::from_str(json_str)
                .map_err(|e| format!("Failed to parse cached schema: {}", e))?;
            return Ok(schema);
        }
    }

    // Resolve driver + config (no db lock held during await)
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };
    let db_ref = &state.db;

    let default_schema = driver.default_schema();

    // Fetch all object types declared by the driver in parallel
    let object_types = driver.object_types();
    let mut objects = serde_json::Map::new();

    // Collect futures for parallel execution
    let mut handles = Vec::new();
    for ot in &object_types {
        let key = ot.key.clone();
        let driver = driver.clone();
        let config = config.clone();
        handles.push(tokio::spawn(async move {
            let result = driver.list_objects(&config, &key).await;
            (key, result)
        }));
    }
    // Also fetch all columns
    let columns_driver = driver.clone();
    let columns_config = config.clone();
    let columns_handle = tokio::spawn(async move {
        columns_driver.get_all_columns(&columns_config).await
    });

    // Await all object type results
    for handle in handles {
        if let Ok((key, result)) = handle.await {
            objects.insert(key, result.unwrap_or(serde_json::json!([])));
        }
    }
    let columns_result = columns_handle.await
        .map_err(|e| format!("Column fetch failed: {}", e))?
        .unwrap_or(serde_json::json!([]));

    // Group columns by schema.table
    let mut columns_by_table: std::collections::HashMap<String, Vec<Value>> =
        std::collections::HashMap::new();
    if let Some(all_cols) = columns_result.as_array() {
        for col in all_cols {
            let schema_name = col["schema_name"].as_str().unwrap_or(default_schema);
            let table_name = col["table_name"].as_str().unwrap_or("");
            let key = format!("{}.{}", schema_name, table_name);

            let mut col_summary = serde_json::json!({
                "name": col["name"],
                "data_type": col["data_type"],
                "max_length": col["max_length"],
                "precision": col["precision"],
                "scale": col["scale"],
                "is_nullable": col["is_nullable"].as_i64().map(|v| v != 0).or_else(|| col["is_nullable"].as_bool().map(|b| b)).unwrap_or(false),
                "is_primary_key": col["is_primary_key"].as_i64().map(|v| v != 0).or_else(|| col["is_primary_key"].as_bool().map(|b| b)).unwrap_or(false),
                "is_foreign_key": col["is_foreign_key"].as_i64().map(|v| v != 0).or_else(|| col["is_foreign_key"].as_bool().map(|b| b)).unwrap_or(false),
                "is_identity": col["is_identity"].as_i64().map(|v| v != 0).or_else(|| col["is_identity"].as_bool().map(|b| b)).unwrap_or(false),
                "ordinal_position": col["ordinal_position"],
            });
            if let Some(fk_table) = col["fk_table"].as_str() {
                col_summary["fk_table"] = Value::String(fk_table.to_string());
            }
            if let Some(fk_column) = col["fk_column"].as_str() {
                col_summary["fk_column"] = Value::String(fk_column.to_string());
            }

            columns_by_table.entry(key).or_default().push(col_summary);
        }
    }

    // Attach columns to tables and views
    for obj_type in &["table", "view"] {
        if let Some(obj_val) = objects.get_mut(*obj_type) {
            if let Some(arr) = obj_val.as_array_mut() {
                for t in arr.iter_mut() {
                    let schema_name = t["schema"].as_str().unwrap_or(default_schema);
                    let name = t["name"].as_str().unwrap_or("");
                    let key = format!("{}.{}", schema_name, name);
                    if let Some(cols) = columns_by_table.get(&key) {
                        if let Some(obj) = t.as_object_mut() {
                            obj.insert("columns".to_string(), Value::Array(cols.clone()));
                        }
                    }
                }
            }
        }
    }

    let cached_at = chrono::Utc::now().to_rfc3339();

    let schema = serde_json::json!({
        "objects": objects,
        "object_types": object_types,
        "cached_at": cached_at,
    });

    // Cache the result -- re-acquire db lock
    let schema_json = serde_json::to_string(&schema)
        .map_err(|e| format!("Failed to serialize schema: {}", e))?;
    {
        let db = db_ref.lock().map_err(|e| e.to_string())?;
        crate::repositories::cached_schemas::set_cached_schema(
            &db,
            &connection_id,
            &database_name,
            &schema_json,
        )?;
    }

    Ok(schema)
}

#[tauri::command]
pub async fn refresh_schema(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    // Delete caches while holding db lock
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::cached_schemas::delete_cached_schema(
            &db,
            &connection_id,
            &database_name,
        )?;
        crate::repositories::object_details_cache::delete_all_cached_details(
            &db,
            &connection_id,
            Some(&database_name),
        )?;
    }

    // Re-fetch schema (will call bridge, needs no db lock during await)
    get_schema(state, connection_id, database_name).await
}
