use pos_core::backup::SnapshotManager;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use std::fs;
use tempfile::tempdir;

#[test]
fn test_online_wal_snapshot_creation_and_rotation() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("live.db");
    let snapshots_dir = dir.path().join("snapshots");

    let key = [42u8; 32];
    let mut conn = open_encrypted_db(&db_path, &key).expect("open db");
    run_migrations(&mut conn).expect("migrations");

    // Add some data
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u1', 'KG', 'Kilogram', 3, '2026-10-29T10:00:00Z')",
        [],
    ).expect("insert unit");

    // 1. Create first snapshot
    let s1 = SnapshotManager::create_snapshot(&conn, &snapshots_dir).expect("snapshot 1");
    assert!(s1.file_size_bytes > 0);
    assert!(s1.is_valid);
    assert!(std::path::Path::new(&s1.path).exists());

    // 2. Add more data & create second snapshot
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u2', 'LTR', 'Liter', 2, '2026-10-29T10:01:00Z')",
        [],
    ).expect("insert unit 2");

    // Sleep briefly to ensure distinct file timestamps if needed
    std::thread::sleep(std::time::Duration::from_millis(50));
    let s2 = SnapshotManager::create_snapshot(&conn, &snapshots_dir).expect("snapshot 2");
    assert!(s2.file_size_bytes > 0);

    // 3. Test get_latest_snapshot
    let latest = SnapshotManager::get_latest_snapshot(&snapshots_dir).expect("latest");
    assert_eq!(latest.filename, s2.filename);

    // 4. Test rotation retention (keep only 1)
    let pruned = SnapshotManager::rotate_snapshots(&snapshots_dir, 1).expect("rotate");
    assert_eq!(pruned, 1);

    // After pruning, only 1 snapshot remains in snapshots_dir
    let remaining_entries: Vec<_> = fs::read_dir(&snapshots_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert_eq!(remaining_entries.len(), 1);
}
