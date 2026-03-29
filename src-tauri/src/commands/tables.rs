use serde_json::Value;

#[tauri::command]
pub async fn get_table_details(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    // Resolve driver first to get default_schema
    let (driver, config, schema_name) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        let schema_name = schema_name.unwrap_or_else(|| driver.default_schema().to_string());
        (driver, config, schema_name)
    };
    let schema_name = schema_name.as_str();

    // Check cache
    let (cached_cols, cached_idx, cached_fks) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached_cols = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &table_name, schema_name, "columns",
        )?;
        let cached_idx = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &table_name, schema_name, "indexes",
        )?;
        let cached_fks = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &table_name, schema_name, "foreign_keys",
        )?;
        (cached_cols, cached_idx, cached_fks)
    };

    // If all cached, return immediately
    if let (Some(cols), Some(idx), Some(fks)) = (&cached_cols, &cached_idx, &cached_fks) {
        return Ok(serde_json::json!({
            "name": table_name,
            "schema": schema_name,
            "columns": cols,
            "indexes": idx,
            "foreign_keys": fks,
        }));
    }

    // Fetch missing data in parallel
    let (columns_val, indexes_val, fks_val) = tokio::try_join!(
        async {
            if let Some(c) = &cached_cols {
                Ok(c.clone())
            } else {
                driver.get_object_data(&config, "table", &table_name, schema_name, "columns").await
            }
        },
        async {
            if let Some(i) = &cached_idx {
                Ok(i.clone())
            } else {
                driver.get_object_data(&config, "table", &table_name, schema_name, "indexes").await
            }
        },
        async {
            if let Some(f) = &cached_fks {
                Ok(f.clone())
            } else {
                driver.get_object_data(&config, "table", &table_name, schema_name, "foreign_keys").await
            }
        },
    )?;

    let parsed_indexes = parse_index_columns(&indexes_val);
    let columns = columns_val.as_array().cloned().unwrap_or_default();
    let foreign_keys = fks_val.as_array().cloned().unwrap_or_default();

    // Cache results that were freshly fetched
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if cached_cols.is_none() {
            let _ = crate::repositories::object_details_cache::set_cached_detail(
                &db, &connection_id, &database_name, &table_name, schema_name, "columns",
                &serde_json::to_string(&columns).unwrap_or_default(),
            );
        }
        if cached_idx.is_none() {
            let _ = crate::repositories::object_details_cache::set_cached_detail(
                &db, &connection_id, &database_name, &table_name, schema_name, "indexes",
                &serde_json::to_string(&parsed_indexes).unwrap_or_default(),
            );
        }
        if cached_fks.is_none() {
            let _ = crate::repositories::object_details_cache::set_cached_detail(
                &db, &connection_id, &database_name, &table_name, schema_name, "foreign_keys",
                &serde_json::to_string(&foreign_keys).unwrap_or_default(),
            );
        }
    }

    Ok(serde_json::json!({
        "name": table_name,
        "schema": schema_name,
        "columns": columns,
        "indexes": parsed_indexes,
        "foreign_keys": foreign_keys,
    }))
}

/// Helper: resolve driver, get default schema, check cache for a single data key.
async fn resolve_and_check_cache(
    state: &tauri::State<'_, crate::AppState>,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: Option<&str>,
    cache_key: &str,
) -> Result<(std::sync::Arc<dyn crate::drivers::traits::DatabaseDriver>, crate::drivers::traits::ConnConfig, String, Option<Value>), String> {
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, connection_id, database_name)?
    };
    let schema = schema_name.unwrap_or(driver.default_schema()).to_string();
    let cached = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::object_details_cache::get_cached_detail(
            &db, connection_id, database_name, object_name, &schema, cache_key,
        )?
    };
    Ok((driver, config, schema, cached))
}

#[tauri::command]
pub async fn get_table_columns(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let (driver, config, schema, cached) = resolve_and_check_cache(
        &state, &connection_id, &database_name, &table_name, schema_name.as_deref(), "columns",
    ).await?;
    if let Some(cached) = cached { return Ok(cached); }

    let result = driver.get_object_data(&config, "table", &table_name, &schema, "columns").await?;
    let cols = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &table_name, &schema, "columns",
            &serde_json::to_string(&cols).unwrap_or_default(),
        );
    }
    Ok(Value::Array(cols))
}

#[tauri::command]
pub async fn get_table_indexes(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let (driver, config, schema, cached) = resolve_and_check_cache(
        &state, &connection_id, &database_name, &table_name, schema_name.as_deref(), "indexes",
    ).await?;
    if let Some(cached) = cached { return Ok(cached); }

    let result = driver.get_object_data(&config, "table", &table_name, &schema, "indexes").await?;
    let parsed = parse_index_columns(&result);

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &table_name, &schema, "indexes",
            &serde_json::to_string(&parsed).unwrap_or_default(),
        );
    }
    Ok(Value::Array(parsed))
}

#[tauri::command]
pub async fn get_table_foreign_keys(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let (driver, config, schema, cached) = resolve_and_check_cache(
        &state, &connection_id, &database_name, &table_name, schema_name.as_deref(), "foreign_keys",
    ).await?;
    if let Some(cached) = cached { return Ok(cached); }

    let result = driver.get_object_data(&config, "table", &table_name, &schema, "foreign_keys").await?;
    let fks = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &table_name, &schema, "foreign_keys",
            &serde_json::to_string(&fks).unwrap_or_default(),
        );
    }
    Ok(Value::Array(fks))
}

#[tauri::command]
pub async fn get_table_referenced_by(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let (driver, config, schema, cached) = resolve_and_check_cache(
        &state, &connection_id, &database_name, &table_name, schema_name.as_deref(), "referenced_by",
    ).await?;
    if let Some(cached) = cached { return Ok(cached); }

    let result = driver.get_object_data(&config, "table", &table_name, &schema, "referenced_by").await?;
    let refs = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &table_name, &schema, "referenced_by",
            &serde_json::to_string(&refs).unwrap_or_default(),
        );
    }
    Ok(Value::Array(refs))
}

#[tauri::command]
pub async fn get_table_preview(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value, String> {
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };
    let schema_name = schema_name.as_deref().unwrap_or(driver.default_schema());
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);

    // Use driver's get_object_data for data preview (driver handles SQL dialect)
    let result = driver.get_object_data(&config, "table", &table_name, schema_name, "data").await?;
    let rows = result.as_array().cloned().unwrap_or_default();

    // Derive column metadata from first row
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
        } else { vec![] }
    } else { vec![] };

    // TODO: get_object_data "data" should return total_rows too, or add a "count" data_key
    let _ = (limit, offset); // Will be used when driver supports pagination params

    Ok(serde_json::json!({
        "columns": columns,
        "rows": rows,
        "total_rows": rows.len(),
    }))
}

/// Parse the comma-separated "columns" string from index rows into an array.
fn parse_index_columns(result: &Value) -> Vec<Value> {
    result
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|mut idx| {
            if let Some(obj) = idx.as_object_mut() {
                let cols_parsed = obj
                    .get("columns")
                    .and_then(|v| v.as_str())
                    .map(|s| {
                        Value::Array(
                            s.split(", ")
                                .map(|c| Value::String(c.to_string()))
                                .collect(),
                        )
                    })
                    .unwrap_or_else(|| {
                        obj.get("columns").cloned().unwrap_or(Value::Array(vec![]))
                    });
                obj.insert("columns".to_string(), cols_parsed);
            }
            idx
        })
        .collect()
}
