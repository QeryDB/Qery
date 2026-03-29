use rusqlite::Connection;

pub fn run_all_migrations(db: &Connection) -> Result<(), String> {
    migration_001_initial(db)?;
    migration_002_ghost_fk(db)?;
    migration_003_cached_definitions(db)?;
    migration_004_parsed_descriptions(db)?;
    migration_005_connection_sort_order(db)?;
    migration_006_saved_query_folders(db)?;
    migration_007_table_favorites(db)?;
    migration_008_session_state(db)?;
    migration_009_performance_indexes(db)?;
    migration_010_database_type(db)?;
    Ok(())
}

fn migration_001_initial(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            server TEXT NOT NULL,
            port INTEGER DEFAULT 1433,
            database_name TEXT,
            auth_type TEXT CHECK(auth_type IN ('integrated','sql')) DEFAULT 'integrated',
            username TEXT,
            encrypted_password TEXT,
            color TEXT,
            is_favorite INTEGER DEFAULT 0,
            last_connected_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cached_schemas (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
            database_name TEXT NOT NULL,
            schema_json TEXT NOT NULL,
            cached_at TEXT DEFAULT (datetime('now')),
            UNIQUE(connection_id, database_name)
        );

        CREATE TABLE IF NOT EXISTS query_history (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
            database_name TEXT,
            sql_text TEXT NOT NULL,
            executed_at TEXT DEFAULT (datetime('now')),
            duration_ms INTEGER,
            row_count INTEGER,
            status TEXT CHECK(status IN ('success','error')) DEFAULT 'success',
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS saved_queries (
            id TEXT PRIMARY KEY,
            connection_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            sql_text TEXT NOT NULL,
            tags TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS table_annotations (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            database_name TEXT NOT NULL,
            table_name TEXT NOT NULL,
            column_name TEXT,
            note TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS table_relationships (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            database_name TEXT NOT NULL,
            from_table TEXT NOT NULL,
            from_column TEXT NOT NULL,
            to_table TEXT NOT NULL,
            to_column TEXT NOT NULL,
            relationship_type TEXT,
            description TEXT,
            is_auto_detected INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        ",
    )
    .map_err(|e| format!("Migration 001 failed: {}", e))
}

fn migration_002_ghost_fk(db: &Connection) -> Result<(), String> {
    let has_column: bool = db
        .prepare("PRAGMA table_info(table_relationships)")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .any(|name| name.map(|n| n == "is_dismissed").unwrap_or(false));

    if !has_column {
        db.execute_batch(
            "ALTER TABLE table_relationships ADD COLUMN is_dismissed INTEGER DEFAULT 0",
        )
        .map_err(|e| format!("Migration 002 failed: {}", e))?;
    }
    Ok(())
}

fn migration_003_cached_definitions(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS cached_object_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
            database_name TEXT NOT NULL,
            schema_name TEXT NOT NULL DEFAULT 'dbo',
            object_name TEXT NOT NULL,
            detail_type TEXT NOT NULL,
            data_json TEXT NOT NULL,
            cached_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(connection_id, database_name, schema_name, object_name, detail_type)
        )
        ",
    )
    .map_err(|e| format!("Migration 003 failed: {}", e))
}

fn migration_004_parsed_descriptions(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS parsed_column_descriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
            database_name TEXT NOT NULL,
            schema_name TEXT NOT NULL DEFAULT 'dbo',
            object_name TEXT NOT NULL,
            object_type TEXT NOT NULL,
            column_alias TEXT NOT NULL,
            source_expression TEXT,
            source_column_clean TEXT,
            parsed_description TEXT,
            confirmed_description TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            flags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(connection_id, database_name, schema_name, object_name, column_alias)
        );

        CREATE INDEX IF NOT EXISTS idx_parsed_col_desc_conn_db
        ON parsed_column_descriptions(connection_id, database_name);

        CREATE INDEX IF NOT EXISTS idx_parsed_col_desc_status
        ON parsed_column_descriptions(status);
        ",
    )
    .map_err(|e| format!("Migration 004 failed: {}", e))
}

fn migration_005_connection_sort_order(db: &Connection) -> Result<(), String> {
    let has_column: bool = db
        .prepare("PRAGMA table_info(connections)")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .any(|name| name.map(|n| n == "sort_order").unwrap_or(false));

    if !has_column {
        db.execute_batch("ALTER TABLE connections ADD COLUMN sort_order INTEGER DEFAULT 0")
            .map_err(|e| format!("Migration 005 failed: {}", e))?;
    }
    Ok(())
}

fn migration_006_saved_query_folders(db: &Connection) -> Result<(), String> {
    let columns: Vec<String> = db
        .prepare("PRAGMA table_info(saved_queries)")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if !columns.contains(&"project_name".to_string()) {
        db.execute_batch("ALTER TABLE saved_queries ADD COLUMN project_name TEXT")
            .map_err(|e| format!("Migration 006 (project_name) failed: {}", e))?;
    }
    if !columns.contains(&"folder_name".to_string()) {
        db.execute_batch("ALTER TABLE saved_queries ADD COLUMN folder_name TEXT")
            .map_err(|e| format!("Migration 006 (folder_name) failed: {}", e))?;
    }
    Ok(())
}

fn migration_007_table_favorites(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS table_favorites (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            database_name TEXT NOT NULL,
            schema_name TEXT NOT NULL,
            table_name TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(connection_id, database_name, schema_name, table_name)
        )
        ",
    )
    .map_err(|e| format!("Migration 007 failed: {}", e))
}

fn migration_008_session_state(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS session_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        ",
    )
    .map_err(|e| format!("Migration 008 failed: {}", e))
}

fn migration_009_performance_indexes(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_cached_obj_details_lookup
        ON cached_object_details(connection_id, database_name, object_name, schema_name, detail_type);

        CREATE INDEX IF NOT EXISTS idx_cached_schemas_lookup
        ON cached_schemas(connection_id, database_name);

        CREATE INDEX IF NOT EXISTS idx_query_history_lookup
        ON query_history(connection_id, executed_at DESC);

        CREATE INDEX IF NOT EXISTS idx_saved_queries_lookup
        ON saved_queries(connection_id, project_name);

        CREATE INDEX IF NOT EXISTS idx_session_state_key
        ON session_state(key);
        ",
    )
    .map_err(|e| format!("Migration 009 failed: {}", e))
}

fn migration_010_database_type(db: &Connection) -> Result<(), String> {
    // Add database_type column — ALTER TABLE ADD COLUMN is idempotent-safe
    // (SQLite ignores if column already exists when using IF NOT EXISTS pattern via check)
    let has_col: bool = db
        .prepare("PRAGMA table_info(connections)")
        .and_then(|mut stmt| {
            let names: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            Ok(names.contains(&"database_type".to_string()))
        })
        .unwrap_or(false);

    if !has_col {
        db.execute_batch("ALTER TABLE connections ADD COLUMN database_type TEXT DEFAULT 'mssql'")
            .map_err(|e| format!("Migration 010 failed: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn in_memory_db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
        db
    }

    #[test]
    fn init_creates_all_tables() {
        let db = in_memory_db();
        run_all_migrations(&db).unwrap();

        let tables: Vec<String> = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"connections".to_string()));
        assert!(tables.contains(&"cached_schemas".to_string()));
        assert!(tables.contains(&"query_history".to_string()));
        assert!(tables.contains(&"saved_queries".to_string()));
        assert!(tables.contains(&"table_annotations".to_string()));
        assert!(tables.contains(&"table_relationships".to_string()));
        assert!(tables.contains(&"cached_object_details".to_string()));
        assert!(tables.contains(&"parsed_column_descriptions".to_string()));
        assert!(tables.contains(&"table_favorites".to_string()));
        assert!(tables.contains(&"session_state".to_string()));
    }

    #[test]
    fn migrations_are_idempotent() {
        let db = in_memory_db();
        run_all_migrations(&db).unwrap();
        run_all_migrations(&db).unwrap(); // second run should not error
    }
}
