//! Browser test server (development only).
//!
//! Runs the same checked backend (`PosApp`) as the desktop app and answers the
//! UI's commands over HTTP, so the screens can be tested in a normal browser
//! (with Agentation) before building the desktop app.
//!
//!   cargo run -p pos-core --features dev-server --bin pos-dev-server
//!
//! Safety: listens on 127.0.0.1 only, accepts requests only from the Vite dev
//! page (http://localhost:1420) with the X-NextPOS-Dev header, and uses its own
//! test database (%APPDATA%\NextPOS-dev), never the real shop data.
//! Not part of the desktop build.

use std::io::Read;
use std::path::PathBuf;

use std::collections::{HashMap, VecDeque};

use pos_core::app::PosApp;
use pos_core::auth::UserSession;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Response, Server};

// 1420 = desktop screens, 1421 = phone app screens.
const ALLOWED_ORIGINS: [&str; 4] = ["http://localhost:1420", "http://127.0.0.1:1420", "http://localhost:1421", "http://127.0.0.1:1421"];

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn main() {
    let port: u16 = std::env::var("NEXTPOS_DEV_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(4848);
    let data_dir = std::env::var("NEXTPOS_DEV_DATA_DIR").map(PathBuf::from).unwrap_or_else(|_| {
        PosApp::default_data_dir()
            .parent()
            .map(|p| p.join("NextPOS-dev"))
            .unwrap_or_else(|| PathBuf::from("NextPOS-dev"))
    });

    let mut app = match PosApp::open(&data_dir) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Could not open the test database in {}: {}", data_dir.display(), e);
            std::process::exit(1);
        }
    };
    let server = Server::http(("127.0.0.1", port)).unwrap_or_else(|e| {
        eprintln!("Could not listen on 127.0.0.1:{}: {}", port, e);
        std::process::exit(1);
    });
    println!("Next POS browser test server on http://127.0.0.1:{}", port);
    println!("Test data folder: {} (not the real shop data)", data_dir.display());

    // Phone test mode: logins per test phone, and barcodes "scanned" by phones
    // waiting for the desktop screen to pick them up.
    let mut phone_sessions: HashMap<String, UserSession> = HashMap::new();
    let mut scans: VecDeque<Value> = VecDeque::new();

    for mut req in server.incoming_requests() {
        let origin = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))
            .map(|h| h.value.as_str().to_string());
        let allowed = origin.as_deref().map(|o| ALLOWED_ORIGINS.contains(&o)).unwrap_or(false);
        let cors = |r: Response<std::io::Cursor<Vec<u8>>>| {
            if allowed {
                r.with_header(header("Access-Control-Allow-Origin", origin.as_deref().unwrap_or("")))
                    .with_header(header("Vary", "Origin"))
            } else {
                r
            }
        };

        if *req.method() == Method::Options {
            let r = cors(Response::from_string(""))
                .with_header(header("Access-Control-Allow-Methods", "POST"))
                .with_header(header("Access-Control-Allow-Headers", "content-type, x-nextpos-dev"))
                .with_status_code(if allowed { 204 } else { 403 });
            let _ = req.respond(r);
            continue;
        }

        let has_dev_header = req.headers().iter().any(|h| h.field.equiv("X-NextPOS-Dev") && h.value.as_str() == "1");
        let url = req.url().to_string();
        let phone_cmd = url.strip_prefix("/phone/").map(|s| s.to_string());
        let cmd = url.strip_prefix("/invoke/").map(|s| s.to_string()).or_else(|| phone_cmd.as_ref().map(|_| String::new()));
        if !allowed || !has_dev_header || *req.method() != Method::Post || cmd.is_none() {
            let _ = req.respond(cors(Response::from_string("forbidden")).with_status_code(403));
            continue;
        }

        let mut body = String::new();
        let _ = req.as_reader().take(20 * 1024 * 1024).read_to_string(&mut body);
        let args: serde_json::Value = serde_json::from_str(if body.is_empty() { "{}" } else { &body }).unwrap_or(serde_json::json!({}));
        let result = match &phone_cmd {
            Some(p) => phone(&mut app, &mut phone_sessions, &mut scans, p, &args),
            None => desktop(&mut app, &mut scans, cmd.as_deref().unwrap_or(""), &args),
        };
        let (status, out) = match result {
            Ok(v) => (200, v),
            Err(e) => (400, serde_json::json!({ "error": e })),
        };
        let r = cors(Response::from_string(out.to_string()))
            .with_header(header("Content-Type", "application/json"))
            .with_status_code(status);
        let _ = req.respond(r);
    }
}

/// Desktop commands, plus the phone-link commands the desktop app has (simulated:
/// no network listener in browser test mode).
fn desktop(app: &mut PosApp, scans: &mut VecDeque<Value>, cmd: &str, a: &Value) -> Result<Value, String> {
    let e = |e: pos_core::error::PosError| e.to_string();
    match cmd {
        "phones_status" => {
            app.lan_devices().map_err(e)?;
            let on = app.lan_enabled().map_err(e)?;
            Ok(json!({ "enabled": on, "running": on, "port": pos_lan::HTTP_PORT, "addresses": ["browser-test"], "error": null }))
        }
        "set_phones_enabled" => {
            app.set_lan_enabled(a.get("enabled").and_then(Value::as_bool).unwrap_or(false)).map_err(e)?;
            Ok(Value::Null)
        }
        "phone_pairing_qr" => {
            let code = app.lan_new_pairing_code().map_err(e)?;
            let store = app.get_settings().map_err(e)?.name;
            let qr = pos_lan::PairingQr { v: 1, store, hosts: vec!["browser-test".into()], port: pos_lan::HTTP_PORT, fp: "0".repeat(64), code };
            Ok(json!(qr.to_qr_text()))
        }
        "cancel_phone_pairing" => {
            app.lan_cancel_pairing();
            Ok(Value::Null)
        }
        "list_phones" => Ok(json!(app.lan_devices().map_err(e)?)),
        "remove_phone" => {
            app.lan_revoke_device(a.get("device_id").and_then(Value::as_str).unwrap_or("")).map_err(e)?;
            Ok(Value::Null)
        }
        "poll_remote_scans" => Ok(json!(scans.drain(..).collect::<Vec<_>>())),
        _ => app.dispatch(cmd, a).map_err(e),
    }
}

/// A simulated paired phone (the phone app's screens in a browser).
fn phone(app: &mut PosApp, sessions: &mut HashMap<String, UserSession>, scans: &mut VecDeque<Value>, what: &str, a: &Value) -> Result<Value, String> {
    let s = |k: &str| a.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    if what == "pair" {
        let qr = pos_lan::PairingQr::parse(&s("qr"))?;
        let d = app.lan_pair(&qr.code, &s("device_name"), "127.0.0.1").map_err(|e| e.to_string())?;
        return Ok(json!({ "store_name": d.store_name, "hosts": ["browser-test"], "port": qr.port, "fingerprint": qr.fp, "device_id": d.device_id, "secret": d.secret }));
    }
    let id = s("device_id");
    let name = app.lan_authenticate(&id, &s("secret"), "127.0.0.1").map_err(|e| format!("NOT_PAIRED: {e}"))?;
    match what {
        "ping" => {
            let store = app.status().map(|st| st.store_name.unwrap_or_default()).unwrap_or_default();
            Ok(json!({ "ok": true, "store_name": store, "device_name": name, "user": sessions.get(&id).map(|u| u.username.clone()) }))
        }
        "scan" => {
            scans.push_back(json!({ "code": s("code"), "device_id": id, "device_name": name }));
            Ok(json!({ "ok": true }))
        }
        "rpc" => {
            let mut slot = sessions.remove(&id);
            let res = app.phone_dispatch(&mut slot, &s("cmd"), a.get("args").unwrap_or(&Value::Null));
            if let Some(u) = slot {
                sessions.insert(id, u);
            }
            res.map_err(|e| e.to_string())
        }
        _ => Err("unknown".into()),
    }
}
