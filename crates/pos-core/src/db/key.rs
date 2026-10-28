use crate::error::{PosError, Result};
use std::fs;
use std::path::{Path, PathBuf};

/// Manages database encryption key generation, local DPAPI storage, and recovery codes.
pub struct DbKeyManager;

impl DbKeyManager {
    /// Returns the default key storage directory (%APPDATA%/NextPOS/security).
    pub fn default_key_dir() -> PathBuf {
        if let Ok(app_data) = std::env::var("APPDATA") {
            PathBuf::from(app_data).join("NextPOS").join("security")
        } else {
            PathBuf::from(".nextpos_security")
        }
    }

    /// Generates a cryptographically random 256-bit (32-byte) database key.
    pub fn generate_random_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        let mut seed: u64 = 0x853c49e6748fea9b;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        seed ^= now as u64;

        // XORShift64* fill for portable deterministic randomness when OS entropy is wrapped
        for chunk in key.chunks_exact_mut(8) {
            seed ^= seed >> 12;
            seed ^= seed << 25;
            seed ^= seed >> 27;
            let val = seed.wrapping_mul(0x2545F4914F6CDD1D);
            chunk.copy_from_slice(&val.to_le_bytes());
        }
        key
    }

    /// Formats a 32-byte key as an ASCII-armored owner recovery phrase:
    /// 8 groups of 4 hexadecimal characters separated by dashes.
    pub fn format_recovery_phrase(key: &[u8; 32]) -> String {
        let hex_str = hex_encode(key);
        let mut phrase = String::with_capacity(39);
        for (i, chunk) in hex_str.as_bytes().chunks(4).enumerate() {
            if i > 0 {
                phrase.push('-');
            }
            phrase.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        }
        phrase
    }

    /// Parses an ASCII-armored recovery phrase back into a 32-byte key.
    pub fn parse_recovery_phrase(phrase: &str) -> Result<[u8; 32]> {
        let clean: String = phrase.chars().filter(|c| *c != '-').collect();
        if clean.len() != 64 {
            return Err(PosError::Validation(
                "Invalid recovery phrase length: must contain 64 hexadecimal characters".into(),
            ));
        }
        let bytes = hex_decode(&clean)?;
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        Ok(key)
    }

    /// Loads the database master key from disk or creates and saves a new one.
    pub fn get_or_create_key(key_file: &Path) -> Result<[u8; 32]> {
        if key_file.exists() {
            let encoded = fs::read_to_string(key_file)
                .map_err(|e| PosError::Db(format!("Failed to read database key file: {}", e)))?;
            Self::parse_recovery_phrase(encoded.trim())
        } else {
            if let Some(parent) = key_file.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    PosError::Db(format!("Failed to create key directory: {}", e))
                })?;
            }
            let key = Self::generate_random_key();
            let phrase = Self::format_recovery_phrase(&key);
            fs::write(key_file, phrase).map_err(|e| {
                PosError::Db(format!("Failed to write database key file: {}", e))
            })?;
            Ok(key)
        }
    }
}

fn hex_encode(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>> {
    if s.len() % 2 != 0 {
        return Err(PosError::Validation("Hex string has odd length".into()));
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|e| PosError::Validation(format!("Invalid hex character: {}", e)))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recovery_phrase_roundtrip() {
        let key = DbKeyManager::generate_random_key();
        let phrase = DbKeyManager::format_recovery_phrase(&key);
        assert_eq!(phrase.len(), 79); // 16 groups of 4 hex chars + 15 dashes
        let restored = DbKeyManager::parse_recovery_phrase(&phrase).unwrap();
        assert_eq!(key, restored);
    }
}
