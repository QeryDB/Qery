use rusqlite::Connection;
use serde_json::Value;
use crate::drivers::traits::DatabaseDriver;
use crate::repositories::object_details_cache;
use crate::services::connection_service::get_connection_credentials;

/// Retrieve full table details: columns, indexes, and foreign keys (with SQLite caching).
pub async fn get_table_details(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    // Check cache for each component
    let cached_cols = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "columns",
    )?;
    let cached_idx = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "indexes",
    )?;
    let cached_fks = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "foreign_keys",
    )?;

    // If all three are cached, return immediately
    if let (Some(cols), Some(idx), Some(fks)) = (&cached_cols, &cached_idx, &cached_fks) {
        return Ok(serde_json::json!({
            "name": table_name,
            "schema": schema_name,
            "columns": cols,
            "indexes": idx,
            "foreign_keys": fks,
        }));
    }

    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);

    // Fetch missing data in parallel
    let (columns_val, indexes_val, fks_val) = tokio::try_join!(
        async {
            if let Some(c) = &cached_cols {
                Ok::<Value, String>(c.clone())
            } else {
                driver.get_object_data(&config, "table", table_name, schema_name, "columns").await
            }
        },
        async {
            if let Some(i) = &cached_idx {
                Ok::<Value, String>(i.clone())
            } else {
                driver.get_object_data(&config, "table", table_name, schema_name, "indexes").await
            }
        },
        async {
            if let Some(f) = &cached_fks {
                Ok::<Value, String>(f.clone())
            } else {
                driver.get_object_data(&config, "table", table_name, schema_name, "foreign_keys").await
            }
        },
    )?;

    // Parse index columns from comma-separated string
    let parsed_indexes = parse_index_columns(&indexes_val);

    let columns = columns_val.as_array().cloned().unwrap_or_default();
    let foreign_keys = fks_val.as_array().cloned().unwrap_or_default();

    // Cache results that were freshly fetched
    if cached_cols.is_none() {
        let _ = object_details_cache::set_cached_detail(
            db, connection_id, database_name, table_name, schema_name, "columns",
            &serde_json::to_string(&columns).unwrap_or_default(),
        );
    }
    if cached_idx.is_none() {
        let _ = object_details_cache::set_cached_detail(
            db, connection_id, database_name, table_name, schema_name, "indexes",
            &serde_json::to_string(&parsed_indexes).unwrap_or_default(),
        );
    }
    if cached_fks.is_none() {
        let _ = object_details_cache::set_cached_detail(
            db, connection_id, database_name, table_name, schema_name, "foreign_keys",
            &serde_json::to_string(&foreign_keys).unwrap_or_default(),
        );
    }

    Ok(serde_json::json!({
        "name": table_name,
        "schema": schema_name,
        "columns": columns,
        "indexes": parsed_indexes,
        "foreign_keys": foreign_keys,
    }))
}

/// Retrieve table columns with caching.
pub async fn get_table_columns(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "columns",
    )? {
        return Ok(cached);
    }

    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);
    let result = driver.get_object_data(&config, "table", table_name, schema_name, "columns").await?;

    let cols = result.as_array().cloned().unwrap_or_default();
    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "columns",
        &serde_json::to_string(&cols).unwrap_or_default(),
    );

    Ok(Value::Array(cols))
}

/// Retrieve table indexes with caching.
pub async fn get_table_indexes(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "indexes",
    )? {
        return Ok(cached);
    }

    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);
    let result = driver.get_object_data(&config, "table", table_name, schema_name, "indexes").await?;

    let parsed = parse_index_columns(&result);
    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "indexes",
        &serde_json::to_string(&parsed).unwrap_or_default(),
    );

    Ok(Value::Array(parsed))
}

/// Retrieve table foreign keys with caching.
pub async fn get_table_foreign_keys(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "foreign_keys",
    )? {
        return Ok(cached);
    }

    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);
    let result = driver.get_object_data(&config, "table", table_name, schema_name, "foreign_keys").await?;

    let fks = result.as_array().cloned().unwrap_or_default();
    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "foreign_keys",
        &serde_json::to_string(&fks).unwrap_or_default(),
    );

    Ok(Value::Array(fks))
}

/// Retrieve tables that reference this table via foreign keys, with caching.
pub async fn get_table_referenced_by(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
) -> Result<Value, String> {
    if let Some(cached) = object_details_cache::get_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "referenced_by",
    )? {
        return Ok(cached);
    }

    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);
    let result = driver.get_object_data(&config, "table", table_name, schema_name, "referenced_by").await?;

    let refs = result.as_array().cloned().unwrap_or_default();
    let _ = object_details_cache::set_cached_detail(
        db, connection_id, database_name, table_name, schema_name, "referenced_by",
        &serde_json::to_string(&refs).unwrap_or_default(),
    );

    Ok(Value::Array(refs))
}

/// Retrieve a preview (sample rows) of a table with total row count.
pub async fn get_table_preview(
    db: &Connection,
    driver: &dyn DatabaseDriver,
    connection_id: &str,
    database_name: &str,
    table_name: &str,
    schema_name: &str,
    limit: i64,
    offset: i64,
) -> Result<Value, String> {
    let creds = get_connection_credentials(db, connection_id)?;
    let config = creds.to_conn_config(database_name);

    // OFFSET/FETCH requires ORDER BY; use (SELECT NULL) for stable no-op ordering
    let data_sql = if offset > 0 {
        format!(
            "SELECT * FROM [{}].[{}] ORDER BY (SELECT NULL) OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",
            schema_name, table_name, offset, limit
        )
    } else {
        format!("SELECT TOP {} * FROM [{}].[{}]", limit, schema_name, table_name)
    };

    let count_sql = format!("SELECT COUNT(*) AS total FROM [{}].[{}]", schema_name, table_name);

    let col_type_sql = format!(
        "SELECT c.name, tp.name AS data_type, c.max_length \
         FROM sys.columns c \
         INNER JOIN sys.types tp ON c.user_type_id = tp.user_type_id \
         INNER JOIN sys.tables t ON c.object_id = t.object_id \
         INNER JOIN sys.schemas s ON t.schema_id = s.schema_id \
         WHERE t.name = '{}' AND s.name = '{}' \
         ORDER BY c.column_id",
        table_name, schema_name
    );

    let (rows_result, count_result, col_types_result) = tokio::try_join!(
        driver.run_query(&config, &data_sql, None),
        driver.run_query(&config, &count_sql, None),
        driver.run_query(&config, &col_type_sql, None),
    )?;

    let rows = rows_result.as_array().cloned().unwrap_or_default();

    // Build column metadata from actual SQL Server sys.columns types
    let col_types = col_types_result.as_array().cloned().unwrap_or_default();
    let columns: Vec<Value> = if !col_types.is_empty() {
        col_types.iter().map(|ct| {
            let name = ct.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let data_type = ct.get("data_type").and_then(|v| v.as_str()).unwrap_or("varchar");
            let max_length = ct.get("max_length").and_then(|v| v.as_i64()).unwrap_or(0);
            let type_str = if max_length > 0
                && !["int", "bigint", "smallint", "tinyint", "bit", "float", "real", "money", "smallmoney", "datetime", "datetime2", "date", "time", "uniqueidentifier", "xml", "text", "ntext", "image"]
                    .contains(&data_type)
            {
                format!("{}({})", data_type, max_length)
            } else {
                data_type.to_string()
            };
            serde_json::json!({ "name": name, "type": type_str })
        }).collect()
    } else if let Some(first) = rows.first() {
        // Fallback: derive from first row values
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

    let total_rows = count_result
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("total"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    Ok(serde_json::json!({
        "columns": columns,
        "rows": rows,
        "total_rows": total_rows,
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
                        // May already be an array
                        obj.get("columns").cloned().unwrap_or(Value::Array(vec![]))
                    });
                obj.insert("columns".to_string(), cols_parsed);
            }
            idx
        })
        .collect()
}
