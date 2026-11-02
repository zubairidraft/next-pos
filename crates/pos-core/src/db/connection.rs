use crate::error::{PosError, Result};
use rusqlite::Connection;
use std::path::Path;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("src/db/migrations");
}

/// Hex form of a raw 256-bit key as SQLCipher expects it: `x'..'` (no KDF, key used as-is).
pub(crate) fn sqlcipher_key_literal(key: &[u8; 32]) -> String {
    let hex_key: String = key.iter().map(|b| format!("{:02x}", b)).collect();
    format!("\"x'{}'\"", hex_key)
}

/// Returns the linked SQLCipher version, or an error if the binary was built against
/// plain SQLite. The app must never run without encryption, so callers fail closed.
pub fn sqlcipher_version(conn: &Connection) -> Result<String> {
    let v: Option<String> = conn
        .query_row("PRAGMA cipher_version;", [], |r| r.get(0))
        .ok();
    match v {
        Some(v) if !v.trim().is_empty() => Ok(v),
        _ => Err(PosError::Db(
            "This build is not linked with SQLCipher; refusing to open an unencrypted database".into(),
        )),
    }
}

/// Opens (or creates) a SQLCipher AES-256 encrypted database.
/// Fails if SQLCipher is not linked or the key is wrong, then enforces
/// WAL mode, foreign keys and a busy timeout on the connection.
pub fn open_encrypted_db(db_path: &Path, key: &[u8; 32]) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| {
                PosError::Db(format!("Failed to create database parent directory: {}", e))
            })?;
        }
    }

    let conn = Connection::open(db_path)
        .map_err(|e| PosError::Db(format!("Failed to open SQLite database: {}", e)))?;

    // SQLCipher requires PRAGMA key before any other statement touches the file.
    conn.execute_batch(&format!("PRAGMA key = {};", sqlcipher_key_literal(key)))
        .map_err(|e| PosError::Db(format!("Failed to set SQLCipher encryption key: {}", e)))?;

    sqlcipher_version(&conn)?;

    // Reading the schema is the first real decrypt; a wrong key fails here.
    let _verification: i64 = conn
        .query_row("SELECT count(*) FROM sqlite_master;", [], |row| row.get(0))
        .map_err(|e| {
            PosError::Db(format!(
                "Failed to verify database encryption key (wrong key or corrupted file): {}",
                e
            ))
        })?;

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )
    .map_err(|e| PosError::Db(format!("Failed to set database pragmas: {}", e)))?;

    Ok(conn)
}

/// Applies all pending database migrations via refinery.
pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    embedded::migrations::runner()
        .run(conn)
        .map_err(|e| PosError::Db(format!("Database migration failed: {}", e)))?;
    Ok(())
}

/// Highest applied migration version (e.g. 7 for V7), or 0 for an empty database.
pub fn schema_version(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM refinery_schema_history",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Highest migration version this build of the app knows about.
pub fn latest_known_schema_version() -> i64 {
    embedded::migrations::runner()
        .get_migrations()
        .iter()
        .map(|m| m.version() as i64)
        .max()
        .unwrap_or(0)
}
