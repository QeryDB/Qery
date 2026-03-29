use rusqlite::{Connection, params};
use serde_json::Value;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn get_cached_detail(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
    detail_type: &str,
) -> Result<Option<Value>, String> {
    // ghost_fks cache expires after 1 hour; other detail types are long-lived
    let ttl_clause = if detail_type == "ghost_fks" {
        " AND cached_at > datetime('now', '-1 hour')"
    } else {
        ""
    };
    let sql = format!(
        "SELECT data_json FROM cached_object_details
         WHERE connection_id = ? AND database_name = ? AND schema_name = ? AND object_name = ? AND detail_type = ?{}",
        ttl_clause
    );
    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![
            connection_id,
            database_name,
            schema_name,
            object_name,
            detail_type,
        ])
        .map_err(|e| e.to_string())?;

    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => {
            let data_json: String = row.get(0).map_err(|e| e.to_string())?;
            let parsed: Value =
                serde_json::from_str(&data_json).map_err(|e| e.to_string())?;
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}

pub fn set_cached_detail(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
    detail_type: &str,
    data_json: &str,
) -> Result<(), String> {
    db.execute(
        "INSERT OR REPLACE INTO cached_object_details (connection_id, database_name, schema_name, object_name, detail_type, data_json, cached_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            connection_id,
            database_name,
            schema_name,
            object_name,
            detail_type,
            data_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn delete_cached_detail(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    object_name: &str,
    schema_name: &str,
    detail_type: Option<&str>,
) -> Result<(), String> {
    if let Some(dt) = detail_type {
        db.execute(
            "DELETE FROM cached_object_details
             WHERE connection_id = ? AND database_name = ? AND schema_name = ? AND object_name = ? AND detail_type = ?",
            params![connection_id, database_name, schema_name, object_name, dt],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "DELETE FROM cached_object_details
             WHERE connection_id = ? AND database_name = ? AND schema_name = ? AND object_name = ?",
            params![connection_id, database_name, schema_name, object_name],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn delete_all_cached_details(
    db: &Connection,
    connection_id: &str,
    database_name: Option<&str>,
) -> Result<(), String> {
    if let Some(dbname) = database_name {
        db.execute(
            "DELETE FROM cached_object_details WHERE connection_id = ? AND database_name = ?",
            params![connection_id, dbname],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "DELETE FROM cached_object_details WHERE connection_id = ?",
            params![connection_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
