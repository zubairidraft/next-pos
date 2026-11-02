//! Dealer & Distributor Offline License Tool
//!
//! The private signing key never ships with the app. Keep `license_signing.key`
//! on the dealer PC only (and an offline backup); anyone who has it can issue licenses.

use chrono::{Duration, Utc};
use pos_core::licensing::{
    HardwareFingerprint, LicenseFeatures, LicenseManager, LicensePayload, LicenseTier,
};
use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

const KEY_PREFIX: &str = "NPLSK1:";

fn print_usage() {
    println!("Next POS — Offline License Tool");
    println!("Usage:");
    println!("  pos-license --keygen --out <license_signing.key>");
    println!("  pos-license --generate --key <license_signing.key> --store <NAME> --machine <KPOS-ID> [--tier standard|professional|enterprise] [--days <DAYS>] [--packs grocery,electronics,apparel,multi_till]");
    println!("  pos-license --generate --key <file> --store <NAME> --any-machine --days <DAYS>   (dealer demo only)");
    println!("  pos-license --fingerprint");
    println!("  pos-license --verify <TOKEN>");
    println!();
    println!("The key file can also be given with the NEXTPOS_LICENSE_KEY_FILE environment variable.");
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn load_key(path: &PathBuf) -> Result<[u8; 32], String> {
    let s = std::fs::read_to_string(path).map_err(|e| format!("cannot read key file {}: {}", path.display(), e))?;
    let h = s.trim().strip_prefix(KEY_PREFIX).ok_or("not a Next POS signing key file")?;
    if h.len() != 64 {
        return Err("signing key has the wrong length".into());
    }
    let mut k = [0u8; 32];
    for i in 0..32 {
        k[i] = u8::from_str_radix(&h[i * 2..i * 2 + 2], 16).map_err(|_| "invalid hex in key file")?;
    }
    Ok(k)
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        return ExitCode::from(2);
    }

    match args[1].as_str() {
        "--fingerprint" => {
            println!("Local Machine Fingerprint: {}", HardwareFingerprint::get_machine_id());
            ExitCode::SUCCESS
        }
        "--keygen" => {
            let Some(out) = arg_value(&args, "--out").map(PathBuf::from) else {
                eprintln!("Error: --out <file> is required");
                return ExitCode::from(2);
            };
            if out.exists() {
                eprintln!("Error: {} already exists; refusing to overwrite a signing key", out.display());
                return ExitCode::from(1);
            }
            let (seed, public) = LicenseManager::generate_keypair();
            if let Err(e) = std::fs::write(&out, format!("{}{}\n", KEY_PREFIX, hex(&seed))) {
                eprintln!("Error writing key file: {}", e);
                return ExitCode::from(1);
            }
            println!("Private signing key written to: {}", out.display());
            println!("Keep it secret and back it up offline. Do NOT put it in the app or in git.");
            println!();
            println!("Paste this public key into LicenseManager::PUBLIC_KEY (crates/pos-core/src/licensing/license.rs):");
            let parts: Vec<String> = public.iter().map(|b| format!("0x{:02x}", b)).collect();
            println!("    {},", parts[..16].join(", "));
            println!("    {},", parts[16..].join(", "));
            ExitCode::SUCCESS
        }
        "--verify" => {
            let Some(token) = args.get(2) else {
                eprintln!("Error: Missing license token argument.");
                return ExitCode::from(2);
            };
            let current_id = HardwareFingerprint::get_machine_id();
            let status = LicenseManager::verify_license(token, &current_id, &Utc::now(), None);
            println!("Verification Result: {:?}", status);
            ExitCode::SUCCESS
        }
        "--generate" => {
            let key_path = arg_value(&args, "--key")
                .or_else(|| env::var("NEXTPOS_LICENSE_KEY_FILE").ok())
                .map(PathBuf::from);
            let Some(key_path) = key_path else {
                eprintln!("Error: give the signing key with --key <file> or NEXTPOS_LICENSE_KEY_FILE");
                return ExitCode::from(2);
            };
            let seed = match load_key(&key_path) {
                Ok(k) => k,
                Err(e) => {
                    eprintln!("Error: {}", e);
                    return ExitCode::from(1);
                }
            };
            if LicenseManager::public_key_for(&seed) != LicenseManager::PUBLIC_KEY {
                eprintln!("Warning: this signing key does not match the public key built into this version of the app.");
                eprintln!("         Licenses it issues will be rejected as InvalidSignature.");
            }

            let Some(store_name) = arg_value(&args, "--store") else {
                eprintln!("Error: --store <NAME> is required");
                return ExitCode::from(2);
            };
            let any_machine = args.iter().any(|a| a == "--any-machine");
            let machine_id = match (arg_value(&args, "--machine"), any_machine) {
                (Some(m), false) => m,
                (None, true) => "*".to_string(),
                _ => {
                    eprintln!("Error: give exactly one of --machine <KPOS-ID> or --any-machine");
                    return ExitCode::from(2);
                }
            };
            let days: Option<i64> = arg_value(&args, "--days").and_then(|d| d.parse().ok());
            if any_machine && days.is_none() {
                eprintln!("Error: --any-machine licenses must have --days (no perpetual demo licenses)");
                return ExitCode::from(2);
            }
            let tier = match arg_value(&args, "--tier").as_deref().map(str::to_lowercase).as_deref() {
                Some("standard") => LicenseTier::Standard,
                Some("professional") => LicenseTier::Professional,
                None | Some("enterprise") => LicenseTier::Enterprise,
                Some(other) => {
                    eprintln!("Error: unknown tier '{}'", other);
                    return ExitCode::from(2);
                }
            };
            let packs = arg_value(&args, "--packs").unwrap_or_else(|| "grocery,electronics,apparel".into());
            let has = |p: &str| packs.split(',').any(|x| x.trim().eq_ignore_ascii_case(p));

            let now = Utc::now();
            let payload = LicensePayload {
                store_name: store_name.clone(),
                machine_id: machine_id.clone(),
                tier,
                issued_at: now.to_rfc3339(),
                expires_at: days.map(|d| (now + Duration::days(d)).to_rfc3339()),
                features: LicenseFeatures {
                    grocery_pack: has("grocery"),
                    electronics_pack: has("electronics"),
                    apparel_pack: has("apparel"),
                    multi_till: has("multi_till"),
                },
            };

            match LicenseManager::create_license_token(&payload, &seed) {
                Ok(token) => {
                    println!("============================================================");
                    println!("OFFLINE LICENSE ISSUED");
                    println!("Store Name:  {}", store_name);
                    println!("Machine ID:  {}", machine_id);
                    println!("Tier:        {:?}", tier);
                    println!("Expiration:  {}", payload.expires_at.as_deref().unwrap_or("Perpetual"));
                    println!("Token:       {}", token);
                    println!("============================================================");
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("Failed to generate license: {}", e);
                    ExitCode::from(1)
                }
            }
        }
        _ => {
            print_usage();
            ExitCode::from(2)
        }
    }
}
