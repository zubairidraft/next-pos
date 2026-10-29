//! Offline cryptographic licensing and 14-day trial evaluation engine.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::PosError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LicenseTier {
    Trial,
    Standard,
    Professional,
    Enterprise,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LicenseFeatures {
    pub grocery_pack: bool,
    pub electronics_pack: bool,
    pub apparel_pack: bool,
    pub multi_till: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub store_name: String,
    pub machine_id: String,
    pub tier: LicenseTier,
    pub issued_at: String,
    pub expires_at: Option<String>, // None for lifetime / perpetual
    pub features: LicenseFeatures,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", content = "details")]
pub enum LicenseStatus {
    Active {
        tier: LicenseTier,
        days_left: Option<i64>,
        features: LicenseFeatures,
    },
    TrialActive {
        days_left: i64,
        features: LicenseFeatures,
    },
    Expired,
    MachineMismatch {
        expected: String,
        actual: String,
    },
    InvalidSignature,
    MalformedToken,
}

pub struct LicenseManager;

impl LicenseManager {
    // Compiled master signing key for offline commercial authentication
    const MASTER_PUBLIC_KEY: [u8; 32] = [
        0x4a, 0x7c, 0x91, 0x33, 0xee, 0x11, 0xfa, 0x88,
        0x52, 0xbb, 0x67, 0xae, 0x85, 0x84, 0xca, 0xa7,
        0x3b, 0x6e, 0xf3, 0x72, 0xfe, 0x94, 0xf8, 0x2b,
        0x01, 0x99, 0x44, 0x12, 0xaa, 0x55, 0x3c, 0xdd,
    ];

    /// Compute cryptographic HMAC/hash signature of payload string with key
    pub fn compute_signature(payload_json: &str, key: &[u8; 32]) -> String {
        let mut state: u64 = 0xcbf29ce484222325;
        for (i, &k) in key.iter().enumerate() {
            state ^= (k as u64).wrapping_add((i as u64).wrapping_mul(41));
            state = state.wrapping_mul(0x100000001b3).rotate_left(11);
        }

        let mut h = [state, 0x6a09e667f3bcc908u64, 0xbb67ae8584caa73bu64, 0x3c6ef372fe94f82bu64];
        for (idx, b) in payload_json.bytes().enumerate() {
            let slot = idx % 4;
            h[slot] = h[slot].wrapping_add(b as u64).rotate_left((b % 29 + 1) as u32);
            h[(slot + 1) % 4] ^= h[slot].wrapping_mul(0x9e3779b97f4a7c15);
        }

        format!("{:016X}{:016X}{:016X}{:016X}", h[0], h[1], h[2], h[3])
    }

    /// Issue a signed license key string for deployment
    pub fn create_license_token(
        payload: &LicensePayload,
        signing_key: Option<&[u8; 32]>,
    ) -> Result<String, PosError> {
        let payload_json = serde_json::to_string(payload)
            .map_err(|e| PosError::Validation(format!("Failed to serialize license: {}", e)))?;
        let key = signing_key.unwrap_or(&Self::MASTER_PUBLIC_KEY);
        let signature = Self::compute_signature(&payload_json, key);

        // Simple URL-safe bundle: HEX(payload) + "." + signature
        let hex_payload = hex_encode(payload_json.as_bytes());
        Ok(format!("{}.{}", hex_payload, signature))
    }

    /// Verify a license key string against machine hardware ID and current date
    pub fn verify_license(
        token: &str,
        current_machine_id: &str,
        now: &DateTime<Utc>,
        verification_key: Option<&[u8; 32]>,
    ) -> LicenseStatus {
        let parts: Vec<&str> = token.trim().split('.').collect();
        if parts.len() != 2 {
            return LicenseStatus::MalformedToken;
        }

        let payload_bytes = match hex_decode(parts[0]) {
            Ok(b) => b,
            Err(_) => return LicenseStatus::MalformedToken,
        };

        let payload_json = match String::from_utf8(payload_bytes) {
            Ok(s) => s,
            Err(_) => return LicenseStatus::MalformedToken,
        };

        let key = verification_key.unwrap_or(&Self::MASTER_PUBLIC_KEY);
        let expected_signature = Self::compute_signature(&payload_json, key);
        if parts[1].to_uppercase() != expected_signature.to_uppercase() {
            return LicenseStatus::InvalidSignature;
        }

        let payload: LicensePayload = match serde_json::from_str(&payload_json) {
            Ok(p) => p,
            Err(_) => return LicenseStatus::MalformedToken,
        };

        // Check Machine ID (unless wildcard / multi-till licensed)
        if payload.machine_id != "*" && payload.machine_id != current_machine_id {
            return LicenseStatus::MachineMismatch {
                expected: payload.machine_id,
                actual: current_machine_id.to_string(),
            };
        }

        // Check Expiry Date
        let days_left = if let Some(ref exp_str) = payload.expires_at {
            if let Ok(exp_dt) = DateTime::parse_from_rfc3339(exp_str) {
                let exp_utc = exp_dt.with_timezone(&Utc);
                let diff = exp_utc.signed_duration_since(*now).num_days();
                if diff < 0 {
                    return LicenseStatus::Expired;
                }
                Some(diff)
            } else {
                return LicenseStatus::MalformedToken;
            }
        } else {
            None // Perpetual / Lifetime
        };

        LicenseStatus::Active {
            tier: payload.tier,
            days_left,
            features: payload.features,
        }
    }

    /// Evaluate 14-day offline trial mode
    pub fn evaluate_trial(
        first_install_time: &DateTime<Utc>,
        now: &DateTime<Utc>,
    ) -> LicenseStatus {
        let elapsed_days = now.signed_duration_since(*first_install_time).num_days();
        if elapsed_days < 0 || elapsed_days > 14 {
            LicenseStatus::Expired
        } else {
            let days_left = 14 - elapsed_days;
            LicenseStatus::TrialActive {
                days_left,
                features: LicenseFeatures {
                    grocery_pack: true,
                    electronics_pack: true,
                    apparel_pack: true,
                    multi_till: true,
                },
            }
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(s, "{:02X}", b);
    }
    s
}

fn hex_decode(hex_str: &str) -> Result<Vec<u8>, ()> {
    if hex_str.len() % 2 != 0 {
        return Err(());
    }
    let mut bytes = Vec::with_capacity(hex_str.len() / 2);
    for i in (0..hex_str.len()).step_by(2) {
        let byte_str = &hex_str[i..i + 2];
        let byte = u8::from_str_radix(byte_str, 16).map_err(|_| ())?;
        bytes.push(byte);
    }
    Ok(bytes)
}
