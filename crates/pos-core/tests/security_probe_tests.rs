// Security probes from the v1.0 audit. Each asserts the secure behaviour; all six
// failed before Round 2 (SQLCipher, Ed25519 licensing, authenticated backups).
use pos_core::backup::CryptoBackupService;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::licensing::{
    HardwareFingerprint, LicenseFeatures, LicenseManager, LicensePayload, LicenseStatus, LicenseTier,
};
use tempfile::{tempdir, NamedTempFile};

// ---------------- SECURITY ----------------

#[test]
fn sec01_database_file_is_actually_encrypted() {
    let f = NamedTempFile::new().unwrap();
    {
        let mut c = open_encrypted_db(f.path(), &[9u8; 32]).unwrap();
        run_migrations(&mut c).unwrap();
        c.execute_batch("CREATE TABLE secret(v TEXT); INSERT INTO secret VALUES('KHATA-SECRET-123'); PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
    }
    let raw = std::fs::read(f.path()).unwrap();
    let header = String::from_utf8_lossy(&raw[..15]).to_string();
    let leaks = raw.windows(16).any(|w| w == b"KHATA-SECRET-123");
    println!("OBSERVED header={:?} plaintext_visible={}", header, leaks);
    assert_ne!(header, "SQLite format 3", "DB file has a plain SQLite header: not encrypted");
    assert!(!leaks, "secret text readable in DB file");
}

#[test]
fn sec02_wrong_key_must_be_rejected() {
    let f = NamedTempFile::new().unwrap();
    {
        let mut c = open_encrypted_db(f.path(), &[1u8; 32]).unwrap();
        run_migrations(&mut c).unwrap();
    }
    let r = open_encrypted_db(f.path(), &[2u8; 32]);
    println!("OBSERVED open with wrong key ok={}", r.is_ok());
    assert!(r.is_err(), "database opened with the WRONG key");
}

#[test]
fn sec03_backup_contains_no_plaintext_and_needs_password() {
    let d = tempdir().unwrap();
    let src = d.path().join("shop.db");
    let c = open_encrypted_db(&src, &[4u8; 32]).unwrap();
    c.execute_batch("CREATE TABLE k(v TEXT); INSERT INTO k VALUES('CUSTOMER-PHONE-03001234567');").unwrap();
    let bak = d.path().join("b.kpos");
    CryptoBackupService::export_backup(&c, &bak, "owner-pass-123").unwrap();
    let raw = std::fs::read(&bak).unwrap();
    let leaks = raw.windows(26).any(|w| w == b"CUSTOMER-PHONE-03001234567");
    let wrong = CryptoBackupService::verify_backup(&bak, "guess-password").is_ok();
    println!("OBSERVED plaintext in backup={} wrong password accepted={}", leaks, wrong);
    assert!(!leaks && !wrong);
}

#[test]
fn sec04_backup_must_include_recent_wal_transactions() {
    let d = tempdir().unwrap();
    let src = d.path().join("shop.db");
    let key = [5u8; 32];
    let c = open_encrypted_db(&src, &key).unwrap();
    c.execute_batch("PRAGMA wal_autocheckpoint=0; CREATE TABLE sales(n INTEGER);").unwrap();
    for i in 0..50 { c.execute("INSERT INTO sales VALUES(?1)", [i]).unwrap(); }
    let bak = d.path().join("b.kpos");
    CryptoBackupService::export_backup(&c, &bak, "owner-pass-123").unwrap();
    let dst = d.path().join("restored.db");
    CryptoBackupService::restore_backup(&bak, &dst, "owner-pass-123", &key).unwrap();
    let n: i64 = open_encrypted_db(&dst, &key).unwrap().query_row("SELECT count(*) FROM sales", [], |x| x.get(0)).unwrap();
    println!("OBSERVED rows in shop=50, rows in restored backup={}", n);
    assert_eq!(n, 50, "backup silently dropped sales still in the WAL file");
}

#[test]
fn sec05_license_cannot_be_forged_from_client_binary() {
    // An attacker with the app can only make their own key pair; the app trusts the embedded public key.
    let (attacker_seed, _) = LicenseManager::generate_keypair();
    let p = LicensePayload {
        store_name: "Attacker".into(),
        machine_id: "*".into(),
        tier: LicenseTier::Enterprise,
        issued_at: chrono::Utc::now().to_rfc3339(),
        expires_at: None,
        features: LicenseFeatures { grocery_pack: true, electronics_pack: true, apparel_pack: true, multi_till: true },
    };
    let tok = LicenseManager::create_license_token(&p, &attacker_seed).unwrap();
    let st = LicenseManager::verify_license(&tok, "ANY-MACHINE", &chrono::Utc::now(), None);
    println!("OBSERVED self-signed license status: {:?}", st);
    assert!(!matches!(st, LicenseStatus::Active { .. }), "anyone with the app can mint licenses");
    assert_ne!(LicenseManager::PUBLIC_KEY, [0u8; 32], "production public key not set");
}

#[test]
fn sec06_machine_id_must_not_follow_editable_env_vars() {
    std::env::set_var("COMPUTERNAME", "SHOP-PC-1");
    std::env::set_var("USERNAME", "owner");
    let a = HardwareFingerprint::get_machine_id();
    std::env::set_var("COMPUTERNAME", "SHOP-PC-2");
    let b = HardwareFingerprint::get_machine_id();
    println!("OBSERVED id1={} id2={} (only env vars changed)", a, b);
    assert_eq!(a, b, "fingerprint changes when PC is renamed / can be spoofed via env vars");
}
