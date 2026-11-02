//! Machine fingerprint for license binding.
//!
//! The ID has two halves so one hardware/OS change does not lock the shop out:
//! * groups 1-2: SHA-256 of the OS installation ID (Windows `MachineGuid`,
//!   Linux `/etc/machine-id`)
//! * groups 3-4: SHA-256 of the system drive's volume serial number (Windows),
//!   or of the product UUID / boot ID source on Linux
//!
//! Environment variables and the PC name are deliberately NOT used: they are
//! trivial to change or copy.

use sha2::{Digest, Sha256};

pub struct HardwareFingerprint;

impl HardwareFingerprint {
    /// Returns the machine ID, formatted `KPOS-XXXX-XXXX-XXXX-XXXX`.
    pub fn get_machine_id() -> String {
        let os_id = platform::os_install_id().unwrap_or_default();
        let disk_id = platform::system_volume_id().unwrap_or_default();
        Self::format_id(&os_id, &disk_id)
    }

    /// Builds the formatted ID from the two raw identifiers (exposed for tests).
    pub fn format_id(os_install_id: &str, volume_id: &str) -> String {
        let h1 = half(os_install_id, "os");
        let h2 = half(volume_id, "vol");
        format!("KPOS-{}-{}-{}-{}", &h1[0..4], &h1[4..8], &h2[0..4], &h2[4..8])
    }

    /// True when `licensed` and `current` are the same machine, allowing one of the
    /// two halves (OS install or system disk) to have changed.
    pub fn matches(licensed: &str, current: &str) -> bool {
        if licensed.eq_ignore_ascii_case(current) {
            return true;
        }
        let a: Vec<&str> = licensed.split('-').collect();
        let b: Vec<&str> = current.split('-').collect();
        if a.len() != 5 || b.len() != 5 || a[0] != "KPOS" || b[0] != "KPOS" {
            return false;
        }
        let same = |i: usize| a[i].eq_ignore_ascii_case(b[i]);
        let os_half = same(1) && same(2) && !is_empty_half(&a[1..3]);
        let disk_half = same(3) && same(4) && !is_empty_half(&a[3..5]);
        os_half || disk_half
    }
}

/// Hash of an empty identifier, so a missing source never counts as a match.
fn is_empty_half(groups: &[&str]) -> bool {
    let empty = half("", "os");
    let empty_vol = half("", "vol");
    let joined = format!("{}{}", groups[0], groups[1]).to_uppercase();
    joined == empty[..8] || joined == empty_vol[..8]
}

fn half(value: &str, domain: &str) -> String {
    let mut h = Sha256::new();
    h.update(b"NextPOS machine id v1|");
    h.update(domain.as_bytes());
    h.update(b"|");
    h.update(value.trim().to_lowercase().as_bytes());
    let d = h.finalize();
    d[..4].iter().map(|b| format!("{:02X}", b)).collect()
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::Storage::FileSystem::GetVolumeInformationW;
    use windows_sys::Win32::System::Registry::{
        RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn os_install_id() -> Option<String> {
        let subkey = wide("SOFTWARE\\Microsoft\\Cryptography");
        let value = wide("MachineGuid");
        let mut buf = [0u16; 128];
        let mut len: u32 = (buf.len() * 2) as u32;
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey.as_ptr(),
                value.as_ptr(),
                RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
                std::ptr::null_mut(),
                buf.as_mut_ptr() as *mut _,
                &mut len,
            )
        };
        if rc != 0 {
            return None;
        }
        let chars = (len as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..chars]))
    }

    pub fn system_volume_id() -> Option<String> {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        let root = wide(&format!("{}\\", drive.trim_end_matches('\\')));
        let mut serial: u32 = 0;
        let ok = unsafe {
            GetVolumeInformationW(
                root.as_ptr(),
                std::ptr::null_mut(),
                0,
                &mut serial,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
            )
        };
        if ok == 0 {
            None
        } else {
            Some(format!("{:08X}", serial))
        }
    }
}

#[cfg(not(windows))]
mod platform {
    fn read(paths: &[&str]) -> Option<String> {
        paths
            .iter()
            .filter_map(|p| std::fs::read_to_string(p).ok())
            .map(|s| s.trim().to_string())
            .find(|s| !s.is_empty())
    }
    pub fn os_install_id() -> Option<String> {
        read(&["/etc/machine-id", "/var/lib/dbus/machine-id"])
    }
    pub fn system_volume_id() -> Option<String> {
        read(&["/sys/class/dmi/id/product_uuid", "/etc/hostid"])
    }
}

#[cfg(test)]
mod tests {
    use super::HardwareFingerprint as F;

    #[test]
    fn one_changed_half_still_matches() {
        let orig = F::format_id("guid-A", "VOL-1");
        assert!(F::matches(&orig, &F::format_id("guid-A", "VOL-2")));
        assert!(F::matches(&orig, &F::format_id("guid-B", "VOL-1")));
        assert!(!F::matches(&orig, &F::format_id("guid-B", "VOL-2")));
    }

    #[test]
    fn missing_sources_never_match_each_other() {
        let a = F::format_id("", "VOL-1");
        let b = F::format_id("", "VOL-2");
        assert!(!F::matches(&a, &b));
    }
}
