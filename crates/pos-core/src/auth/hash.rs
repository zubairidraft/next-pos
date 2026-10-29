use crate::error::{PosError, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

/// Generates a valid Argon2 salt string from cryptographically strong local entropy.
fn generate_salt() -> Result<SaltString> {
    let key = crate::db::key::DbKeyManager::generate_random_key();
    // SaltString requires 16 to 64 bytes
    SaltString::encode_b64(&key[..16])
        .map_err(|e| PosError::Validation(format!("Failed to generate salt: {}", e)))
}

/// Hashes a plaintext password using Argon2id with a cryptographically random salt.
pub fn hash_password(password: &str) -> Result<String> {
    if password.len() < 4 {
        return Err(PosError::Validation(
            "Password must be at least 4 characters long".into(),
        ));
    }
    let salt = generate_salt()?;
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| PosError::Validation(format!("Argon2 hashing failed: {}", e)))?
        .to_string();
    Ok(password_hash)
}

/// Verifies a plaintext password against an Argon2id password hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| PosError::Validation(format!("Invalid password hash format: {}", e)))?;
    let argon2 = Argon2::default();
    Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

/// Validates and hashes a 4-to-6 digit numeric cashier PIN using Argon2id.
pub fn hash_pin(pin: &str) -> Result<String> {
    let trimmed = pin.trim();
    if trimmed.len() < 4 || trimmed.len() > 6 {
        return Err(PosError::Validation(
            "Cashier PIN must be between 4 and 6 digits".into(),
        ));
    }
    if !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Err(PosError::Validation(
            "Cashier PIN must contain only numeric digits".into(),
        ));
    }
    hash_password(trimmed)
}

/// Verifies a cashier PIN against its stored Argon2id hash.
pub fn verify_pin(pin: &str, hash: &str) -> Result<bool> {
    let trimmed = pin.trim();
    if !trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Ok(false);
    }
    verify_password(trimmed, hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hash_and_verify() {
        let password = "SuperSecretShopPassword123!";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("WrongPassword", &hash).unwrap());
    }

    #[test]
    fn test_pin_validation_and_verify() {
        let pin = "1234";
        let hash = hash_pin(pin).unwrap();
        assert!(verify_pin("1234", &hash).unwrap());
        assert!(!verify_pin("4321", &hash).unwrap());

        // Invalid pins
        assert!(hash_pin("12").is_err()); // too short
        assert!(hash_pin("1234567").is_err()); // too long
        assert!(hash_pin("12a4").is_err()); // non-numeric
    }
}
