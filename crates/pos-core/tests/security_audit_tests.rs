use pos_core::auth::hash::{hash_password, hash_pin, verify_password, verify_pin};
use pos_core::auth::{Permission, Role};
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use tempfile::NamedTempFile;

#[test]
fn test_security_audit_zero_plaintext_credentials() {
    let temp_file = NamedTempFile::new().unwrap();
    let key = [83u8; 32];
    let mut conn = open_encrypted_db(temp_file.path(), &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");

    let raw_password = "SuperSecretManagerPassword2026!";
    let raw_pin = "8421";

    let pw_hash = hash_password(raw_password).expect("hash pw");
    let pin_hash = hash_pin(raw_pin).expect("hash pin");

    // Insert user with Argon2id hashes
    conn.execute(
        "INSERT INTO users (id, username, password_hash, pin_hash, active, created_at, updated_at)
         VALUES ('usr-sec', 'secops', ?1, ?2, 1, '2026-10-29T12:00:00Z', '2026-10-29T12:00:00Z')",
        rusqlite::params![pw_hash, pin_hash],
    ).expect("insert user");

    // Query database directly to confirm plaintext NEVER appears
    let (stored_pw, stored_pin): (String, String) = conn
        .query_row(
            "SELECT password_hash, pin_hash FROM users WHERE id = 'usr-sec'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("select hashes");

    assert!(!stored_pw.contains(raw_password), "Plaintext password must never be stored");
    assert!(!stored_pin.contains(raw_pin), "Plaintext PIN must never be stored");
    assert!(stored_pw.starts_with("$argon2"), "Password must use Argon2id");
    assert!(stored_pin.starts_with("$argon2"), "PIN must use Argon2id");

    // Verify authentication functions
    assert!(verify_password(raw_password, &stored_pw).unwrap());
    assert!(!verify_password("WrongPassword123", &stored_pw).unwrap());

    assert!(verify_pin(raw_pin, &stored_pin).unwrap());
    assert!(!verify_pin("0000", &stored_pin).unwrap());
}

#[test]
fn test_rbac_security_boundaries_enforced() {
    // 1. Cashier Role Boundaries
    let cashier = Role::Cashier;
    assert!(cashier.can(Permission::SalesCreate));
    assert!(!cashier.can(Permission::SalesVoid));
    assert!(!cashier.can(Permission::SettingsManage));
    assert!(!cashier.can(Permission::ReportsView));

    // 2. Manager Role Boundaries
    let manager = Role::Manager;
    assert!(manager.can(Permission::SalesCreate));
    assert!(manager.can(Permission::SalesVoid));
    assert!(manager.can(Permission::ReportsView));
    assert!(!manager.can(Permission::SettingsManage));

    // 3. Owner Role Boundaries
    let owner = Role::Owner;
    assert!(owner.can(Permission::SettingsManage));
    assert!(owner.can(Permission::ReportsView));
    assert!(owner.can(Permission::BackupManage));
}
