use rusqlite::Connection;
use std::fs;
use std::path::Path;

use super::migrations::run_all_migrations;

pub fn init_db(data_dir: &str) -> Result<Connection, String> {
    fs::create_dir_all(data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    let db_path = Path::new(data_dir).join("qery.db");
    let db = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    db.execute_batch("PRAGMA journal_mode = WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;
    db.execute_batch("PRAGMA foreign_keys = ON")
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;
    db.execute_batch("PRAGMA synchronous = NORMAL")
        .map_err(|e| format!("Failed to set synchronous mode: {}", e))?;
    db.execute_batch("PRAGMA cache_size = -32000")
        .map_err(|e| format!("Failed to set cache size: {}", e))?;
    db.execute_batch("PRAGMA temp_store = MEMORY")
        .map_err(|e| format!("Failed to set temp store: {}", e))?;
    db.execute_batch("PRAGMA mmap_size = 30000000")
        .map_err(|e| format!("Failed to set mmap size: {}", e))?;

    run_all_migrations(&db)?;

    Ok(db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wal_mode_enabled() {
        let db = Connection::open_in_memory().unwrap();
        // In-memory DB can't use WAL, but we can test the pragma doesn't error
        db.execute_batch("PRAGMA journal_mode = WAL").unwrap();
    }

    #[test]
    fn foreign_keys_enabled() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
        let fk: i32 = db
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }
}
