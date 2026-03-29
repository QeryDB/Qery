use rusqlite::Connection;
use serde_json::Value;
use crate::drivers::traits::DatabaseDriver;
use crate::repositories::object_details_cache;
use crate::services::connection_service::get_connection_credentials;

/// Helper: build ConnConfig from stored connection credentials.
fn build_config(db: &Connection, connection_id: &str, database_name: &str) -> Result<crate::drivers::traits::ConnConfig, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    Ok(creds.to_conn_config(database_name))
}

/// Get columns of a view, with caching.
pub async fn get_view_columns(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    view_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, view_name, schema_name, "view_columns",
    )? {
        return Ok(cached);
    }

    let config = build_config(db, connection_id, database_name)?;
    let result = driver.get_object_data(&config, "view", view_name, schema_name, "view_columns").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, view_name, schema_name, "view_columns",
        &serde_json::to_string(&data).unwrap_or_default(),
    );

    Ok(Value::Array(data))
}

/// Get parameters of a stored procedure or function, with caching.
pub async fn get_parameters(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "parameters",
    )? {
        return Ok(cached);
    }

    let config = build_config(db, connection_id, database_name)?;
    let result = driver.get_object_data(&config, "procedure", object_name, schema_name, "parameters").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "parameters",
        &serde_json::to_string(&data).unwrap_or_default(),
    );

    Ok(Value::Array(data))
}

/// Get objects that this object depends on, with caching.
pub async fn get_dependencies(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "dependencies",
    )? {
        return Ok(cached);
    }

    let config = build_config(db, connection_id, database_name)?;
    let result = driver.get_object_data(&config, "procedure", object_name, schema_name, "dependencies").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "dependencies",
        &serde_json::to_string(&data).unwrap_or_default(),
    );

    Ok(Value::Array(data))
}

/// Get objects that reference/use this object, with caching.
pub async fn get_used_by(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "used_by",
    )? {
        return Ok(cached);
    }

    let config = build_config(db, connection_id, database_name)?;
    let result = driver.get_object_data(&config, "procedure", object_name, schema_name, "used_by").await?;
    let data = result.as_array().cloned().unwrap_or_default();

    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "used_by",
        &serde_json::to_string(&data).unwrap_or_default(),
    );

    Ok(Value::Array(data))
}

/// Get the SQL definition of a view, procedure, or function (via sp_helptext), with caching.
pub async fn get_definition(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
) -> Result<Option<String>, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, object_name, schema_name, "definition",
    )? {
        // Cached value is a JSON string
        return Ok(cached.as_str().map(|s| s.to_string()));
    }

    let config = build_config(db, connection_id, database_name)?;
    match driver.get_object_data(&config, "procedure", object_name, schema_name, "definition").await {
        Ok(result) => {
            if let Some(definition) = result.get("definition").and_then(|v| v.as_str()) {
                let _ = object_details_cache::set_cached_detail(
                    db, connection_id, database_name, object_name, schema_name, "definition",
                    &serde_json::to_string(&definition).unwrap_or_default(),
                );
                Ok(Some(definition.to_string()))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}
