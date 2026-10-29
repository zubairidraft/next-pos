//! Stable machine hardware fingerprinting.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub struct HardwareFingerprint;

impl HardwareFingerprint {
    /// Generate a consistent, stable machine identifier for Windows/offline environments
    pub fn get_machine_id() -> String {
        // Collect local machine characteristics
        let hostname = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "UNKNOWN_HOST".to_string());
        let username = std::env::var("USERNAME").unwrap_or_else(|_| "UNKNOWN_USER".to_string());
        let os_arch = std::env::consts::ARCH;

        // Hash system components with non-linear mixing
        let mut hasher = DefaultHasher::new();
        hostname.hash(&mut hasher);
        username.hash(&mut hasher);
        os_arch.hash(&mut hasher);
        "NEXTPOS_CORE_SALT_2026".hash(&mut hasher);

        let h1 = hasher.finish();

        let mut h2: u64 = 0x517cc1b727220a95;
        for (i, b) in hostname.bytes().enumerate() {
            h2 = h2.wrapping_add(b as u64).rotate_left((i % 17 + 1) as u32);
        }

        // Format into readable groups: KPOS-XXXX-XXXX-XXXX
        let hex1 = format!("{:08X}", (h1 ^ 0xA5A5A5A5) as u32);
        let hex2 = format!("{:08X}", (h2 ^ 0x5A5A5A5A) as u32);

        format!(
            "KPOS-{}-{}-{}-{}",
            &hex1[0..4],
            &hex1[4..8],
            &hex2[0..4],
            &hex2[4..8]
        )
    }
}
