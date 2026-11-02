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

        let created_at = meta
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();

        Some(SnapshotInfo {
            path: newest.to_string_lossy().to_string(),
            filename,
            file_size_bytes: meta.len(),
            created_at,
            is_valid: meta.len() > 0,
        })
    }

    /// Blueprint retention: keep the newest `keep_recent` snapshots (48 = one day at
    /// 30-minute intervals) plus the newest snapshot of each of the last `keep_daily`
    /// calendar days (30). Everything else is deleted. Returns how many were removed.
    pub fn apply_retention(
        dest_dir: &Path,
        keep_recent: usize,
        keep_daily: usize,
    ) -> Result<usize, PosError> {
        if !dest_dir.exists() {
            return Ok(0);
        }
        let mut files: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dest_dir)
            .map_err(|e| PosError::Db(format!("Failed to read snapshot directory: {}", e)))?
            .filter_map(std::result::Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().map(|x| x == "kdb").unwrap_or(false))
            .filter_map(|p| {
                let t = fs::metadata(&p).and_then(|m| m.modified()).ok()?;
                Some((p, t))
            })
            .collect();
        files.sort_by(|a, b| b.1.cmp(&a.1)); // newest first

        let mut keep = std::collections::HashSet::new();
        for (p, _) in files.iter().take(keep_recent) {
            keep.insert(p.clone());
        }
        let mut days_seen = std::collections::HashSet::new();
        for (p, t) in &files {
            let day = chrono::DateTime::<chrono::Utc>::from(*t).date_naive();
            if days_seen.len() >= keep_daily && !days_seen.contains(&day) {
                continue;
            }
            if days_seen.insert(day) {
                keep.insert(p.clone());
            }
        }

        let mut removed = 0;
        for (p, _) in &files {
            if !keep.contains(p) && fs::remove_file(p).is_ok() {
                removed += 1;
            }
        }
        Ok(removed)
    }
}
