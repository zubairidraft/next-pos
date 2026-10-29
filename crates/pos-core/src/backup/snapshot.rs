//! Automated WAL snapshots and rolling retention manager.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub path: String,
    pub filename: String,
    pub file_size_bytes: u64,
    pub created_at: String,
    pub is_valid: bool,
}

pub struct SnapshotManager;

impl SnapshotManager {
    /// Create a consistent online snapshot of the database using SQLite VACUUM INTO
    pub fn create_snapshot(
        conn: &Connection,
        dest_dir: &Path,
    ) -> Result<SnapshotInfo, PosError> {
        if !dest_dir.exists() {
            fs::create_dir_all(dest_dir).map_err(|e| {
                PosError::Db(format!("Failed to create snapshot directory: {}", e))
            })?;
        }

        let timestamp_str = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f").to_string();
        let filename = format!("snapshot_{}.kdb", timestamp_str);
        let dest_path = dest_dir.join(&filename);

        // Remove if destination exists
        if dest_path.exists() {
            let _ = fs::remove_file(&dest_path);
        }

        let dest_str = dest_path.to_str().ok_or_else(|| {
            PosError::Db("Invalid UTF-8 in destination snapshot path".to_string())
        })?;

        // VACUUM INTO performs a non-blocking safe live copy of the active database
        conn.execute("VACUUM INTO ?1", [dest_str])
            .map_err(|e| PosError::Db(format!("VACUUM INTO snapshot failed: {}", e)))?;

        let metadata = fs::metadata(&dest_path)
            .map_err(|e| PosError::Db(format!("Failed to inspect snapshot metadata: {}", e)))?;

        Ok(SnapshotInfo {
            path: dest_str.to_string(),
            filename,
            file_size_bytes: metadata.len(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_valid: metadata.len() > 0,
        })
    }

    /// Prune older snapshots, keeping only the most recent N snapshots (default 24)
    pub fn rotate_snapshots(
        dest_dir: &Path,
        keep_count: usize,
    ) -> Result<usize, PosError> {
        if !dest_dir.exists() {
            return Ok(0);
        }

        let entries = fs::read_dir(dest_dir)
            .map_err(|e| PosError::Db(format!("Failed to read snapshot directory: {}", e)))?;

        let mut files: Vec<PathBuf> = entries
            .filter_map(std::result::Result::ok)
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .map(|ext| ext == "kdb" || ext == "db")
                        .unwrap_or(false)
            })
            .collect();

        // Sort by file modified time descending (newest first)
        files.sort_by_key(|p| {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        });
        files.reverse();

        let mut pruned = 0;
        if files.len() > keep_count {
            for old_file in &files[keep_count..] {
                if fs::remove_file(old_file).is_ok() {
                    pruned += 1;
                }
            }
        }

        Ok(pruned)
    }

    /// Retrieve metadata for the latest successful snapshot
    pub fn get_latest_snapshot(dest_dir: &Path) -> Option<SnapshotInfo> {
        if !dest_dir.exists() {
            return None;
        }

        let entries = fs::read_dir(dest_dir).ok()?;
        let mut files: Vec<PathBuf> = entries
            .filter_map(std::result::Result::ok)
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .map(|ext| ext == "kdb" || ext == "db")
                        .unwrap_or(false)
            })
            .collect();

        files.sort_by_key(|p| {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        });

        let newest = files.last()?;
        let meta = fs::metadata(newest).ok()?;
        let filename = newest.file_name()?.to_string_lossy().to_string();

        Some(SnapshotInfo {
            path: newest.to_string_lossy().to_string(),
            filename,
            file_size_bytes: meta.len(),
            created_at: chrono::Utc::now().to_rfc3339(),
            is_valid: meta.len() > 0,
        })
    }
}
