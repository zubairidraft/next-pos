use pos_core::backup::CryptoBackupService;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use std::fs;
use tempfile::tempdir;

const PW: &str = "shop-backup-2026";

fn seeded(path: &std::path::Path, key: &[u8; 32]) -> rusqlite::Connection {
    let mut conn = open_encrypted_db(path, key).expect("open db");
    run_migrations(&mut conn).expect("migrations");
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-bak', 'BOX', 'Box Pack', 0, '2026-10-29T10:00:00Z')",
        [],
    ).unwrap();
    conn
}

#[test]
fn test_encrypted_backup_export_and_restore_to_new_pc_key() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("pos_source.db");
    let bak = dir.path().join("usb").join("backup.kpos");
    let restored = dir.path().join("pos_restored.db");

    let conn = seeded(&src, &[77u8; 32]);
    let manifest = CryptoBackupService::export_backup(&conn, &bak, PW).expect("export");
    assert_eq!(manifest.format_version, 2);
    assert!(manifest.schema_version >= 6);
    assert!(bak.exists());

    // Backup file contains no readable shop data and is not a plain SQLite file
    let raw = fs::read(&bak).unwrap();
    assert!(!raw.windows(8).any(|w| w == b"Box Pack"));
    assert!(!raw.windows(15).any(|w| w == b"SQLite format 3"));

    // Restore onto a "new PC" with a different database key
    let new_key = [55u8; 32];
    let report = CryptoBackupService::restore_backup(&bak, &restored, PW, &new_key).expect("restore");
    assert!(report.safety_copy_path.is_none());
    let r = open_encrypted_db(&restored, &new_key).expect("open restored db");
    let name: String = r.query_row("SELECT name FROM units WHERE id = 'u-bak'", [], |x| x.get(0)).unwrap();
    assert_eq!(name, "Box Pack");
    assert!(open_encrypted_db(&restored, &[77u8; 32]).is_err(), "old key must not open the re-keyed DB");
}

#[test]
fn test_restore_fails_with_wrong_password_and_on_tamper() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("source.db");
    let bak = dir.path().join("backup.kpos");
    let target = dir.path().join("target.db");
    let conn = seeded(&src, &[1u8; 32]);
    CryptoBackupService::export_backup(&conn, &bak, PW).unwrap();

    assert!(CryptoBackupService::restore_backup(&bak, &target, "wrong-password", &[2u8; 32]).is_err());
    assert!(!target.exists(), "nothing written on failure");

    let mut raw = fs::read(&bak).unwrap();
    let n = raw.len();
    raw[n - 100] ^= 0xFF;
    fs::write(&bak, raw).unwrap();
    assert!(CryptoBackupService::verify_backup(&bak, PW).is_err());
    assert!(CryptoBackupService::export_backup(&conn, &bak, "short").is_err(), "short password rejected");
}

#[test]
fn test_restore_keeps_safety_copy_of_current_db() {
    let dir = tempdir().unwrap();
    let src = dir.path().join("live.db");
    let bak = dir.path().join("b.kpos");
    let key = [9u8; 32];
    let conn = seeded(&src, &key);
    CryptoBackupService::export_backup(&conn, &bak, PW).unwrap();
    conn.execute("DELETE FROM units WHERE id = 'u-bak'", []).unwrap();
    drop(conn);

    let report = CryptoBackupService::restore_backup(&bak, &src, PW, &key).unwrap();
    let safety = report.safety_copy_path.expect("safety copy");
    assert!(std::path::Path::new(&safety).exists());
    let r = open_encrypted_db(&src, &key).unwrap();
    let n: i64 = r.query_row("SELECT count(*) FROM units WHERE id = 'u-bak'", [], |x| x.get(0)).unwrap();
    assert_eq!(n, 1, "restored data is back");
}
