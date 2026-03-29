use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use crate::drivers::traits::DatabaseDriver;
use crate::repositories::cached_schemas;
use crate::repositories::object_details_cache;
use crate::services::connection_service::get_connection_credentials;

/// Fetch the full schema tree for a database. Returns cached result unless force_refresh is true.
pub async fn get_schema(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    force_refresh: bool,
) -> Result<Value, String> {
    // Check cache first
    if !force_refresh {
        if let Some(cached_row) = cached_schemas::get_cached_schema(db, connection_id, database_name)? {
            if let Some(schema_json_str) = cached_row.get("schema_json").and_then(|v| v.as_str()) {
                let schema: Value = serde_json::from_str(schema_json_str)
                    .map_err(|e| format!("Failed to parse cached schema: {}", e))?;
                return Ok(schema);
            }
        }
    }

    // Introspect via driver's generic object operations
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);

    let (tables_result, views_result, procedures_result, functions_result, columns_result) = tokio::try_join!(
        driver.list_objects(&config, "table"),
        driver.list_objects(&config, "view"),
        driver.list_objects(&config, "procedure"),
        driver.list_objects(&config, "function"),
        driver.get_all_columns(&config),
    )?;

    // Group columns by schema.table
    let mut columns_by_table: HashMap<String, Vec<Value>> = HashMap::new();
    if let Some(all_cols) = columns_result.as_array() {
        for col in all_cols {
            let schema_name = col["schema_name"].as_str().unwrap_or(driver.default_schema());
            let table_name = col["table_name"].as_str().unwrap_or("");
            let key = format!("{}.{}", schema_name, table_name);

            let mut col_obj = serde_json::json!({
                "name": col["name"],
                "data_type": col["data_type"],
                "max_length": col["max_length"],
                "precision": col["precision"],
                "scale": col["scale"],
                "is_nullable": col["is_nullable"].as_i64().map(|v| v != 0).unwrap_or(false),
                "is_primary_key": col["is_primary_key"].as_i64().map(|v| v != 0).unwrap_or(false),
                "is_foreign_key": col["is_foreign_key"].as_i64().map(|v| v != 0).unwrap_or(false),
                "is_identity": col["is_identity"].as_i64().map(|v| v != 0).unwrap_or(false),
                "ordinal_position": col["ordinal_position"],
            });
            // Include FK reference info if present (for real FK → table completion)
            if let Some(fk_table) = col["fk_table"].as_str() {
                col_obj["fk_table"] = Value::String(fk_table.to_string());
            }
            if let Some(fk_column) = col["fk_column"].as_str() {
                col_obj["fk_column"] = Value::String(fk_column.to_string());
            }
            let col_summary = col_obj;

            columns_by_table
                .entry(key)
                .or_default()
                .push(col_summary);
        }
    }

    // Attach columns to tables
    let tables_with_columns: Vec<Value> = tables_result
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|mut t| {
            let schema_name = t["schema"].as_str().unwrap_or(driver.default_schema());
            let table_name = t["name"].as_str().unwrap_or("");
            let key = format!("{}.{}", schema_name, table_name);
            if let Some(cols) = columns_by_table.get(&key) {
                if let Some(obj) = t.as_object_mut() {
                    obj.insert("columns".to_string(), Value::Array(cols.clone()));
                }
            }
            t
        })
        .collect();

    let cached_at = chrono::Utc::now().to_rfc3339();

    let schema = serde_json::json!({
        "tables": tables_with_columns,
        "views": views_result.as_array().cloned().unwrap_or_default(),
        "procedures": procedures_result.as_array().cloned().unwrap_or_default(),
        "functions": functions_result.as_array().cloned().unwrap_or_default(),
        "cached_at": cached_at,
    });

    // Cache the result
    let schema_json = serde_json::to_string(&schema)
        .map_err(|e| format!("Failed to serialize schema: {}", e))?;
    cached_schemas::set_cached_schema(db, connection_id, database_name, &schema_json)?;

    Ok(schema)
}

/// Delete cached schema and object details, then re-fetch.
pub async fn refresh_schema(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
) -> Result<Value, String> {
    cached_schemas::delete_cached_schema(db, connection_id, database_name)?;
    object_details_cache::delete_all_cached_details(db, connection_id, Some(database_name))?;
    get_schema(db, driver, connection_id, database_name, true).await
}
