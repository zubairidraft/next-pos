use chrono::{Duration, Utc};
use pos_core::auth::{Permission, Role, UserRepo};
use pos_core::backup::SnapshotManager;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use tempfile::NamedTempFile;

fn db() -> (rusqlite::Connection, NamedTempFile) {
    let f = NamedTempFile::new().unwrap();
    let mut c = open_encrypted_db(f.path(), &[6u8; 32]).unwrap();
    run_migrations(&mut c).unwrap();
    (c, f)
}

#[test]
fn first_user_must_be_owner_and_only_owner_creates_users() {
    let (c, _f) = db();
    assert!(UserRepo::needs_first_owner(&c).unwrap());
    assert!(UserRepo::create_user(&c, "ali", "password123", Some("1234"), Role::Cashier, None).is_err());
    let owner = UserRepo::create_user(&c, "owner", "owner-pass-1", Some("9999"), Role::Owner, None).unwrap();
    assert!(!UserRepo::needs_first_owner(&c).unwrap());
    let cashier = UserRepo::create_user(&c, "ali", "password123", Some("1234"), Role::Cashier, Some(&owner.id)).unwrap();
    // a cashier cannot create users, and usernames are unique
    assert!(UserRepo::create_user(&c, "bilal", "password123", None, Role::Manager, Some(&cashier.id)).is_err());
    assert!(UserRepo::create_user(&c, "ALI", "password123", None, Role::Cashier, Some(&owner.id)).is_err());
    assert!(UserRepo::create_user(&c, "short", "123", None, Role::Cashier, Some(&owner.id)).is_err());
    assert_eq!(UserRepo::list_users(&c).unwrap().len(), 2);
}

#[test]
fn wrong_pin_never_unlocks_and_locks_after_five_tries() {
    let (c, _f) = db();
    let owner = UserRepo::create_user(&c, "owner", "owner-pass-1", None, Role::Owner, None).unwrap();
    let cashier = UserRepo::create_user(&c, "tariq", "password123", Some("4821"), Role::Cashier, Some(&owner.id)).unwrap();
    let now = Utc::now();

    assert!(UserRepo::login_pin(&c, &cashier.id, "0000", &now).is_err());
    assert!(UserRepo::login_pin(&c, &cashier.id, "1234", &now).is_err());
    let s = UserRepo::login_pin(&c, &cashier.id, "4821", &now).unwrap();
    assert_eq!(s.role, Role::Cashier);
    assert_eq!(s.session_token.len(), 64);

    for _ in 0..5 {
        let _ = UserRepo::login_pin(&c, &cashier.id, "1111", &now);
    }
    // correct PIN is refused while locked ...
    let locked = UserRepo::login_pin(&c, &cashier.id, "4821", &now);
    assert!(locked.unwrap_err().to_string().contains("Try again"));
    // ... and works again after the lockout
    assert!(UserRepo::login_pin(&c, &cashier.id, "4821", &(now + Duration::minutes(6))).is_ok());

    let failures: i64 = c.query_row("SELECT count(*) FROM audit_log WHERE action IN ('login_failed','login_locked')", [], |r| r.get(0)).unwrap();
    assert!(failures >= 6);
}

#[test]
fn password_login_and_permissions() {
    let (c, _f) = db();
    let owner = UserRepo::create_user(&c, "owner", "owner-pass-1", None, Role::Owner, None).unwrap();
    UserRepo::create_user(&c, "tariq", "password123", Some("4821"), Role::Cashier, Some(&owner.id)).unwrap();
    let now = Utc::now();
    assert!(UserRepo::login_password(&c, "nobody", "x", &now).is_err());
    assert!(UserRepo::login_password(&c, "tariq", "wrong-pass", &now).is_err());
    let s = UserRepo::login_password(&c, "TARIQ", "password123", &now).unwrap();
    assert!(UserRepo::require_permission(&c, &s, Permission::SalesCreate, &now).is_ok());
    assert!(UserRepo::require_permission(&c, &s, Permission::BackupManage, &now).is_err());
    assert!(UserRepo::require_permission(&c, &s, Permission::SalesCreate, &(now + Duration::hours(13))).is_err());
    c.execute("UPDATE users SET active = 0 WHERE username = 'tariq'", []).unwrap();
    assert!(UserRepo::require_permission(&c, &s, Permission::SalesCreate, &now).is_err());
}

#[test]
fn snapshot_retention_keeps_recent_and_one_per_day() {
    let d = tempfile::tempdir().unwrap();
    let base = std::time::SystemTime::now();
    // 10 snapshots today (30 min apart) + 1 per day for the previous 5 days, 2 each
    let mut n = 0;
    for i in 0..10u64 {
        let p = d.path().join(format!("s{}.kdb", n)); n += 1;
        std::fs::write(&p, b"x").unwrap();
        let f = std::fs::File::options().write(true).open(&p).unwrap();
        f.set_modified(base - std::time::Duration::from_secs(i * 1800)).unwrap();
    }
    for day in 1..=5u64 {
        for k in 0..2u64 {
            let p = d.path().join(format!("s{}.kdb", n)); n += 1;
            std::fs::write(&p, b"x").unwrap();
            let f = std::fs::File::options().write(true).open(&p).unwrap();
            f.set_modified(base - std::time::Duration::from_secs(day * 86400 + k * 3600)).unwrap();
        }
    }
    // keep 4 recent + 3 days -> 4 recent (today) + newest of 2 earlier days
    let removed = SnapshotManager::apply_retention(d.path(), 4, 3).unwrap();
    let left = std::fs::read_dir(d.path()).unwrap().count();
    assert_eq!(left + removed, 20);
    assert!(left >= 6 && left <= 7, "left {}", left);
}
