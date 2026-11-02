//! Encrypted backup packages (`.kpos`) and safe restore.
//!
//! A `.kpos` file is a small JSON header followed by a SQLCipher database that is
//! encrypted with a key derived from the owner's backup password (Argon2id).
//! SQLCipher authenticates every page (HMAC-SHA512), so a wrong password or a
//! tampered file is detected; a SHA-256 of the payload gives a clear "file is
//! damaged" message before decryption is even tried.
//!
//! The copy is taken from the live connection with `sqlcipher_export` inside one read
//! transaction, so it is consistent and includes data still in the WAL file.
//! Plaintext never touches the disk.

use argon2::{Algorithm, Argon2, Params, Version};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::connection::{latest_known_schema_version, open_encrypted_db, schema_version, sqlcipher_key_literal};
use crate::db::key::{fill_random, hex_decode, hex_encode};
use crate::error::PosError;

const MAGIC: &[u8; 8] = b"KPOSBK2\n";
pub const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KdfParams {
    pub algorithm: String, // "argon2id"
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    pub salt_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub magic: String,
    pub format_version: u32,
    pub created_at: String,
    pub app_version: String,
    pub schema_version: i64,
    pub payload_size_bytes: usize,
    pub payload_sha256: String,
    pub kdf: KdfParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreReport {
    pub manifest: BackupManifest,
    /// Where the database that was replaced was moved to (None if there was none).
    pub safety_copy_path: Option<String>,
}

pub struct CryptoBackupService;

fn derive_key(password: &str, kdf: &KdfParams) -> Result<[u8; 32], PosError> {
    if kdf.algorithm != "argon2id" {
        return Err(PosError::Validation(format!("Unsupported backup key algorithm '{}'", kdf.algorithm)));
    }
    let salt = hex_decode(&kdf.salt_hex)?;
    let params = Params::new(kdf.memory_kib, kdf.iterations, kdf.parallelism, Some(32))
        .map_err(|e| PosError::Validation(format!("Invalid backup key parameters: {}", e)))?;
    let mut out = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), &salt, &mut out)
        .map_err(|e| PosError::Validation(format!("Backup key derivation failed: {}", e)))?;
    Ok(out)
}

fn sha256_hex(data: &[u8]) -> String {
    hex_encode(&Sha256::digest(data))
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}

fn remove_quietly(path: &Path) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(sibling(path, "-wal"));
    let _ = fs::remove_file(sibling(path, "-shm"));
}

/// Copies every table of `from` (an open connection) into a new SQLCipher file
/// encrypted with `key`, within one read transaction.
fn export_into(from: &Connection, dest: &Path, key: &[u8; 32]) -> Result<(), PosError> {
    remove_quietly(dest);
    let dest_str = dest
        .to_str()
        .ok_or_else(|| PosError::Db("Backup path is not valid UTF-8".into()))?;
    let key_text = sqlcipher_key_literal(key);
    let key_text = key_text.trim_matches('"');
    from.execute("ATTACH DATABASE ?1 AS npdest KEY ?2", params![dest_str, key_text])
        .map_err(|e| PosError::Db(format!("Failed to create backup file: {}", e)))?;
    let result = (|| -> Result<(), PosError> {
        let uv: i64 = from.query_row("PRAGMA main.user_version", [], |r| r.get(0))?;
        from.execute_batch("BEGIN;")?;
        let exported = from
            .query_row("SELECT sqlcipher_export('npdest')", [], |_| Ok(()))
            .map_err(|e| PosError::Db(format!("Failed to copy data into backup: {}", e)));
        match exported {
            Ok(()) => from.execute_batch("COMMIT;")?,
            Err(e) => {
                let _ = from.execute_batch("ROLLBACK;");
                return Err(e);
            }
        }
        from.execute_batch(&format!("PRAGMA npdest.user_version = {};", uv))?;
        Ok(())
    })();
    let _ = from.execute_batch("DETACH DATABASE npdest;");
    result
}

/// Opens a SQLCipher file with a raw key and checks it fully.
fn open_and_check(path: &Path, key: &[u8; 32], what: &str) -> Result<Connection, PosError> {
    let conn = Connection::open(path)?;
    conn.execute_batch(&format!("PRAGMA key = {};", sqlcipher_key_literal(key)))?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
        .map_err(|_| PosError::Validation(format!("{}: wrong password, or the file is damaged", what)))?;
    if integrity != "ok" {
        return Err(PosError::Validation(format!("{} failed the integrity check: {}", what, integrity)));
    }
    Ok(conn)
}

impl CryptoBackupService {
    /// Writes an encrypted `.kpos` backup of the open database `conn` to `output_file`.
    /// The file is written to a temporary name and renamed only when complete.
    pub fn export_backup(
        conn: &Connection,
        output_file: &Path,
        password: &str,
    ) -> Result<BackupManifest, PosError> {
        if password.chars().count() < MIN_PASSWORD_LEN {
            return Err(PosError::Validation(format!(
                "Backup password must be at least {} characters",
                MIN_PASSWORD_LEN
            )));
        }
        if let Some(parent) = output_file.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .map_err(|e| PosError::Db(format!("Failed to create backup folder: {}", e)))?;
            }
        }

        let mut salt = [0u8; 16];
        fill_random(&mut salt);
        let kdf = KdfParams {
            algorithm: "argon2id".into(),
            memory_kib: 65536,
            iterations: 3,
            parallelism: 1,
            salt_hex: hex_encode(&salt),
        };
        let key = derive_key(password, &kdf)?;

        let tmp_db = sibling(output_file, ".exporting");
        let result = (|| -> Result<BackupManifest, PosError> {
            export_into(conn, &tmp_db, &key)?;
            let check = open_and_check(&tmp_db, &key, "New backup")?;
            let schema = schema_version(&check);
            drop(check);
            let payload = fs::read(&tmp_db)
                .map_err(|e| PosError::Db(format!("Failed to read backup data: {}", e)))?;

            let manifest = BackupManifest {
                magic: String::from_utf8_lossy(&MAGIC[..7]).to_string(),
                format_version: 2,
                created_at: chrono::Utc::now().to_rfc3339(),
                app_version: env!("CARGO_PKG_VERSION").to_string(),
                schema_version: schema,
                payload_size_bytes: payload.len(),
                payload_sha256: sha256_hex(&payload),
                kdf: kdf.clone(),
            };
            let header = serde_json::to_vec(&manifest)
                .map_err(|e| PosError::Db(format!("Failed to serialize backup header: {}", e)))?;

            let mut bundle = Vec::with_capacity(12 + header.len() + payload.len());
            bundle.extend_from_slice(MAGIC);
            bundle.extend_from_slice(&(header.len() as u32).to_le_bytes());
            bundle.extend_from_slice(&header);
            bundle.extend_from_slice(&payload);

            let part = sibling(output_file, ".part");
            fs::write(&part, &bundle)
                .map_err(|e| PosError::Db(format!("Failed to write backup file: {}", e)))?;
            fs::rename(&part, output_file)
                .map_err(|e| PosError::Db(format!("Failed to finish backup file: {}", e)))?;
            Ok(manifest)
        })();
        remove_quietly(&tmp_db);
        result
    }

    /// Reads and validates the header and payload checksum of a `.kpos` file.
    pub fn read_manifest(backup_file: &Path) -> Result<(BackupManifest, Vec<u8>), PosError> {
        let bundle = fs::read(backup_file)
            .map_err(|e| PosError::Db(format!("Failed to read backup file: {}", e)))?;
        if bundle.len() < 12 || &bundle[..8] != MAGIC {
            return Err(PosError::Validation("This is not a Next POS backup file (or it is an old, unsupported format)".into()));
        }
        let header_len = u32::from_le_bytes([bundle[8], bundle[9], bundle[10], bundle[11]]) as usize;
        if header_len > 64 * 1024 || bundle.len() < 12 + header_len {
            return Err(PosError::Validation("Backup file header is damaged".into()));
        }
        let manifest: BackupManifest = serde_json::from_slice(&bundle[12..12 + header_len])
            .map_err(|e| PosError::Validation(format!("Backup file header is damaged: {}", e)))?;
        let payload = bundle[12 + header_len..].to_vec();
        if payload.len() != manifest.payload_size_bytes || sha256_hex(&payload) != manifest.payload_sha256 {
            return Err(PosError::Validation("Backup file is damaged or incomplete (checksum mismatch)".into()));
        }
        Ok((manifest, payload))
    }

    /// Checks that a backup file is complete and opens with `password`, without restoring it.
    pub fn verify_backup(backup_file: &Path, password: &str) -> Result<BackupManifest, PosError> {
        let (manifest, payload) = Self::read_manifest(backup_file)?;
        let key = derive_key(password, &manifest.kdf)?;
        let tmp = sibling(backup_file, ".verifying");
        let result = (|| {
            fs::write(&tmp, &payload).map_err(|e| PosError::Db(format!("Failed to write temp file: {}", e)))?;
            let c = open_and_check(&tmp, &key, "Backup")?;
            drop(c);
            Ok(manifest)
        })();
        remove_quietly(&tmp);
        result
    }

    /// Restores `backup_file` into `target_db_path`, re-encrypting it with `target_key`
    /// (the shop's database key on this PC).
    ///
    /// Every connection to `target_db_path` must be closed first. The backup is fully
    /// decrypted, integrity-checked and re-encrypted into a new file before anything is
    /// touched; then the current database (with its -wal/-shm files) is moved aside as a
    /// safety copy and the new file is renamed into place.
    pub fn restore_backup(
        backup_file: &Path,
        target_db_path: &Path,
        password: &str,
        target_key: &[u8; 32],
    ) -> Result<RestoreReport, PosError> {
        let (manifest, payload) = Self::read_manifest(backup_file)?;
        if manifest.schema_version > latest_known_schema_version() {
            return Err(PosError::Validation(format!(
                "This backup was made by a newer version of Next POS (schema V{}); update the app first",
                manifest.schema_version
            )));
        }
        let key = derive_key(password, &manifest.kdf)?;

        let decrypted = sibling(target_db_path, ".restore_src");
        let staged = sibling(target_db_path, ".restore_new");
        let result = (|| -> Result<RestoreReport, PosError> {
            fs::write(&decrypted, &payload)
                .map_err(|e| PosError::Db(format!("Failed to write temp file: {}", e)))?;
            let src = open_and_check(&decrypted, &key, "Backup")?;
            export_into(&src, &staged, target_key)?;
            drop(src);

            // The staged file must open with the shop key and pass the integrity check.
            {
                let check = open_encrypted_db(&staged, target_key)?;
                let integrity: String = check.query_row("PRAGMA integrity_check;", [], |r| r.get(0))?;
                if integrity != "ok" {
                    return Err(PosError::Validation(format!("Restored database failed the integrity check: {}", integrity)));
                }
                check.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
            }
            let _ = fs::remove_file(sibling(&staged, "-wal"));
            let _ = fs::remove_file(sibling(&staged, "-shm"));

            // Move the current database (and its WAL/SHM) aside, then put the new one in place.
            let mut safety_copy_path = None;
            if target_db_path.exists() {
                let stamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
                let safety = sibling(target_db_path, &format!(".pre_restore_{}", stamp));
                fs::rename(target_db_path, &safety).map_err(|e| {
                    PosError::Db(format!(
                        "Could not move the current database aside (is the app still using it?): {}",
                        e
                    ))
                })?;
                for ext in ["-wal", "-shm"] {
                    let from = sibling(target_db_path, ext);
                    if from.exists() {
                        let _ = fs::rename(&from, sibling(&safety, ext));
                    }
                }
                safety_copy_path = Some(safety.to_string_lossy().to_string());
            }
            if let Err(e) = fs::rename(&staged, target_db_path) {
                // Put the original back so the shop is never left without a database.
                if let Some(ref s) = safety_copy_path {
                    let s = PathBuf::from(s);
                    let _ = fs::rename(&s, target_db_path);
                    for ext in ["-wal", "-shm"] {
                        let _ = fs::rename(sibling(&s, ext), sibling(target_db_path, ext));
                    }
                }
                return Err(PosError::Db(format!("Failed to put the restored database in place: {}", e)));
            }
            Ok(RestoreReport { manifest: manifest.clone(), safety_copy_path })
        })();
        remove_quietly(&decrypted);
        remove_quietly(&staged);
        result
    }
}
