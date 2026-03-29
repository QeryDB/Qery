use serde_json::{json, Value};

#[tauri::command]
pub async fn get_view_columns(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    // Check cache and resolve driver+config
    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "view_columns",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    if let Some(cached) = cached {
        return Ok(cached);
    }

    let result = driver.get_object_data(&config, "view", &name, schema_name_str, "view_columns").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "view_columns",
            &serde_json::to_string(&data).unwrap_or_default(),
        );
    }

    Ok(Value::Array(data))
}

#[tauri::command]
pub async fn get_object_parameters(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "parameters",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    if let Some(cached) = cached {
        return Ok(cached);
    }

    let result = driver.get_object_data(&config, "procedure", &name, schema_name_str, "parameters").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "parameters",
            &serde_json::to_string(&data).unwrap_or_default(),
        );
    }

    Ok(Value::Array(data))
}

#[tauri::command]
pub async fn get_object_dependencies(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "dependencies",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    if let Some(cached) = cached {
        return Ok(cached);
    }

    let result = driver.get_object_data(&config, "procedure", &name, schema_name_str, "dependencies").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "dependencies",
            &serde_json::to_string(&data).unwrap_or_default(),
        );
    }

    Ok(Value::Array(data))
}

#[tauri::command]
pub async fn get_object_used_by(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "used_by",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    if let Some(cached) = cached {
        return Ok(cached);
    }

    let result = driver.get_object_data(&config, "procedure", &name, schema_name_str, "used_by").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = crate::repositories::object_details_cache::set_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "used_by",
            &serde_json::to_string(&data).unwrap_or_default(),
        );
    }

    Ok(Value::Array(data))
}

#[tauri::command]
pub async fn get_object_definition(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    // Check cache and resolve driver+config
    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = crate::repositories::object_details_cache::get_cached_detail(
            &db, &connection_id, &database_name, &name, schema_name_str, "definition",
        )?;
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    if let Some(cached) = cached {
        // Cached value is a JSON string
        return Ok(json!({ "definition": cached }));
    }

    match driver.get_object_data(&config, "procedure", &name, schema_name_str, "definition").await {
        Ok(result) => {
            let definition = result.get("definition").and_then(|v| v.as_str()).map(|s| s.to_string());

            if let Some(ref def) = definition {
                let db = state.db.lock().map_err(|e| e.to_string())?;
                let _ = crate::repositories::object_details_cache::set_cached_detail(
                    &db, &connection_id, &database_name, &name, schema_name_str,
                    "definition",
                    &serde_json::to_string(def).unwrap_or_default(),
                );
            }

            Ok(json!({ "definition": definition }))
        }
        Err(_) => Ok(json!({ "definition": Value::Null })),
    }
}

#[tauri::command]
pub async fn analyze_safety(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    name: String,
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

    // Resolve driver + config while holding db lock
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };

    // Safety analysis walks dependencies recursively, fetching definitions and deps.
    // We use a stack-based approach with the driver.
    let patterns = build_mutation_patterns();
    let mut all_mutations: Vec<MutationHit> = Vec::new();
    let mut visited: std::collections::HashSet<String> = std::collections::HashSet::new();

    struct WalkItem {
        name: String,
        schema: String,
        depth: i32,
    }

    let max_depth = 3;
    let mut stack = vec![WalkItem {
        name: name.clone(),
        schema: schema_name_str.to_string(),
        depth: 0,
    }];

    while let Some(item) = stack.pop() {
        let key = format!("{}.{}", item.schema, item.name).to_lowercase();
        if visited.contains(&key) || item.depth > max_depth {
            continue;
        }
        visited.insert(key);

        // Get definition via driver
        if let Ok(result) = driver.get_object_data(&config, "procedure", &item.name, &item.schema, "definition").await {
            if let Some(definition) = result.get("definition").and_then(|v| v.as_str()) {
                let hits = detect_mutations(definition, &item.name, &item.schema, item.depth, &patterns);
                all_mutations.extend(hits);
            }
        }

        // Get dependencies and walk them
        if item.depth < max_depth {
            if let Ok(deps) = driver.get_object_data(&config, "procedure", &item.name, &item.schema, "dependencies").await {
                if let Some(deps_arr) = deps.as_array() {
                    for dep in deps_arr {
                        let dep_type = dep["type"].as_str().unwrap_or("");
                        if dep_type.contains("PROCEDURE")
                            || dep_type.contains("FUNCTION")
                            || dep_type.contains("VIEW")
                        {
                            let dep_name = dep["name"].as_str().unwrap_or("").to_string();
                            let dep_schema = dep["schema"].as_str().unwrap_or(&default_schema).to_string();
                            stack.push(WalkItem {
                                name: dep_name,
                                schema: dep_schema,
                                depth: item.depth + 1,
                            });
                        }
                    }
                }
            }
        }
    }

    let is_readonly = all_mutations.is_empty();
    Ok(json!({
        "is_readonly": is_readonly,
        "mutations": all_mutations.iter().map(|m| json!({
            "object": m.object,
            "schema": m.schema,
            "pattern": m.pattern,
            "depth": m.depth,
        })).collect::<Vec<Value>>(),
    }))
}

// ────────────────────────────────────────────────────────
// Safety analysis helpers (inlined from safety_analysis_service)
// ────────────────────────────────────────────────────────

struct MutationHit {
    object: String,
    schema: String,
    pattern: String,
    depth: i32,
}

fn build_mutation_patterns() -> Vec<regex::Regex> {
    let patterns = [
        r"(?i)\bINSERT\s+INTO\b",
        r"(?i)\bINSERT\s+\[",
        r"(?i)\bUPDATE\s+\[",
        r"(?i)\bUPDATE\s+\w+\.\w+",
        r"(?i)\bDELETE\s+FROM\b",
        r"(?i)\bDELETE\s+\[",
        r"(?i)\bTRUNCATE\s+TABLE\b",
        r"(?i)\bDROP\s+(TABLE|VIEW|PROCEDURE|FUNCTION|INDEX|TRIGGER)\b",
        r"(?i)\bALTER\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\b",
        r"(?i)\bCREATE\s+(TABLE|INDEX|TRIGGER)\b",
        r"(?i)\bMERGE\s+INTO\b",
        r"(?i)\bMERGE\s+\[",
        r"(?i)\bEXEC(UTE)?\s+sp_rename\b",
        r"(?i)\bDBCC\b",
        r"(?i)\bBULK\s+INSERT\b",
        r"(?i)\bWRITETEXT\b",
        r"(?i)\bUPDATETEXT\b",
    ];
    patterns
        .iter()
        .filter_map(|p| regex::Regex::new(p).ok())
        .collect()
}

/// Check if the text after a mutation match targets a temp table (#name or [#name])
fn targets_temp_table(cleaned: &str, match_end: usize) -> bool {
    let rest = &cleaned[match_end..];
    let trimmed = rest.trim_start();
    trimmed.starts_with('#') || trimmed.starts_with("[#")
}

fn detect_mutations(
    definition: &str,
    object_name: &str,
    schema_name: &str,
    depth: i32,
    patterns: &[regex::Regex],
) -> Vec<MutationHit> {
    let mut hits = Vec::new();

    // Strip single-line comments and string literals to reduce false positives
    let re_line_comment = regex::Regex::new(r"--[^\n]*").unwrap();
    let re_string_literal = regex::Regex::new(r"'[^']*'").unwrap();
    let re_block_comment = regex::Regex::new(r"/\*[\s\S]*?\*/").unwrap();

    let cleaned = re_line_comment.replace_all(definition, "");
    let cleaned = re_block_comment.replace_all(&cleaned, "");
    let cleaned = re_string_literal.replace_all(&cleaned, "''");

    for pattern in patterns {
        if let Some(m) = pattern.find(&cleaned) {
            // Skip mutations targeting temp tables (#table or [#table])
            if targets_temp_table(&cleaned, m.end()) {
                continue;
            }
            hits.push(MutationHit {
                object: object_name.to_string(),
                schema: schema_name.to_string(),
                pattern: m.as_str().to_string(),
                depth,
            });
        }
    }

    hits
}

// ── Generic object data endpoint ────────────────────────────

/// Cacheable data keys — these are safe to serve from SQLite when offline
const CACHEABLE_KEYS: &[&str] = &[
    "columns", "indexes", "foreign_keys", "referenced_by",
    "definition", "parameters", "dependencies", "used_by", "view_columns",
];

#[tauri::command]
pub async fn get_object_data(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    object_type: String,
    name: String,
    schema_name: Option<String>,
    data_key: String,
) -> Result<Value, String> {
    let is_cacheable = CACHEABLE_KEYS.contains(&data_key.as_str());

    let (driver, config, cached) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let cached = if is_cacheable {
            let schema_for_cache = schema_name.as_deref().unwrap_or("dbo");
            crate::repositories::object_details_cache::get_cached_detail(
                &db, &connection_id, &database_name, &name, schema_for_cache, &data_key,
            )?
        } else { None };
        let (driver, config) = crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?;
        (driver, config, cached)
    };

    let schema = schema_name.as_deref().unwrap_or(driver.default_schema());

    // Return cached data if available (works offline)
    if let Some(cached) = cached {
        return Ok(cached);
    }

    // Fetch from live DB
    let result = driver.get_object_data(&config, &object_type, &name, schema, &data_key).await;

    // Cache on success for future offline access
    if is_cacheable {
        if let Ok(ref data) = result {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let _ = crate::repositories::object_details_cache::set_cached_detail(
                &db, &connection_id, &database_name, &name, schema, &data_key,
                &serde_json::to_string(data).unwrap_or_default(),
            );
        }
    }

    result
}

#[tauri::command]
pub async fn execute_object_action(
    state: tauri::State<'_, crate::AppState>,
    connection_id: String,
    database_name: String,
    object_type: String,
    name: String,
    schema_name: Option<String>,
    action: String,
) -> Result<Value, String> {
    let (driver, config) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        crate::drivers::resolve::resolve_connection(&db, &state.registry, &connection_id, &database_name)?
    };
    let schema = schema_name.as_deref().unwrap_or(driver.default_schema());
    driver.execute_object_action(&config, &object_type, &name, schema, &action).await
}
