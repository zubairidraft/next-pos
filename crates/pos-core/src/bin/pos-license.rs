//! Dealer & Distributor Offline License Generator CLI

use chrono::{Duration, Utc};
use pos_core::licensing::{
    HardwareFingerprint, LicenseFeatures, LicenseManager, LicensePayload, LicenseTier,
};
use std::env;

fn print_usage() {
    println!("Next POS (کاروبار پی او ایس) — Offline License Provisioning Tool");
    println!("Usage:");
    println!("  pos-license --generate --store <STORE_NAME> --machine <MACHINE_ID> [--tier <standard|enterprise>] [--days <DAYS>]");
    println!("  pos-license --fingerprint");
    println!("  pos-license --verify <TOKEN>");
    println!();
    println!("Examples:");
    println!("  pos-license --fingerprint");
    println!("  pos-license --generate --store \"Madina Cash & Carry\" --machine \"KPOS-A93F-4182-5CB1-8E29\" --tier enterprise");
    println!("  pos-license --verify 7B227374...9E37");
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        return;
    }

    match args[1].as_str() {
        "--fingerprint" => {
            let id = HardwareFingerprint::get_machine_id();
            println!("Local Machine Fingerprint: {}", id);
        }
        "--verify" => {
            if args.len() < 3 {
                eprintln!("Error: Missing license token argument.");
                return;
            }
            let token = &args[2];
            let current_id = HardwareFingerprint::get_machine_id();
            let now = Utc::now();
            let status = LicenseManager::verify_license(token, &current_id, &now, None);
            println!("Verification Result: {:?}", status);
        }
        "--generate" => {
            let mut store_name = "Retail Merchant".to_string();
            let mut machine_id = "*".to_string();
            let mut tier = LicenseTier::Enterprise;
            let mut days_valid: Option<i64> = None; // Perpetual by default

            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "--store" if i + 1 < args.len() => {
                        store_name = args[i + 1].clone();
                        i += 2;
                    }
                    "--machine" if i + 1 < args.len() => {
                        machine_id = args[i + 1].clone();
                        i += 2;
                    }
                    "--tier" if i + 1 < args.len() => {
                        if args[i + 1].to_lowercase() == "standard" {
                            tier = LicenseTier::Standard;
                        } else {
                            tier = LicenseTier::Enterprise;
                        }
                        i += 2;
                    }
                    "--days" if i + 1 < args.len() => {
                        days_valid = args[i + 1].parse().ok();
                        i += 2;
                    }
                    _ => i += 1,
                }
            }

            let now = Utc::now();
            let expires_at = days_valid.map(|d| (now + Duration::days(d)).to_rfc3339());

            let payload = LicensePayload {
                store_name: store_name.clone(),
                machine_id: machine_id.clone(),
                tier,
                issued_at: now.to_rfc3339(),
                expires_at,
                features: LicenseFeatures {
                    grocery_pack: true,
                    electronics_pack: true,
                    apparel_pack: true,
                    multi_till: true,
                },
            };

            match LicenseManager::create_license_token(&payload, None) {
                Ok(token) => {
                    println!("============================================================");
                    println!("OFFLINE COMMERCIAL LICENSE ISSUED SUCCESSFULLY");
                    println!("============================================================");
                    println!("Store Name:  {}", store_name);
                    println!("Machine ID:  {}", machine_id);
                    println!("Tier:        {:?}", tier);
                    println!("Expiration:  {}", payload.expires_at.as_deref().unwrap_or("Perpetual (Never Expires)"));
                    println!("Token:       {}", token);
                    println!("============================================================");
                }
                Err(e) => {
                    eprintln!("Failed to generate license: {}", e);
                }
            }
        }
        _ => print_usage(),
    }
}
