use pos_core::backup::CryptoBackupService;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use std::fs;
use tempfile::tempdir;

#[test]
fn test_encrypted_backup_export_and_restore() {
    let dir = tempdir().unwrap();
    let original_db_path = dir.path().join("pos_source.db");
    let backup_file_path = dir.path().join("backup_export.kpos");
    let restored_db_path = dir.path().join("pos_restored.db");

    let db_key = [77u8; 32];
    let mut conn = open_encrypted_db(&original_db_path, &db_key).expect("open db");
    run_migrations(&mut conn).expect("migrations");

    // Insert test record
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-bak', 'BOX', 'Box Pack', 0, '2026-10-29T10:00:00Z')",
        [],
    ).expect("insert unit");

    // Close connection cleanly so WAL checkpoints to main db file
    drop(conn);

    let backup_key = [99u8; 32];

    // 1. Export backup package with encryption key
    let manifest = CryptoBackupService::export_backup(
        &original_db_path,
        &backup_file_path,
        Some(&backup_key),
    ).expect("export backup");

    assert_eq!(manifest.magic, "KPOS_BACKUP_V1");
    assert_eq!(manifest.app_version, "0.1.0");
    assert!(manifest.payload_size_bytes > 0);
    assert!(!manifest.checksum_hex.is_empty());
    assert!(backup_file_path.exists());

    // 2. Restore backup package
    let restore_manifest = CryptoBackupService::restore_backup(
        &backup_file_path,
        &restored_db_path,
        Some(&backup_key),
    ).expect("restore backup");

    assert_eq!(restore_manifest.checksum_hex, manifest.checksum_hex);
    assert!(restored_db_path.exists());

    // 3. Open restored DB and verify integrity and data
    let restored_conn = open_encrypted_db(&restored_db_path, &db_key).expect("open restored db");
    let integrity: String = restored_conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .expect("integrity check");
    assert_eq!(integrity, "ok");

    let unit_name: String = restored_conn
        .query_row("SELECT name FROM units WHERE id = 'u-bak'", [], |r| r.get(0))
        .expect("select restored unit");
    assert_eq!(unit_name, "Box Pack");
}

#[test]
fn test_restore_fails_with_wrong_key() {
    let dir = tempdir().unwrap();
    let source_path = dir.path().join("source.db");
    let backup_path = dir.path().join("backup.kpos");
    let restore_path = dir.path().join("target.db");

    fs::write(&source_path, b"SOME_SAMPLE_DATABASE_DATA_BYTES_TEST").unwrap();

    let backup_key = [88u8; 32];
    let wrong_key = [77u8; 32];

    CryptoBackupService::export_backup(&source_path, &backup_path, Some(&backup_key))
        .expect("export");

    // Restoring with wrong key must fail checksum verification
    let res = CryptoBackupService::restore_backup(&backup_path, &restore_path, Some(&wrong_key));
    assert!(res.is_err(), "Restoring with wrong key must fail checksum check");
}
