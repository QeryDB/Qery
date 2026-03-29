use rusqlite::{Connection, Row, params};
use serde_json::{Value, json, Map};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn row_to_json(row: &Row, column_names: &[String]) -> Result<Value, rusqlite::Error> {
    let mut map = Map::new();
    for (i, name) in column_names.iter().enumerate() {
        let val: Value = match row.get_ref(i)? {
            rusqlite::types::ValueRef::Null => Value::Null,
            rusqlite::types::ValueRef::Integer(n) => {
                Value::Number(serde_json::Number::from(n))
            }
            rusqlite::types::ValueRef::Real(f) => {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            }
            rusqlite::types::ValueRef::Text(s) => {
                Value::String(String::from_utf8_lossy(s).to_string())
            }
            rusqlite::types::ValueRef::Blob(b) => {
                Value::String(base64::engine::general_purpose::STANDARD.encode(b))
            }
        };
        map.insert(name.clone(), val);
    }
    Ok(Value::Object(map))
}

use base64::Engine as _;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn get_descriptions(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    filters: Option<&Value>,
) -> Result<Vec<Value>, String> {
    let mut conditions = vec![
        "connection_id = ?".to_string(),
        "database_name = ?".to_string(),
    ];
    let mut param_values: Vec<String> = vec![
        connection_id.to_string(),
        database_name.to_string(),
    ];

    if let Some(f) = filters {
        if let Some(status) = f.get("status").and_then(|v| v.as_str()) {
            if status != "all" {
                conditions.push("status = ?".to_string());
                param_values.push(status.to_string());
            }
        }
        if let Some(object_name) = f.get("objectName").and_then(|v| v.as_str()) {
            conditions.push("object_name = ?".to_string());
            param_values.push(object_name.to_string());
        }
        if let Some(search) = f.get("search").and_then(|v| v.as_str()) {
            if !search.is_empty() {
                conditions.push(
                    "(column_alias LIKE ? OR source_column_clean LIKE ? OR parsed_description LIKE ? OR confirmed_description LIKE ? OR object_name LIKE ?)".to_string(),
                );
                let like = format!("%{}%", search);
                for _ in 0..5 {
                    param_values.push(like.clone());
                }
            }
        }
    }

    let sql = format!(
        "SELECT * FROM parsed_column_descriptions WHERE {} ORDER BY object_name, column_alias",
        conditions.join(" AND ")
    );

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    // Build parameter references
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            row_to_json(row, &column_names)
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_description_stats(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<Value, String> {
    let mut stmt = db
        .prepare(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
                SUM(CASE WHEN flags LIKE '%no_description%' THEN 1 ELSE 0 END) as no_description,
                SUM(CASE WHEN flags LIKE '%has_msg_alias%' THEN 1 ELSE 0 END) as has_msg_alias
             FROM parsed_column_descriptions
             WHERE connection_id = ? AND database_name = ?",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(params![connection_id, database_name])
        .map_err(|e| e.to_string())?;

    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => {
            let total: i64 = row.get(0).unwrap_or(0);
            let confirmed: i64 = row.get(1).unwrap_or(0);
            let pending: i64 = row.get(2).unwrap_or(0);
            let dismissed: i64 = row.get(3).unwrap_or(0);
            let no_description: i64 = row.get(4).unwrap_or(0);
            let has_msg_alias: i64 = row.get(5).unwrap_or(0);
            Ok(json!({
                "total": total,
                "confirmed": confirmed,
                "pending": pending,
                "dismissed": dismissed,
                "no_description": no_description,
                "has_msg_alias": has_msg_alias,
            }))
        }
        None => Ok(json!({
            "total": 0,
            "confirmed": 0,
            "pending": 0,
            "dismissed": 0,
            "no_description": 0,
            "has_msg_alias": 0,
        })),
    }
}

pub fn get_distinct_objects(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
) -> Result<Vec<Value>, String> {
    let mut stmt = db
        .prepare(
            "SELECT DISTINCT object_name, object_type FROM parsed_column_descriptions
             WHERE connection_id = ? AND database_name = ?
             ORDER BY object_name",
        )
        .map_err(|e| e.to_string())?;

    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let rows = stmt
        .query_map(params![connection_id, database_name], |row| {
            row_to_json(row, &column_names)
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn update_status(
    db: &Connection,
    id: i64,
    status: &str,
    confirmed_description: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(desc) = confirmed_description {
        db.execute(
            "UPDATE parsed_column_descriptions SET status = ?, confirmed_description = ?, updated_at = ? WHERE id = ?",
            params![status, desc, now, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE parsed_column_descriptions SET status = ?, updated_at = ? WHERE id = ?",
            params![status, now, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn bulk_update_status(db: &Connection, ids: &[i64], status: &str) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let placeholders_str = placeholders.join(",");

    if status == "confirmed" {
        // For bulk confirm, copy parsed_description to confirmed_description if not already set
        let sql = format!(
            "UPDATE parsed_column_descriptions
             SET status = ?, confirmed_description = COALESCE(confirmed_description, parsed_description), updated_at = ?
             WHERE id IN ({})",
            placeholders_str
        );

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        param_values.push(Box::new(status.to_string()));
        param_values.push(Box::new(now));
        for id in ids {
            param_values.push(Box::new(*id));
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|b| b.as_ref()).collect();

        db.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    } else {
        let sql = format!(
            "UPDATE parsed_column_descriptions SET status = ?, updated_at = ? WHERE id IN ({})",
            placeholders_str
        );

        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        param_values.push(Box::new(status.to_string()));
        param_values.push(Box::new(now));
        for id in ids {
            param_values.push(Box::new(*id));
        }
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|b| b.as_ref()).collect();

        db.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Bulk insert parsed descriptions. Preserves confirmed rows -- only replaces pending/dismissed.
pub fn bulk_replace(
    db: &Connection,
    connection_id: &str,
    database_name: &str,
    rows: &[Value],
) -> Result<(), String> {
    // Get existing confirmed rows to preserve them
    let mut confirmed_set = std::collections::HashSet::new();
    {
        let mut stmt = db
            .prepare(
                "SELECT schema_name, object_name, column_alias FROM parsed_column_descriptions
                 WHERE connection_id = ? AND database_name = ? AND status = 'confirmed'",
            )
            .map_err(|e| e.to_string())?;

        let confirmed_rows = stmt
            .query_map(params![connection_id, database_name], |row| {
                let schema_name: String = row.get(0)?;
                let object_name: String = row.get(1)?;
                let column_alias: String = row.get(2)?;
                Ok(format!("{}.{}.{}", schema_name, object_name, column_alias))
            })
            .map_err(|e| e.to_string())?;

        for key in confirmed_rows {
            confirmed_set.insert(key.map_err(|e| e.to_string())?);
        }
    }

    // Delete non-confirmed rows
    db.execute(
        "DELETE FROM parsed_column_descriptions
         WHERE connection_id = ? AND database_name = ? AND status != 'confirmed'",
        params![connection_id, database_name],
    )
    .map_err(|e| e.to_string())?;

    // Insert new rows, skipping those that are already confirmed
    let mut stmt = db
        .prepare(
            "INSERT OR IGNORE INTO parsed_column_descriptions
                (connection_id, database_name, schema_name, object_name, object_type, column_alias,
                 source_expression, source_column_clean, parsed_description, status, flags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10)",
        )
        .map_err(|e| e.to_string())?;

    for row in rows {
        let schema_name = row
            .get("schema_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let object_name = row
            .get("object_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let column_alias = row
            .get("column_alias")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let key = format!("{}.{}.{}", schema_name, object_name, column_alias);
        if confirmed_set.contains(&key) {
            continue; // don't overwrite confirmed
        }

        let r_connection_id = row
            .get("connection_id")
            .and_then(|v| v.as_str())
            .unwrap_or(connection_id);
        let r_database_name = row
            .get("database_name")
            .and_then(|v| v.as_str())
            .unwrap_or(database_name);
        let object_type = row
            .get("object_type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let source_expression = row.get("source_expression").and_then(|v| v.as_str());
        let source_column_clean = row.get("source_column_clean").and_then(|v| v.as_str());
        let parsed_description = row.get("parsed_description").and_then(|v| v.as_str());
        let flags = row
            .get("flags")
            .and_then(|v| v.as_str())
            .unwrap_or("[]");

        stmt.execute(params![
            r_connection_id,
            r_database_name,
            schema_name,
            object_name,
            object_type,
            column_alias,
            source_expression,
            source_column_clean,
            parsed_description,
            flags,
        ])
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
