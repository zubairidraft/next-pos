use chrono::{Duration, Utc};
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::licensing::{
    HardwareFingerprint, LicenseFeatures, LicenseManager, LicensePayload, LicenseStatus,
    LicenseStore, LicenseTier,
};
use tempfile::NamedTempFile;

fn keys() -> ([u8; 32], [u8; 32]) {
    LicenseManager::generate_keypair()
}

fn payload(machine: &str, expires: Option<String>) -> LicensePayload {
    LicensePayload {
        store_name: "Al-Madina Supermarket Lahore".to_string(),
        machine_id: machine.to_string(),
        tier: LicenseTier::Enterprise,
        issued_at: Utc::now().to_rfc3339(),
        expires_at: expires,
        features: LicenseFeatures { grocery_pack: true, electronics_pack: true, apparel_pack: true, multi_till: true },
    }
}

#[test]
fn test_hardware_fingerprint_generation() {
    let machine_id = HardwareFingerprint::get_machine_id();
    assert!(machine_id.starts_with("KPOS-"));
    assert_eq!(machine_id.split('-').count(), 5);
    // Stable across calls
    assert_eq!(machine_id, HardwareFingerprint::get_machine_id());
}

#[test]
fn test_license_creation_and_successful_verification() {
    let (sk, pk) = keys();
    let machine_id = HardwareFingerprint::get_machine_id();
    let now = Utc::now();
    let token = LicenseManager::create_license_token(
        &payload(&machine_id, Some((now + Duration::days(365)).to_rfc3339())),
        &sk,
    )
    .unwrap();
    assert!(token.starts_with("NPL1."));
    match LicenseManager::verify_license(&token, &machine_id, &now, Some(&pk)) {
        LicenseStatus::Active { tier, days_left, features } => {
            assert_eq!(tier, LicenseTier::Enterprise);
            assert!(days_left.unwrap() >= 364);
            assert!(features.grocery_pack && features.multi_till);
        }
        other => panic!("Expected Active license, got {:?}", other),
    }
}

#[test]
fn test_wrong_key_and_tampered_payload_rejected() {
    let (sk, _pk) = keys();
    let (_sk2, pk2) = keys();
    let now = Utc::now();
    let token = LicenseManager::create_license_token(&payload("*", Some((now + Duration::days(30)).to_rfc3339())), &sk).unwrap();
    assert_eq!(LicenseManager::verify_license(&token, "X", &now, Some(&pk2)), LicenseStatus::InvalidSignature);

    // Flip one hex digit in the payload
    let mut parts: Vec<String> = token.split('.').map(String::from).collect();
    let c = parts[1].pop().unwrap();
    parts[1].push(if c == '0' { '1' } else { '0' });
    let (_, pk) = (0, LicenseManager::public_key_for(&sk));
    assert_eq!(LicenseManager::verify_license(&parts.join("."), "X", &now, Some(&pk)), LicenseStatus::InvalidSignature);
}

#[test]
fn test_license_machine_mismatch() {
    let (sk, pk) = keys();
    let now = Utc::now();
    let licensed = HardwareFingerprint::format_id("guid-1", "vol-1");
    let other = HardwareFingerprint::format_id("guid-2", "vol-2");
    let token = LicenseManager::create_license_token(&payload(&licensed, None), &sk).unwrap();
    match LicenseManager::verify_license(&token, &other, &now, Some(&pk)) {
        LicenseStatus::MachineMismatch { expected, actual } => {
            assert_eq!(expected, licensed);
            assert_eq!(actual, other);
        }
        o => panic!("Expected MachineMismatch, got {:?}", o),
    }
    // One component changed (new disk) still passes
    let new_disk = HardwareFingerprint::format_id("guid-1", "vol-9");
    assert!(matches!(LicenseManager::verify_license(&token, &new_disk, &now, Some(&pk)), LicenseStatus::Active { .. }));
}

#[test]
fn test_grace_period_then_expired() {
    let (sk, pk) = keys();
    let now = Utc::now();
    let t3 = LicenseManager::create_license_token(&payload("*", Some((now - Duration::days(3)).to_rfc3339())), &sk).unwrap();
    let st = LicenseManager::verify_license(&t3, "ANY", &now, Some(&pk));
    assert!(matches!(st, LicenseStatus::GracePeriod { grace_days_left: 3..=4, .. }), "{:?}", st);
    assert!(st.can_post_sales());

    let t10 = LicenseManager::create_license_token(&payload("*", Some((now - Duration::days(10)).to_rfc3339())), &sk).unwrap();
    let st = LicenseManager::verify_license(&t10, "ANY", &now, Some(&pk));
    assert_eq!(st, LicenseStatus::Expired);
    assert!(!st.can_post_sales());
}

#[test]
fn test_14_day_trial_evaluation() {
    let now = Utc::now();
    match LicenseManager::evaluate_trial(&(now - Duration::days(4)), &now) {
        LicenseStatus::TrialActive { days_left, .. } => assert_eq!(days_left, 10),
        other => panic!("Expected TrialActive, got {:?}", other),
    }
    assert!(LicenseManager::evaluate_trial(&(now - Duration::days(4)), &now).requires_receipt_watermark());
    assert_eq!(LicenseManager::evaluate_trial(&(now - Duration::days(15)), &now), LicenseStatus::Expired);
}

#[test]
fn test_store_trial_clock_rollback_and_install() {
    let f = NamedTempFile::new().unwrap();
    let mut c = open_encrypted_db(f.path(), &[3u8; 32]).unwrap();
    run_migrations(&mut c).unwrap();
    let (sk, pk) = keys();
    let id = HardwareFingerprint::format_id("g", "v");
    let t0 = Utc::now();

    // First run starts the trial
    assert!(matches!(LicenseStore::current_status(&c, &id, &t0, Some(&pk)).unwrap(), LicenseStatus::TrialActive { days_left: 14, .. }));
    // 20 days later the trial is over
    let t20 = t0 + Duration::days(20);
    assert_eq!(LicenseStore::current_status(&c, &id, &t20, Some(&pk)).unwrap(), LicenseStatus::Expired);
    // Moving the clock back does not restart the trial
    assert_eq!(LicenseStore::current_status(&c, &id, &(t0 + Duration::days(1)), Some(&pk)).unwrap(), LicenseStatus::ClockTampered);

    // Installing a forged / wrong-key token is refused; a real one is accepted
    let (bad_sk, _) = keys();
    let forged = LicenseManager::create_license_token(&payload(&id, None), &bad_sk).unwrap();
    assert!(LicenseStore::install_token(&c, &forged, &id, &t20, Some(&pk)).is_err());
    let good = LicenseManager::create_license_token(&payload(&id, None), &sk).unwrap();
    assert!(LicenseStore::install_token(&c, &good, &id, &t20, Some(&pk)).is_ok());
    assert!(matches!(LicenseStore::current_status(&c, &id, &t20, Some(&pk)).unwrap(), LicenseStatus::Active { .. }));
}
