use crate::error::{PosError, Result};
use rusqlite::Connection;
use std::path::Path;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("src/db/migrations");
}

/// Opens an encrypted SQLite database using SQLCipher.
/// Enforces WAL mode and foreign key constraints on every connection.
pub fn open_encrypted_db(db_path: &Path, key: &[u8; 32]) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                PosError::Db(format!("Failed to create database parent directory: {}", e))
            })?;
        }
    }

    let conn = Connection::open(db_path)
        .map_err(|e| PosError::Db(format!("Failed to open SQLite database: {}", e)))?;

    // SQLCipher requires PRAGMA key to be set before any other operation
    let hex_key: String = key.iter().map(|b| format!("{:02x}", b)).collect();
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex_key))
        .map_err(|e| PosError::Db(format!("Failed to set SQLCipher encryption key: {}", e)))?;

    // Configure connection pragmas for performance and resilience
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )
    .map_err(|e| PosError::Db(format!("Failed to set database pragmas: {}", e)))?;

    // Verify key correctness by reading schema
    let _verification: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master;", [], |row| {
            row.get(0)
        })
        .map_err(|e| {
            PosError::Db(format!(
                "Failed to verify database encryption key (file may be corrupted or key wrong): {}",
                e
            ))
        })?;

    Ok(conn)
}

/// Applies all pending database migrations via refinery.
pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    embedded::migrations::runner()
        .run(conn)
        .map_err(|e| PosError::Db(format!("Database migration failed: {}", e)))?;
    Ok(())
}
