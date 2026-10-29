use chrono::{Duration, Utc};
use pos_core::auth::{
    hash_password, hash_pin, verify_password, verify_pin, Permission, Role, UserSession,
};

#[test]
fn test_password_argon2_security() {
    let raw_pass = "P@k1stanPOS2026!";
    let hashed = hash_password(raw_pass).expect("Failed to hash password");
    assert!(hashed.starts_with("$argon2id$"));
    assert!(verify_password(raw_pass, &hashed).expect("Failed to verify password"));
    assert!(!verify_password("WrongPassword123", &hashed).expect("Failed to verify wrong password"));
}

#[test]
fn test_pin_argon2_security() {
    let pin = "9876";
    let hashed = hash_pin(pin).expect("Failed to hash pin");
    assert!(hashed.starts_with("$argon2id$"));
    assert!(verify_pin("9876", &hashed).expect("Failed to verify pin"));
    assert!(!verify_pin("1234", &hashed).expect("Failed to verify wrong pin"));
}

#[test]
fn test_role_permissions_matrix() {
    let owner = Role::Owner;
    let manager = Role::Manager;
    let cashier = Role::Cashier;
    let stock_keeper = Role::StockKeeper;

    // Owner can do everything
    assert!(owner.can(Permission::SettingsManage));
    assert!(owner.can(Permission::BackupManage));
    assert!(owner.can(Permission::SalesVoid));
    assert!(owner.can(Permission::SalesCreate));

    // Manager can do sales, voids, adjustments, but not system settings
    assert!(manager.can(Permission::SalesVoid));
    assert!(manager.can(Permission::InventoryAdjust));
    assert!(!manager.can(Permission::SettingsManage));
    assert!(!manager.can(Permission::BackupManage));

    // Cashier can only create sales and returns
    assert!(cashier.can(Permission::SalesCreate));
    assert!(cashier.can(Permission::SalesReturn));
    assert!(!cashier.can(Permission::SalesVoid));
    assert!(!cashier.can(Permission::PriceEdit));
    assert!(!cashier.can(Permission::InventoryAdjust));

    // Stock keeper handles inventory
    assert!(stock_keeper.can(Permission::InventoryAdjust));
    assert!(stock_keeper.can(Permission::PurchaseEntry));
    assert!(!stock_keeper.can(Permission::SalesCreate));
}

#[test]
fn test_user_session_expiry_and_permission_check() {
    let active_session = UserSession {
        user_id: "01HXYZ".into(),
        username: "ahmed_cashier".into(),
        role: Role::Cashier,
        session_token: "tok_12345".into(),
        opened_at: Utc::now(),
        expires_at: Utc::now() + Duration::hours(8),
    };
    assert!(!active_session.is_expired());
    assert!(active_session.has_permission(Permission::SalesCreate));
    assert!(!active_session.has_permission(Permission::SalesVoid));

    let expired_session = UserSession {
        user_id: "01HABC".into(),
        username: "tariq_owner".into(),
        role: Role::Owner,
        session_token: "tok_67890".into(),
        opened_at: Utc::now() - Duration::hours(10),
        expires_at: Utc::now() - Duration::hours(1),
    };
    assert!(expired_session.is_expired());
    assert!(!expired_session.has_permission(Permission::SettingsManage)); // expired sessions deny all
}
