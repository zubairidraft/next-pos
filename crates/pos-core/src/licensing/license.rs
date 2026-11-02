//! Offline Ed25519 licensing, 14-day trial, 7-day grace period and clock-rollback guard.
//!
//! Token format: `NPL1.<hex payload JSON>.<hex 64-byte Ed25519 signature>`.
//! Only the dealer tool (`pos-license`) holds the private signing key; the app
//! embeds the public key below and can verify but never mint licenses.

use chrono::{DateTime, Duration, Utc};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::db::key::{hex_decode, hex_encode};
use crate::error::PosError;
use crate::licensing::fingerprint::HardwareFingerprint;

const TOKEN_PREFIX: &str = "NPL1";
pub const TRIAL_DAYS: i64 = 14;
pub const GRACE_DAYS: i64 = 7;
/// How far the PC clock may move backwards before the license store treats it as tampering.
pub const MAX_CLOCK_ROLLBACK_HOURS: i64 = 24;

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
    /// `KPOS-...` machine ID, or `*` for a license valid on any PC (dealer demo only).
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
    /// Expired less than GRACE_DAYS ago: everything still works, with a renewal banner.
    GracePeriod {
        tier: LicenseTier,
        grace_days_left: i64,
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
    /// The PC clock moved backwards; needs online or dealer re-verification.
    ClockTampered,
}

impl LicenseStatus {
    /// Whether new sales may be posted. Reports, khata and backups stay available
    /// in every state so a shop's data is never held hostage.
    pub fn can_post_sales(&self) -> bool {
        matches!(
            self,
            LicenseStatus::Active { .. } | LicenseStatus::GracePeriod { .. } | LicenseStatus::TrialActive { .. }
        )
    }

    /// Trial receipts must carry a "TRIAL VERSION" watermark.
    pub fn requires_receipt_watermark(&self) -> bool {
        matches!(self, LicenseStatus::TrialActive { .. })
    }
}

pub struct LicenseManager;

impl LicenseManager {
    /// Production verification key. The matching private key lives only in the
    /// dealer's `license_signing.key` file. To rotate: run `pos-license --keygen`,
    /// paste the printed public key here and rebuild.
    pub const PUBLIC_KEY: [u8; 32] = [
        0x47, 0xbf, 0xc8, 0x00, 0x7d, 0xfc, 0x62, 0xc8, 0x7b, 0x4a, 0xe2, 0xb8, 0x10, 0xc7, 0xf2, 0x76,
        0x06, 0xac, 0xe9, 0x9e, 0x31, 0xef, 0xcd, 0x8a, 0x32, 0x8e, 0x7d, 0x81, 0x8d, 0x56, 0x88, 0xe1,
    ];

    /// Creates a new random Ed25519 key pair: `(private seed, public key)`.
    pub fn generate_keypair() -> ([u8; 32], [u8; 32]) {
        let mut seed = [0u8; 32];
        crate::db::key::fill_random(&mut seed);
        let sk = SigningKey::from_bytes(&seed);
        (seed, sk.verifying_key().to_bytes())
    }

    /// Public key that belongs to a private signing seed.
    pub fn public_key_for(signing_seed: &[u8; 32]) -> [u8; 32] {
        SigningKey::from_bytes(signing_seed).verifying_key().to_bytes()
    }

    /// Signs a license. Only the dealer tool should call this.
    pub fn create_license_token(
        payload: &LicensePayload,
        signing_seed: &[u8; 32],
    ) -> Result<String, PosError> {
        let payload_json = serde_json::to_string(payload)
            .map_err(|e| PosError::Validation(format!("Failed to serialize license: {}", e)))?;
        let sk = SigningKey::from_bytes(signing_seed);
        let sig: Signature = sk.sign(payload_json.as_bytes());
        Ok(format!(
            "{}.{}.{}",
            TOKEN_PREFIX,
            hex_encode(payload_json.as_bytes()),
            hex_encode(&sig.to_bytes())
        ))
    }

    /// Verifies a token against this PC's machine ID and the current time.
    /// `verification_key` defaults to [`LicenseManager::PUBLIC_KEY`].
    pub fn verify_license(
        token: &str,
        current_machine_id: &str,
        now: &DateTime<Utc>,
        verification_key: Option<&[u8; 32]>,
    ) -> LicenseStatus {
        let parts: Vec<&str> = token.trim().split('.').collect();
        if parts.len() != 3 || parts[0] != TOKEN_PREFIX {
            return LicenseStatus::MalformedToken;
        }
        let (payload_bytes, sig_bytes) = match (hex_decode(parts[1]), hex_decode(parts[2])) {
            (Ok(p), Ok(s)) => (p, s),
            _ => return LicenseStatus::MalformedToken,
        };
        let sig = match <[u8; 64]>::try_from(sig_bytes.as_slice()) {
            Ok(b) => Signature::from_bytes(&b),
            Err(_) => return LicenseStatus::MalformedToken,
        };
        let vk = match VerifyingKey::from_bytes(verification_key.unwrap_or(&Self::PUBLIC_KEY)) {
            Ok(k) => k,
            Err(_) => return LicenseStatus::InvalidSignature,
        };
        if vk.verify_strict(&payload_bytes, &sig).is_err() {
            return LicenseStatus::InvalidSignature;
        }

        let payload: LicensePayload = match serde_json::from_slice(&payload_bytes) {
            Ok(p) => p,
            Err(_) => return LicenseStatus::MalformedToken,
        };

        if payload.machine_id != "*" && !HardwareFingerprint::matches(&payload.machine_id, current_machine_id) {
            return LicenseStatus::MachineMismatch {
                expected: payload.machine_id,
                actual: current_machine_id.to_string(),
            };
        }

        match payload.expires_at {
            None => LicenseStatus::Active { tier: payload.tier, days_left: None, features: payload.features },
            Some(ref exp_str) => match DateTime::parse_from_rfc3339(exp_str) {
                Err(_) => LicenseStatus::MalformedToken,
                Ok(exp) => {
                    let exp = exp.with_timezone(&Utc);
                    if *now <= exp {
                        LicenseStatus::Active {
                            tier: payload.tier,
                            days_left: Some(exp.signed_duration_since(*now).num_days()),
                            features: payload.features,
                        }
                    } else if *now <= exp + Duration::days(GRACE_DAYS) {
                        LicenseStatus::GracePeriod {
                            tier: payload.tier,
                            grace_days_left: (exp + Duration::days(GRACE_DAYS))
                                .signed_duration_since(*now)
                                .num_days(),
                            features: payload.features,
                        }
                    } else {
                        LicenseStatus::Expired
                    }
                }
            },
        }
    }

    /// Evaluates the 14-day offline trial from the first-run time.
    pub fn evaluate_trial(first_install_time: &DateTime<Utc>, now: &DateTime<Utc>) -> LicenseStatus {
        let elapsed_days = now.signed_duration_since(*first_install_time).num_days();
        if elapsed_days < 0 || elapsed_days > TRIAL_DAYS {
            LicenseStatus::Expired
        } else {
            LicenseStatus::TrialActive {
                days_left: TRIAL_DAYS - elapsed_days,
                features: LicenseFeatures {
                    grocery_pack: true,
                    electronics_pack: true,
                    apparel_pack: true,
                    multi_till: false,
                },
            }
        }
    }
}

/// License state kept inside the encrypted database (`app_settings`), so it cannot
/// be reset by editing a file: first-run time, last time the app saw the clock,
/// and the installed license token.
pub struct LicenseStore;

impl LicenseStore {
    fn get(conn: &Connection, key: &str) -> Result<Option<String>, PosError> {
        Ok(conn
            .query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()?)
    }

    fn set(conn: &Connection, key: &str, value: &str, now: &DateTime<Utc>) -> Result<(), PosError> {
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now.to_rfc3339()],
        )?;
        Ok(())
    }

    /// Saves a license token after it verifies for this machine.
    pub fn install_token(
        conn: &Connection,
        token: &str,
        machine_id: &str,
        now: &DateTime<Utc>,
        verification_key: Option<&[u8; 32]>,
    ) -> Result<LicenseStatus, PosError> {
        let status = LicenseManager::verify_license(token, machine_id, now, verification_key);
        if !matches!(status, LicenseStatus::Active { .. } | LicenseStatus::GracePeriod { .. }) {
            return Err(PosError::Validation(format!("License not accepted: {:?}", status)));
        }
        Self::set(conn, "license.token", token.trim(), now)?;
        crate::domain::audit::AuditRepo::write(conn, None, "license_installed", "license", None, None, None)?;
        Ok(status)
    }

    /// Current license state. Starts the trial clock on first call, and refuses
    /// (ClockTampered) when the PC clock is more than a day behind the last seen time.
    pub fn current_status(
        conn: &Connection,
        machine_id: &str,
        now: &DateTime<Utc>,
        verification_key: Option<&[u8; 32]>,
    ) -> Result<LicenseStatus, PosError> {
        let parse = |s: Option<String>| s.and_then(|v| DateTime::parse_from_rfc3339(&v).ok()).map(|d| d.with_timezone(&Utc));

        if let Some(last_seen) = parse(Self::get(conn, "license.last_seen_at")?) {
            if *now + Duration::hours(MAX_CLOCK_ROLLBACK_HOURS) < last_seen {
                return Ok(LicenseStatus::ClockTampered);
            }
            if *now > last_seen {
                Self::set(conn, "license.last_seen_at", &now.to_rfc3339(), now)?;
            }
        } else {
            Self::set(conn, "license.last_seen_at", &now.to_rfc3339(), now)?;
        }

        if let Some(token) = Self::get(conn, "license.token")? {
            return Ok(LicenseManager::verify_license(&token, machine_id, now, verification_key));
        }

        let first_run = match parse(Self::get(conn, "license.first_run_at")?) {
            Some(t) => t,
            None => {
                Self::set(conn, "license.first_run_at", &now.to_rfc3339(), now)?;
                *now
            }
        };
        Ok(LicenseManager::evaluate_trial(&first_run, now))
    }
}
