use chrono::{Duration, Utc};
use pos_core::licensing::{
    HardwareFingerprint, LicenseFeatures, LicenseManager, LicensePayload, LicenseStatus,
    LicenseTier,
};

#[test]
fn test_hardware_fingerprint_generation() {
    let machine_id = HardwareFingerprint::get_machine_id();
    assert!(machine_id.starts_with("KPOS-"));
    let parts: Vec<&str> = machine_id.split('-').collect();
    assert_eq!(parts.len(), 5); // KPOS-XXXX-XXXX-XXXX-XXXX
}

#[test]
fn test_license_creation_and_successful_verification() {
    let machine_id = HardwareFingerprint::get_machine_id();
    let now = Utc::now();
    let expiry = (now + Duration::days(365)).to_rfc3339();

    let payload = LicensePayload {
        store_name: "Al-Madina Supermarket Lahore".to_string(),
        machine_id: machine_id.clone(),
        tier: LicenseTier::Enterprise,
        issued_at: now.to_rfc3339(),
        expires_at: Some(expiry),
        features: LicenseFeatures {
            grocery_pack: true,
            electronics_pack: true,
            apparel_pack: true,
            multi_till: true,
        },
    };

    let token = LicenseManager::create_license_token(&payload, None).expect("token creation");

    let status = LicenseManager::verify_license(&token, &machine_id, &now, None);
    match status {
        LicenseStatus::Active {
            tier,
            days_left,
            features,
        } => {
            assert_eq!(tier, LicenseTier::Enterprise);
            assert!(days_left.unwrap() >= 364);
            assert!(features.grocery_pack);
            assert!(features.electronics_pack);
            assert!(features.multi_till);
        }
        other => panic!("Expected Active license, got {:?}", other),
    }
}

#[test]
fn test_license_machine_mismatch() {
    let now = Utc::now();
    let payload = LicensePayload {
        store_name: "Karachi Cash & Carry".to_string(),
        machine_id: "KPOS-1111-2222-3333-4444".to_string(),
        tier: LicenseTier::Standard,
        issued_at: now.to_rfc3339(),
        expires_at: None, // Lifetime
        features: LicenseFeatures::default(),
    };

    let token = LicenseManager::create_license_token(&payload, None).expect("token");

    let status = LicenseManager::verify_license(&token, "KPOS-9999-8888-7777-6666", &now, None);
    match status {
        LicenseStatus::MachineMismatch { expected, actual } => {
            assert_eq!(expected, "KPOS-1111-2222-3333-4444");
            assert_eq!(actual, "KPOS-9999-8888-7777-6666");
        }
        other => panic!("Expected MachineMismatch, got {:?}", other),
    }
}

#[test]
fn test_expired_license() {
    let now = Utc::now();
    let past_expiry = (now - Duration::days(5)).to_rfc3339();

    let payload = LicensePayload {
        store_name: "Expired Store".to_string(),
        machine_id: "*".to_string(), // Wildcard machine ID
        tier: LicenseTier::Standard,
        issued_at: (now - Duration::days(365)).to_rfc3339(),
        expires_at: Some(past_expiry),
        features: LicenseFeatures::default(),
    };

    let token = LicenseManager::create_license_token(&payload, None).expect("token");
    let status = LicenseManager::verify_license(&token, "ANY-MACHINE", &now, None);
    assert_eq!(status, LicenseStatus::Expired);
}

#[test]
fn test_14_day_trial_evaluation() {
    let now = Utc::now();
    let install_time = now - Duration::days(4);

    let status = LicenseManager::evaluate_trial(&install_time, &now);
    match status {
        LicenseStatus::TrialActive { days_left, .. } => {
            assert_eq!(days_left, 10);
        }
        other => panic!("Expected TrialActive, got {:?}", other),
    }

    let expired_install = now - Duration::days(15);
    let expired_status = LicenseManager::evaluate_trial(&expired_install, &now);
    assert_eq!(expired_status, LicenseStatus::Expired);
}
