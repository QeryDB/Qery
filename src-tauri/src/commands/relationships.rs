use serde_json::{json, Value};

#[tauri::command]
pub async fn get_ghost_fks(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let default_schema = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = crate::repositories::connections::get_connection(&db, &connection_id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        state.registry.get(db_type).map(|d| d.default_schema().to_string()).unwrap_or("dbo".to_string())
    };
    let schema_name_str = schema_name.as_deref().unwrap_or(&default_schema);
    let ghost_fk_cache = &state.ghost_fk_cache;

    // Check in-memory cache first (no db lock needed)
    let cache_key = format!("{}:{}:{}", connection_id, database_name, table_name);
    {
        let cache = ghost_fk_cache.read().await;
        if let Some(entry) = cache.get(&cache_key) {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            if now_ms - entry.timestamp < 5 * 60 * 1000 {
                return serde_json::to_value(&entry.data)
                    .map_err(|e| format!("Serialize error: {}", e));
            }
        }
    }

    // Check SQLite cache and resolve driver+config
    let (driver, config, sqlite_cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &table_name, schema_name_str, "ghost_fks",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    let ghost_fks: Vec<crate::services::ghost_fk_service::GhostFKInfo>;

    if let Some(cached_val) = sqlite_cached {
        ghost_fks = serde_json::from_value(cached_val)
            .map_err(|e| format!("Failed to parse cached ghost FKs: {}", e))?;
    } else {
        // Query database for all columns (includes PK info for smarter matching)
        let all_cols_val = driver.get_all_columns(&config).await?;

        // Build table -> columns map with PK metadata (all schemas, qualified keys)
        let mut columns_by_table: std::collections::HashMap<String, Vec<crate::services::ghost_fk_service::ColMeta>> =
            std::collections::HashMap::new();
        // Also build bare name → qualified name lookup for convention matching
        let mut bare_to_qualified: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        if let Some(rows) = all_cols_val.as_array() {
            for row in rows {
                let row_schema = row["schema_name"].as_str().unwrap_or(schema_name_str);
                let tbl = row["table_name"].as_str().unwrap_or("");
                let qualified = format!("{}.{}", row_schema, tbl);
                let col = row["name"].as_str()
                    .or_else(|| row["column_name"].as_str())
                    .unwrap_or("").to_string();
                let is_pk = row["is_primary_key"].as_i64().unwrap_or(0) == 1;
                columns_by_table.entry(qualified.clone()).or_default().push(
                    crate::services::ghost_fk_service::ColMeta { name: col, is_pk }
                );
                bare_to_qualified.entry(tbl.to_lowercase()).or_insert(qualified);
            }
        }
        let qualified_target = format!("{}.{}", schema_name_str, table_name);
        let target_cols = columns_by_table
            .get(&qualified_target)
            .cloned()
            .unwrap_or_default();

        // Industry-standard ghost FK detection: PK matching + convention + exact name
        ghost_fks = crate::services::ghost_fk_service::find_ghost_fks(&qualified_target, &target_cols, &columns_by_table);

        // Only cache non-empty results — empty means the column query likely failed or
        // the connection wasn't ready; we don't want to persist that permanently.
        if !ghost_fks.is_empty() || !columns_by_table.is_empty() {
            let ghost_json = serde_json::to_string(&ghost_fks).unwrap_or_default();
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let _ = crate::repositories::object_details_cache::set_cached_detail(
                &db, &connection_id, &database_name, &table_name, schema_name_str, "ghost_fks",
                &ghost_json,
            );
        }
    }

    // Read manual and dismissed relationships from SQLite
    let (all_relationships, dismissed_keys) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let rels = crate::repositories::relationships::list_relationships(
            &db, &connection_id, &database_name, Some(&table_name),
        )?;
        let dismissed = crate::repositories::relationships::get_dismissed_keys(
            &db, &connection_id, &database_name,
        )?;
        (rels, dismissed)
    };

    let manual_rows: Vec<&Value> = all_relationships
        .iter()
        .filter(|r| {
            r["is_auto_detected"].as_i64().unwrap_or(0) == 0
                && r["is_dismissed"].as_i64().unwrap_or(0) == 0
        })
        .collect();

    // Merge: mark dismissed ghost FKs
    let mut dismissed_count = 0i64;
    let mut active_ghosts: Vec<crate::services::ghost_fk_service::GhostFKInfo> =
        Vec::with_capacity(ghost_fks.len());
    for mut gfk in ghost_fks {
        if dismissed_keys.contains(&gfk.id) {
            dismissed_count += 1;
            gfk.is_dismissed = true;
        }
        active_ghosts.push(gfk);
    }

    // Convert manual rows to GhostFKInfo format
    let manual_fks: Vec<crate::services::ghost_fk_service::GhostFKInfo> = manual_rows
        .iter()
        .map(|r| crate::services::ghost_fk_service::GhostFKInfo {
            id: r["id"].as_str().unwrap_or("").to_string(),
            from_table: r["from_table"].as_str().unwrap_or("").to_string(),
            from_column: r["from_column"].as_str().unwrap_or("").to_string(),
            to_table: r["to_table"].as_str().unwrap_or("").to_string(),
            to_column: r["to_column"].as_str().unwrap_or("").to_string(),
            match_type: "exact".to_string(),
            confidence: 1.0,
            is_dismissed: false,
            source: "manual".to_string(),
            description: r["description"].as_str().map(|s| s.to_string()),
        })
        .collect();

    let response = crate::services::ghost_fk_service::GhostFKResponse {
        ghost_fks: active_ghosts,
        manual_fks,
        dismissed_count,
    };

    // Store in in-memory cache
    {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let mut cache = ghost_fk_cache.write().await;
        cache.insert(
            cache_key,
            crate::services::ghost_fk_service::GhostFKCacheEntry {
                data: response.clone(),
                timestamp: now_ms,
            },
        );
    }

    serde_json::to_value(&response).map_err(|e| format!("Serialize error: {}", e))
}

#[tauri::command]
pub async fn invalidate_ghost_fks(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    table_name: String,
    schema_name: Option<String>,
) -> Result<Value, String> {
    let default_schema = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let conn = crate::repositories::connections::get_connection(&db, &connection_id)?
            .ok_or("Connection not found")?;
        let db_type = conn["database_type"].as_str().unwrap_or("mssql");
        state.registry.get(db_type).map(|d| d.default_schema().to_string()).unwrap_or_else(|_| "dbo".to_string())
    };
    let schema = schema_name.as_deref().unwrap_or(&default_schema);

    // Clear SQLite cache
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::delete_cached_detail(
            &db, &connection_id, &database_name, &table_name, schema, Some("ghost_fks"),
        );
    }

    // Clear in-memory cache
    crate::services::ghost_fk_service::invalidate_cache(
        &state.ghost_fk_cache, &connection_id, &database_name, Some(&table_name),
    ).await;

    Ok(json!({"ok": true}))
}


#[tauri::command]
pub async fn get_relationships(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = crate::repositories::relationships::list_relationships(
        &db, &connection_id, &database_name, None,
    )?;
    let dismissed_keys = crate::repositories::relationships::get_dismissed_keys(
        &db, &connection_id, &database_name,
    )?;

    // Filter manual (non-auto, non-dismissed) relationships
    let manual: Vec<&Value> = rows.iter().filter(|r| {
        r["is_auto_detected"].as_i64().unwrap_or(0) == 0
            && r["is_dismissed"].as_i64().unwrap_or(0) == 0
    }).collect();

    // Return format matching frontend RelationshipOverrides type
    Ok(json!({
        "manual": manual,
        "dismissed": dismissed_keys.into_iter().collect::<Vec<String>>(),
    }))
}

#[tauri::command]
pub async fn create_relationship(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    input: Value,
) -> Result<Value, String> {
    let result = {
        let mut full_input = input.clone();
        if let Some(obj) = full_input.as_object_mut() {
            obj.insert("connection_id".to_string(), Value::String(connection_id.clone()));
            obj.insert("database_name".to_string(), Value::String(database_name.clone()));
        }
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::relationships::create_relationship(
            &db,
            &full_input,
        )?
    };

    // Invalidate ghost FK cache for affected tables
    let from_table = input["from_table"].as_str();
    let to_table = input["to_table"].as_str();
    let ghost_fk_cache = &state.ghost_fk_cache;

    crate::services::ghost_fk_service::invalidate_cache(
        ghost_fk_cache,
        &connection_id,
        &database_name,
        from_table,
    )
    .await;

    if let Some(to) = to_table {
        if from_table != Some(to) {
            crate::services::ghost_fk_service::invalidate_cache(
                ghost_fk_cache,
                &connection_id,
                &database_name,
                Some(to),
            )
            .await;
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn dismiss_relationship(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    input: Value,
) -> Result<Value, String> {
    let from_table = input["from_table"]
        .as_str()
        .ok_or("from_table is required")?
        .to_string();
    let from_column = input["from_column"]
        .as_str()
        .ok_or("from_column is required")?;
    let to_table = input["to_table"]
        .as_str()
        .ok_or("to_table is required")?
        .to_string();
    let to_column = input["to_column"]
        .as_str()
        .ok_or("to_column is required")?;

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::relationships::dismiss_relationship(
            &db,
            &connection_id,
            &database_name,
            &from_table,
            from_column,
            &to_table,
            to_column,
        )?;
    }

    // Invalidate ghost FK cache
    let ghost_fk_cache = &state.ghost_fk_cache;
    crate::services::ghost_fk_service::invalidate_cache(
        ghost_fk_cache,
        &connection_id,
        &database_name,
        Some(&from_table),
    )
    .await;
    if from_table != to_table {
        crate::services::ghost_fk_service::invalidate_cache(
            ghost_fk_cache,
            &connection_id,
            &database_name,
            Some(&to_table),
        )
        .await;
    }

    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn undismiss_relationship(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    rel_id: String,
) -> Result<Value, String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::relationships::undismiss_relationship(&db, &rel_id)?;
    }

    // Invalidate all ghost FK cache for this connection+database
    let ghost_fk_cache = &state.ghost_fk_cache;
    crate::services::ghost_fk_service::invalidate_cache(
        ghost_fk_cache,
        &connection_id,
        &database_name,
        None,
    )
    .await;

    Ok(json!({"ok": true}))
}

#[tauri::command]
pub async fn delete_relationship(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    rel_id: String,
) -> Result<Value, String> {
    let deleted = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::repositories::relationships::delete_relationship(&db, &rel_id)?
    };
    if !deleted {
        return Err("Relationship not found".to_string());
    }

    // Invalidate all ghost FK cache for this connection+database
    let ghost_fk_cache = &state.ghost_fk_cache;
    crate::services::ghost_fk_service::invalidate_cache(
        ghost_fk_cache,
        &connection_id,
        &database_name,
        None,
    )
    .await;

    Ok(json!({"ok": true}))
}
