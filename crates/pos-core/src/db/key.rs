//! Database master key: generation, protected storage and owner recovery phrase.
//!
//! * Keys come from the operating system's CSPRNG (`getrandom`).
//! * On Windows the key file holds a DPAPI blob (machine scope + app entropy), so the
//!   file is useless when copied to another PC. Other platforms (dev/test only) store
//!   the key in a file readable only by the current user.
//! * The 64-hex-digit recovery phrase is the raw key. Print it once at setup and keep
//!   it offline: it is the only way to open the database on a new PC.

use crate::error::{PosError, Result};
use std::fs;
use std::path::{Path, PathBuf};

const DPAPI_PREFIX: &str = "NPKEY-DPAPI1:";
const PLAIN_PREFIX: &str = "NPKEY-PLAIN1:";

/// Manages database encryption key generation, protected storage, and recovery codes.
pub struct DbKeyManager;

impl DbKeyManager {
    /// Default key storage directory: `%APPDATA%\NextPOS\security` on Windows,
    /// `~/.nextpos/security` elsewhere.
    pub fn default_key_dir() -> PathBuf {
        if let Ok(app_data) = std::env::var("APPDATA") {
            PathBuf::from(app_data).join("NextPOS").join("security")
        } else if let Ok(home) = std::env::var("HOME") {
            PathBuf::from(home).join(".nextpos").join("security")
        } else {
            PathBuf::from(".nextpos_security")
        }
    }

    /// Generates a 256-bit key from the operating system's secure random source.
    /// Panics only if the OS random source is unavailable, which is unrecoverable.
    pub fn generate_random_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        fill_random(&mut key);
        key
    }

    /// Formats a 32-byte key as an owner recovery phrase:
    /// 16 groups of 4 hexadecimal characters separated by dashes.
    pub fn format_recovery_phrase(key: &[u8; 32]) -> String {
        let hex_str = hex_encode(key);
        let mut phrase = String::with_capacity(79);
        for (i, chunk) in hex_str.as_bytes().chunks(4).enumerate() {
            if i > 0 {
                phrase.push('-');
            }
            phrase.push_str(std::str::from_utf8(chunk).unwrap_or(""));
        }
        phrase
    }

    /// Parses a recovery phrase (dashes and spaces ignored, any case) back into a key.
    pub fn parse_recovery_phrase(phrase: &str) -> Result<[u8; 32]> {
        let clean: String = phrase
            .chars()
            .filter(|c| *c != '-' && !c.is_whitespace())
            .collect();
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

    /// Loads the database key from a protected key file, or creates one.
    /// Returns `(key, created)`; when `created` is true the caller must show the
    /// recovery phrase to the owner once.
    /// Key files written by older versions (plain recovery phrase) are read and
    /// immediately re-saved in protected form.
    pub fn load_or_create_key(key_file: &Path) -> Result<([u8; 32], bool)> {
        if key_file.exists() {
            let encoded = fs::read_to_string(key_file)
                .map_err(|e| PosError::Db(format!("Failed to read database key file: {}", e)))?;
            let encoded = encoded.trim();
            if let Some(hex_blob) = encoded.strip_prefix(DPAPI_PREFIX) {
                let blob = hex_decode(hex_blob)?;
                let raw = protect::unprotect(&blob)?;
                return Ok((to_key(&raw)?, false));
            }
            let key = if let Some(hex_key) = encoded.strip_prefix(PLAIN_PREFIX) {
                to_key(&hex_decode(hex_key)?)?
            } else {
                // Legacy: unprotected recovery phrase. Upgrade it in place.
                let k = Self::parse_recovery_phrase(encoded)?;
                Self::store_key(key_file, &k)?;
                k
            };
            Ok((key, false))
        } else {
            let key = Self::generate_random_key();
            Self::store_key(key_file, &key)?;
            Ok((key, true))
        }
    }

    /// Backwards-compatible wrapper around [`DbKeyManager::load_or_create_key`].
    pub fn get_or_create_key(key_file: &Path) -> Result<[u8; 32]> {
        Self::load_or_create_key(key_file).map(|(k, _)| k)
    }

    /// Writes the key to `key_file` in protected form (DPAPI on Windows),
    /// e.g. when restoring access on a new PC from the owner's recovery phrase.
    pub fn store_key(key_file: &Path, key: &[u8; 32]) -> Result<()> {
        if let Some(parent) = key_file.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)
                    .map_err(|e| PosError::Db(format!("Failed to create key directory: {}", e)))?;
            }
        }
        let content = if protect::AVAILABLE {
            format!("{}{}", DPAPI_PREFIX, hex_encode(&protect::protect(key)?))
        } else {
            format!("{}{}", PLAIN_PREFIX, hex_encode(key))
        };
        let tmp = key_file.with_extension("tmp");
        fs::write(&tmp, content)
            .map_err(|e| PosError::Db(format!("Failed to write database key file: {}", e)))?;
        restrict_to_owner(&tmp);
        fs::rename(&tmp, key_file)
            .map_err(|e| PosError::Db(format!("Failed to save database key file: {}", e)))?;
        Ok(())
    }
}

/// Fills `buf` from the OS CSPRNG. Shared by key, salt and nonce generation.
pub fn fill_random(buf: &mut [u8]) {
    getrandom::getrandom(buf).expect("operating system random number generator unavailable");
}

fn to_key(raw: &[u8]) -> Result<[u8; 32]> {
    if raw.len() != 32 {
        return Err(PosError::Validation("Database key file has the wrong length".into()));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(raw);
    Ok(key)
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) {}

pub(crate) fn hex_encode(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02x}", b)).collect()
}

pub(crate) fn hex_decode(s: &str) -> Result<Vec<u8>> {
    if s.len() % 2 != 0 || !s.is_ascii() {
        return Err(PosError::Validation("Hex string has odd length or invalid characters".into()));
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|e| PosError::Validation(format!("Invalid hex character: {}", e)))
        })
        .collect()
}

#[cfg(windows)]
mod protect {
    //! Windows DPAPI, machine scope, with app-specific entropy.
    use crate::error::{PosError, Result};
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_LOCAL_MACHINE,
        CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub const AVAILABLE: bool = true;
    const ENTROPY: &[u8] = b"NextPOS database key v1";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as HLOCAL);
        v
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE,
                &mut out,
            )
        };
        if ok == 0 {
            return Err(PosError::Db(format!(
                "Windows DPAPI could not protect the database key ({})",
                std::io::Error::last_os_error()
            )));
        }
        Ok(unsafe { take(out) })
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
        let input = blob(data);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                &entropy,
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err(PosError::Db(format!(
                "This key file was protected on a different PC or Windows install; use the owner recovery phrase ({})",
                std::io::Error::last_os_error()
            )));
        }
        Ok(unsafe { take(out) })
    }
}

#[cfg(not(windows))]
mod protect {
    //! Non-Windows builds are for development and tests only: no OS key vault is used.
    use crate::error::{PosError, Result};
    pub const AVAILABLE: bool = false;
    pub fn protect(_data: &[u8]) -> Result<Vec<u8>> {
        Err(PosError::Db("DPAPI is only available on Windows".into()))
    }
    pub fn unprotect(_data: &[u8]) -> Result<Vec<u8>> {
        Err(PosError::Db("This key file was protected with Windows DPAPI on another PC".into()))
    }
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

    #[test]
    fn test_keys_are_not_predictable() {
        let a = DbKeyManager::generate_random_key();
        let b = DbKeyManager::generate_random_key();
        assert_ne!(a, b);
        assert_ne!(a, [0u8; 32]);
    }

    #[test]
    fn test_key_file_roundtrip_and_legacy_upgrade() {
        let dir = std::env::temp_dir().join(format!(
            "npkey-{}",
            hex_encode(&DbKeyManager::generate_random_key()[..4])
        ));
        let file = dir.join("db.key");
        let (k1, created) = DbKeyManager::load_or_create_key(&file).unwrap();
        assert!(created);
        let (k2, created2) = DbKeyManager::load_or_create_key(&file).unwrap();
        assert!(!created2);
        assert_eq!(k1, k2);
        let stored = fs::read_to_string(&file).unwrap();
        assert!(!stored.contains(&DbKeyManager::format_recovery_phrase(&k1)));

        // A legacy plain recovery phrase is read and upgraded in place
        fs::write(&file, DbKeyManager::format_recovery_phrase(&k1)).unwrap();
        let (k3, _) = DbKeyManager::load_or_create_key(&file).unwrap();
        assert_eq!(k1, k3);
        assert!(fs::read_to_string(&file).unwrap().starts_with("NPKEY-"));
        let _ = fs::remove_dir_all(&dir);
    }
}
