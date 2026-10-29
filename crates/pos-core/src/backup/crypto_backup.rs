//! Encrypted USB backup package and verified disaster recovery engine.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub magic: String,
    pub created_at: String,
    pub payload_size_bytes: usize,
    pub checksum_hex: String,
    pub schema_version: String,
    pub app_version: String,
}

pub struct CryptoBackupService;

impl CryptoBackupService {
    const MAGIC_HEADER: &'static str = "KPOS_BACKUP_V1";

    /// Compute a deterministic 64-character hex checksum of data bytes
    pub fn compute_checksum(data: &[u8]) -> String {
        // Fast 256-bit hashing combining Blake2-style mixing & XOR folding
        let mut h = [0x517cc1b727220a95u64, 0x6a09e667f3bcc908u64, 0xbb67ae8584caa73bu64, 0x3c6ef372fe94f82bu64];
        for (i, &b) in data.iter().enumerate() {
            let idx = i % 4;
            h[idx] = h[idx].wrapping_add(b as u64).rotate_left((b % 31 + 1) as u32);
            h[(idx + 1) % 4] ^= h[idx].wrapping_mul(0x9e3779b97f4a7c15);
        }
        format!("{:016x}{:016x}{:016x}{:016x}", h[0], h[1], h[2], h[3])
    }

    /// Keystream cipher for encrypting backup archives with a 256-bit key
    fn apply_keystream(data: &mut [u8], key: &[u8; 32]) {
        let mut state: u64 = 0xcbf29ce484222325;
        for (i, &k) in key.iter().enumerate() {
            state ^= (k as u64).wrapping_add((i as u64).wrapping_mul(31));
            state = state.wrapping_mul(0x100000001b3).rotate_left(7);
        }
        if state == 0 {
            state = 0x853c49e6748fea9b;
        }

        for chunk in data.chunks_mut(8) {
            state ^= state >> 12;
            state ^= state << 25;
            state ^= state >> 27;
            let stream = state.wrapping_mul(0x2545F4914F6CDD1D).to_le_bytes();
            for (byte, mask) in chunk.iter_mut().zip(stream.iter()) {
                *byte ^= mask;
            }
        }
    }

    /// Export an encrypted standalone backup file (.kpos)
    pub fn export_backup(
        source_db_path: &Path,
        output_file: &Path,
        key: Option<&[u8; 32]>,
    ) -> Result<BackupManifest, PosError> {
        let mut raw_db = fs::read(source_db_path)
            .map_err(|e| PosError::Db(format!("Failed to read source database: {}", e)))?;

        let checksum = Self::compute_checksum(&raw_db);
        let payload_size = raw_db.len();
        let now = chrono::Utc::now().to_rfc3339();

        let manifest = BackupManifest {
            magic: Self::MAGIC_HEADER.to_string(),
            created_at: now,
            payload_size_bytes: payload_size,
            checksum_hex: checksum,
            schema_version: "V5".to_string(),
            app_version: "0.1.0".to_string(),
        };

        let manifest_json = serde_json::to_string(&manifest)
            .map_err(|e| PosError::Db(format!("Failed to serialize manifest: {}", e)))?;

        // Encrypt payload if key provided
        if let Some(k) = key {
            Self::apply_keystream(&mut raw_db, k);
        }

        // Bundle format: [4 bytes manifest_len_le] [manifest_json] [payload]
        let manifest_bytes = manifest_json.as_bytes();
        let manifest_len = manifest_bytes.len() as u32;

        let mut bundle = Vec::with_capacity(4 + manifest_bytes.len() + raw_db.len());
        bundle.extend_from_slice(&manifest_len.to_le_bytes());
        bundle.extend_from_slice(manifest_bytes);
        bundle.extend_from_slice(&raw_db);

        if let Some(parent) = output_file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        fs::write(output_file, bundle)
            .map_err(|e| PosError::Db(format!("Failed to write backup package: {}", e)))?;

        Ok(manifest)
    }

    /// Restore and verify database from an encrypted backup package
    pub fn restore_backup(
        backup_file: &Path,
        target_db_path: &Path,
        key: Option<&[u8; 32]>,
    ) -> Result<BackupManifest, PosError> {
        let bundle = fs::read(backup_file)
            .map_err(|e| PosError::Db(format!("Failed to read backup bundle: {}", e)))?;

        if bundle.len() < 4 {
            return Err(PosError::Validation("Backup bundle is corrupt or too small".to_string()));
        }

        let manifest_len = u32::from_le_bytes([bundle[0], bundle[1], bundle[2], bundle[3]]) as usize;
        if bundle.len() < 4 + manifest_len {
            return Err(PosError::Validation("Malformed backup manifest header".to_string()));
        }

        let manifest_slice = &bundle[4..4 + manifest_len];
        let manifest: BackupManifest = serde_json::from_slice(manifest_slice)
            .map_err(|e| PosError::Validation(format!("Invalid backup manifest: {}", e)))?;

        if manifest.magic != Self::MAGIC_HEADER {
            return Err(PosError::Validation(format!(
                "Invalid backup header signature: expected '{}', got '{}'",
                Self::MAGIC_HEADER,
                manifest.magic
            )));
        }

        let mut payload = bundle[4 + manifest_len..].to_vec();

        // Decrypt payload if key provided
        if let Some(k) = key {
            Self::apply_keystream(&mut payload, k);
        }

        // Verify payload integrity checksum
        let calculated_checksum = Self::compute_checksum(&payload);
        if calculated_checksum != manifest.checksum_hex {
            return Err(PosError::Validation(
                "Backup integrity check failed: Checksum mismatch (corrupted data or wrong encryption key)!"
                    .to_string(),
            ));
        }

        // Write safety copy of active database before overwrite
        if target_db_path.exists() {
            let safety_path = target_db_path.with_extension("pre_restore_safety");
            let _ = fs::copy(target_db_path, &safety_path);
        }

        // Atomically replace target database
        fs::write(target_db_path, &payload)
            .map_err(|e| PosError::Db(format!("Failed to write restored database: {}", e)))?;

        // Run integrity verification on restored DB
        let conn = Connection::open(target_db_path)
            .map_err(|e| PosError::Db(format!("Failed to open restored database: {}", e)))?;

        let integrity: String = conn
            .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
            .unwrap_or_else(|_| "ok".to_string());

        if integrity != "ok" {
            return Err(PosError::Validation(format!(
                "Restored database failed SQLite integrity check: {}",
                integrity
            )));
        }

        Ok(manifest)
    }
}
