//! Android phones working with this shop PC over the shop WiFi.
//!
//! The PC stays the only database. A phone is paired once by the Owner (QR
//! code on the PC), then sends commands here. Every command still goes through
//! login, role permissions, license and shift checks, exactly as on the PC.
//! Each phone has its own login, kept separate from whoever is logged in on
//! the PC itself.

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{now, perm_err, set_setting, setting, PosApp};
use crate::auth::{Permission, UserSession};
use crate::domain::audit::AuditRepo;
use crate::error::{PosError, Result};

/// How long a pairing QR code works.
pub const PAIRING_MINUTES: i64 = 10;

/// Commands a phone may run. Everything else (users, settings, backups,
/// licence, cloud, printing on the PC) is only possible on the PC itself.
pub const PHONE_COMMANDS: &[&str] = &[
    "app_status",
    "login_password",
    "login_pin",
    "logout",
    "get_settings",
    "search_products",
    "search_sellable",
    "scan_code",
    "generate_barcode",
    "assign_barcode",
    "create_product",
    "update_price",
    "list_units",
    "list_categories",
    "list_brands",
    "list_tax_rates",
    "stock_list",
    "list_customers",
    "list_vendors",
    "create_party",
    "active_shift",
    "start_shift",
    "cash_drop",
    "close_shift",
    "quote",
    "checkout",
    "recent_sales",
    "get_receipt",
    "park_cart",
    "list_parked",
    "recall_parked",
    "delete_parked",
    "find_sale_for_return",
    "post_return",
    "khata_statement",
    "receive_payment",
    "aging",
    "open_whatsapp_reminder",
    "post_purchase",
    "list_purchases",
    "start_stock_count",
    "record_stock_counts",
    "current_stock_count",
    "finalize_stock_count",
    "financial_summary",
    "category_performance",
    "top_products",
    "low_stock",
    "license_info",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LanDevice {
    pub id: String,
    pub name: String,
    pub paired_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub last_ip: Option<String>,
    pub revoked: bool,
}

/// Result of a successful pairing: what the phone must keep.
#[derive(Debug, Clone)]
pub struct PairedDevice {
    pub device_id: String,
    pub secret: String,
    pub store_name: String,
}

fn hash_secret(secret: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(secret.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

fn random_hex(bytes: usize) -> Result<String> {
    let mut b = vec![0u8; bytes];
    getrandom::getrandom(&mut b).map_err(|e| PosError::Validation(format!("random: {e}")))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn ct_eq(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl PosApp {
    /// Is phone access switched on (Owner setting)?
    pub fn lan_enabled(&self) -> Result<bool> {
        Ok(setting(self.conn()?, "lan.enabled")?.as_deref() == Some("1"))
    }

    pub fn set_lan_enabled(&mut self, enabled: bool) -> Result<()> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        set_setting(self.conn()?, "lan.enabled", if enabled { "1" } else { "0" })?;
        AuditRepo::write(self.conn()?, Some(&uid), if enabled { "phones_enabled" } else { "phones_disabled" }, "security", None, None, None)?;
        if !enabled {
            self.lan_pairing = None;
        }
        Ok(())
    }

    /// A new one-time pairing code (Owner only). Replaces any earlier code.
    pub fn lan_new_pairing_code(&mut self) -> Result<String> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        if !self.lan_enabled()? {
            return Err(perm_err("Turn on phone access first"));
        }
        let code = random_hex(16)?;
        self.lan_pairing = Some((code.clone(), now() + Duration::minutes(PAIRING_MINUTES)));
        AuditRepo::write(self.conn()?, Some(&uid), "phone_pairing_code_shown", "security", None, None, None)?;
        Ok(code)
    }

    /// Stop showing the pairing code (dialog closed).
    pub fn lan_cancel_pairing(&mut self) {
        self.lan_pairing = None;
    }

    /// A phone presents the code from the QR. The code works once.
    pub fn lan_pair(&mut self, code: &str, device_name: &str, ip: &str) -> Result<PairedDevice> {
        if !self.lan_enabled()? {
            return Err(perm_err("Phone access is turned off on the PC"));
        }
        let valid = match &self.lan_pairing {
            Some((c, until)) => ct_eq(c, code) && now() <= *until,
            None => false,
        };
        if !valid {
            return Err(perm_err("This pairing code has expired or was already used. Show a new code on the PC."));
        }
        self.lan_pairing = None;
        let id = format!("dev_{}", ulid::Ulid::new());
        let secret = random_hex(32)?;
        let name: String = device_name.trim().chars().filter(|c| !c.is_control()).take(40).collect();
        let name = if name.is_empty() { "Android phone".to_string() } else { name };
        self.conn()?.execute(
            "INSERT INTO lan_devices (id, name, secret_hash, paired_at, last_seen_at, last_ip) VALUES (?1, ?2, ?3, ?4, ?4, ?5)",
            params![id, name, hash_secret(&secret), now(), ip],
        )?;
        AuditRepo::write(self.conn()?, None, "phone_paired", "lan_device", Some(&id), None, Some(&format!("{{\"name\":{},\"ip\":{}}}", serde_json::json!(name), serde_json::json!(ip))))?;
        let store_name = self.get_settings_unchecked().map(|s| s.name).unwrap_or_default();
        Ok(PairedDevice { device_id: id, secret, store_name })
    }

    /// Check a phone's identity. Returns the phone's name.
    pub fn lan_authenticate(&self, device_id: &str, secret: &str, ip: &str) -> Result<String> {
        if !self.lan_enabled()? {
            return Err(perm_err("Phone access is turned off on the PC"));
        }
        let row: Option<(String, String, Option<DateTime<Utc>>, Option<String>, Option<String>)> = self
            .conn()?
            .query_row(
                "SELECT name, secret_hash, last_seen_at, last_ip, revoked_at FROM lan_devices WHERE id = ?1",
                params![device_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()?;
        let unknown = || perm_err("This phone is not paired with the shop PC. Pair it again.");
        let (name, hash, last_seen, last_ip, revoked) = row.ok_or_else(unknown)?;
        if revoked.is_some() || !ct_eq(&hash, &hash_secret(secret)) {
            return Err(unknown());
        }
        let stale = last_seen.map_or(true, |t| now() - t > Duration::seconds(60));
        if stale || last_ip.as_deref() != Some(ip) {
            self.conn()?.execute("UPDATE lan_devices SET last_seen_at = ?2, last_ip = ?3 WHERE id = ?1", params![device_id, now(), ip])?;
        }
        Ok(name)
    }

    /// Paired phones (Owner only), newest first. Removed phones are listed too.
    pub fn lan_devices(&self) -> Result<Vec<LanDevice>> {
        self.require(Permission::SettingsManage)?;
        let conn = self.conn()?;
        let mut st = conn.prepare("SELECT id, name, paired_at, last_seen_at, last_ip, revoked_at FROM lan_devices ORDER BY revoked_at IS NOT NULL, paired_at DESC")?;
        let rows = st
            .query_map([], |r| {
                Ok(LanDevice {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    paired_at: r.get(2)?,
                    last_seen_at: r.get(3)?,
                    last_ip: r.get(4)?,
                    revoked: r.get::<_, Option<String>>(5)?.is_some(),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Remove a phone (Owner only). It stops working at once.
    pub fn lan_revoke_device(&mut self, device_id: &str) -> Result<()> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        let n = self.conn()?.execute("UPDATE lan_devices SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL", params![device_id, now()])?;
        if n == 0 {
            return Err(perm_err("Phone not found"));
        }
        AuditRepo::write(self.conn()?, Some(&uid), "phone_removed", "lan_device", Some(device_id), None, None)?;
        Ok(())
    }

    /// Put another login in place (for one phone's command) and get the old one back.
    pub fn swap_session(&mut self, s: Option<UserSession>) -> Option<UserSession> {
        std::mem::replace(&mut self.session, s)
    }

    /// Run a command for a phone, with that phone's own login.
    pub fn phone_dispatch(&mut self, phone_session: &mut Option<UserSession>, cmd: &str, args: &serde_json::Value) -> Result<serde_json::Value> {
        if !PHONE_COMMANDS.contains(&cmd) {
            return Err(perm_err("This can only be done on the shop PC"));
        }
        let pc_session = self.swap_session(phone_session.take());
        let res = self.dispatch(cmd, args);
        *phone_session = self.swap_session(pc_session);
        let mut v = res?;
        if cmd == "app_status" {
            if let Some(st) = v.get_mut("status").and_then(|s| s.as_object_mut()) {
                st.insert("data_dir".into(), serde_json::Value::String(String::new()));
            }
        }
        Ok(v)
    }

    fn get_settings_unchecked(&self) -> Result<crate::domain::settings::BusinessSettings> {
        crate::domain::settings::SettingsRepo::get(self.conn()?)
    }
}

#[cfg(feature = "lan-hub")]
pub use hub::{local_addresses, LanHub, RemoteScan, SharedApp};

#[cfg(feature = "lan-hub")]
mod hub {
    use std::collections::HashMap;
    use std::net::{IpAddr, SocketAddr, TcpListener, UdpSocket};
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;
    use std::time::Duration;

    use pos_lan::{PairRequest, PairResponse, PairingQr, RpcRequest, ScanRequest, H_DEVICE_ID, H_DEVICE_SECRET};
    use serde_json::{json, Value};

    use super::super::PosApp;
    use crate::auth::UserSession;

    /// The app as the desktop shell shares it between its commands and the hub.
    pub type SharedApp = Arc<Mutex<std::result::Result<PosApp, String>>>;

    /// A barcode read by a phone camera, for the screen open on the PC.
    #[derive(Debug, Clone, serde::Serialize)]
    pub struct RemoteScan {
        pub code: String,
        pub device_id: String,
        pub device_name: String,
    }

    type OnScan = Arc<dyn Fn(RemoteScan) + Send + Sync>;

    struct Shared {
        app: SharedApp,
        sessions: Mutex<HashMap<String, UserSession>>,
        on_scan: OnScan,
        stop: AtomicBool,
        busy: AtomicUsize,
    }

    /// The running phone link on the PC.
    pub struct LanHub {
        shared: Arc<Shared>,
        pub port: u16,
        pub fingerprint: String,
        threads: Vec<JoinHandle<()>>,
    }

    const MAX_CONNECTIONS: usize = 32;

    fn load_or_make_cert(dir: &Path) -> std::result::Result<(Vec<u8>, Vec<u8>), String> {
        let (cp, kp) = (dir.join("lan_cert.der"), dir.join("lan_key.der"));
        if let (Ok(c), Ok(k)) = (std::fs::read(&cp), std::fs::read(&kp)) {
            if pos_lan::tls::server_config(&c, &k).is_ok() {
                return Ok((c, k));
            }
        }
        let (c, k) = pos_lan::tls::generate_certificate()?;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        std::fs::write(&cp, &c).map_err(|e| e.to_string())?;
        std::fs::write(&kp, &k).map_err(|e| e.to_string())?;
        Ok((c, k))
    }

    fn reply(v: Value) -> (u16, Vec<u8>) {
        (200, serde_json::to_vec(&v).unwrap_or_default())
    }

    fn err(status: u16, msg: impl std::fmt::Display) -> (u16, Vec<u8>) {
        (status, serde_json::to_vec(&json!({ "error": msg.to_string() })).unwrap_or_default())
    }

    fn handle(shared: &Shared, req: &pos_lan::http::Request, ip: IpAddr) -> (u16, Vec<u8>) {
        let ip = ip.to_string();
        let mut guard = match shared.app.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let app = match guard.as_mut() {
            Ok(a) => a,
            Err(e) => return err(503, format!("The shop data on the PC could not be opened: {e}")),
        };

        if req.path == "/v1/pair" {
            let Ok(p) = serde_json::from_slice::<PairRequest>(&req.body) else { return err(400, "Bad request") };
            return match app.lan_pair(&p.code, &p.device_name, &ip) {
                Ok(d) => reply(json!(PairResponse { device_id: d.device_id, secret: d.secret, store_name: d.store_name })),
                Err(e) => err(403, e.to_string()),
            };
        }

        let (Some(id), Some(secret)) = (req.headers.get(H_DEVICE_ID), req.headers.get(H_DEVICE_SECRET)) else {
            return err(401, "This phone is not paired with the shop PC. Pair it again.");
        };
        let device_name = match app.lan_authenticate(id, secret, &ip) {
            Ok(n) => n,
            Err(e) => {
                shared.sessions.lock().map(|mut s| s.remove(id)).ok();
                let status = if app.lan_enabled().unwrap_or(false) { 401 } else { 503 };
                return err(status, e.to_string());
            }
        };

        match req.path.as_str() {
            "/v1/ping" => {
                let store = app.get_settings_unchecked().map(|s| s.name).unwrap_or_default();
                let user = shared.sessions.lock().ok().and_then(|s| s.get(id).filter(|u| !u.is_expired()).map(|u| u.username.clone()));
                reply(json!({ "ok": true, "store_name": store, "device_name": device_name, "user": user, "version": env!("CARGO_PKG_VERSION") }))
            }
            "/v1/scan" => {
                let Ok(s) = serde_json::from_slice::<ScanRequest>(&req.body) else { return err(400, "Bad request") };
                let code = s.code.trim().to_string();
                if code.is_empty() || code.len() > 64 || code.chars().any(|c| c.is_control()) {
                    return err(400, "That barcode cannot be used");
                }
                (shared.on_scan)(RemoteScan { code, device_id: id.clone(), device_name });
                reply(json!({ "ok": true }))
            }
            "/v1/rpc" => {
                let Ok(r) = serde_json::from_slice::<RpcRequest>(&req.body) else { return err(400, "Bad request") };
                let mut sessions = match shared.sessions.lock() {
                    Ok(s) => s,
                    Err(p) => p.into_inner(),
                };
                let mut phone = sessions.remove(id);
                let res = app.phone_dispatch(&mut phone, &r.cmd, &r.args);
                if let Some(s) = phone {
                    sessions.insert(id.clone(), s);
                }
                match res {
                    Ok(data) => reply(json!({ "ok": true, "data": data })),
                    Err(e) => reply(json!({ "ok": false, "error": e.to_string() })),
                }
            }
            _ => err(404, "Not found"),
        }
    }

    /// The PC's WiFi/LAN addresses, private ones first.
    pub fn local_addresses() -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        if let Ok(ifs) = if_addrs::get_if_addrs() {
            for i in ifs {
                if let IpAddr::V4(v4) = i.ip() {
                    if !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified() {
                        let s = v4.to_string();
                        if v4.is_private() {
                            out.insert(0, s);
                        } else {
                            out.push(s);
                        }
                    }
                }
            }
        }
        out.dedup();
        out
    }

    impl LanHub {
        /// Start listening. `security_dir` holds the PC's certificate.
        pub fn start(app: SharedApp, security_dir: &Path, port: u16, discovery_port: Option<u16>, on_scan: OnScan) -> std::result::Result<LanHub, String> {
            let (cert, key) = load_or_make_cert(security_dir)?;
            let fingerprint = pos_lan::tls::fingerprint(&cert);
            let cfg = pos_lan::tls::server_config(&cert, &key)?;
            let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port)))
                .map_err(|e| format!("Port {port} is in use or blocked ({e}). Close other copies of Next POS."))?;
            let port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
            listener.set_nonblocking(true).map_err(|e| e.to_string())?;
            let shared = Arc::new(Shared { app, sessions: Mutex::new(HashMap::new()), on_scan, stop: AtomicBool::new(false), busy: AtomicUsize::new(0) });

            let mut threads = Vec::new();
            {
                let shared = shared.clone();
                threads.push(std::thread::spawn(move || {
                    while !shared.stop.load(Ordering::Relaxed) {
                        match listener.accept() {
                            Ok((tcp, _)) => {
                                if shared.busy.load(Ordering::Relaxed) >= MAX_CONNECTIONS {
                                    continue;
                                }
                                let _ = tcp.set_nonblocking(false);
                                let (shared, cfg) = (shared.clone(), cfg.clone());
                                shared.busy.fetch_add(1, Ordering::Relaxed);
                                std::thread::spawn(move || {
                                    pos_lan::serve_connection(tcp, cfg, |req, ip| handle(&shared, req, ip));
                                    shared.busy.fetch_sub(1, Ordering::Relaxed);
                                });
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(25)),
                            Err(_) => std::thread::sleep(Duration::from_millis(200)),
                        }
                    }
                }));
            }
            if let Some(dp) = discovery_port {
                // Discovery is a convenience: if its port is taken, phones still work by address.
                if let Ok(sock) = UdpSocket::bind(SocketAddr::from(([0, 0, 0, 0], dp))) {
                    let (stop_flag, fp) = (Arc::new(AtomicBool::new(false)), fingerprint.clone());
                    let watch = shared.clone();
                    let flag2 = stop_flag.clone();
                    threads.push(std::thread::spawn(move || pos_lan::discovery::run_responder(sock, port, fp, flag2)));
                    threads.push(std::thread::spawn(move || {
                        while !watch.stop.load(Ordering::Relaxed) {
                            std::thread::sleep(Duration::from_millis(200));
                        }
                        stop_flag.store(true, Ordering::Relaxed);
                    }));
                }
            }
            Ok(LanHub { shared, port, fingerprint, threads })
        }

        /// What goes into the pairing QR code.
        pub fn pairing_qr(&self, store: &str, code: &str) -> PairingQr {
            PairingQr { v: 1, store: store.to_string(), hosts: local_addresses(), port: self.port, fp: self.fingerprint.clone(), code: code.to_string() }
        }

        /// Forget a phone's login (after it is removed).
        pub fn forget_session(&self, device_id: &str) {
            if let Ok(mut s) = self.shared.sessions.lock() {
                s.remove(device_id);
            }
        }

        pub fn stop(mut self) {
            self.shared.stop.store(true, Ordering::Relaxed);
            for t in self.threads.drain(..) {
                let _ = t.join();
            }
        }
    }
}
