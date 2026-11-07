//! Next POS link between the shop PC and Android phones over the shop WiFi.
//!
//! * The PC is the only database. Phones never hold the shop data; they send
//!   each action to the PC, which runs it through the same business rules.
//! * Every connection is TLS. The PC makes its own certificate once; the phone
//!   learns its SHA-256 fingerprint from the pairing QR code and refuses any
//!   other certificate, so nobody else on the WiFi can pretend to be the PC.
//! * Each phone gets its own long random secret when it pairs. The owner can
//!   remove a phone at any time on the PC.
//! * When the PC's WiFi address changes (router restart after a power cut),
//!   the phone finds it again with a UDP broadcast and checks the fingerprint.

pub mod client;
pub mod discovery;
pub mod http;
pub mod tls;

use serde::{Deserialize, Serialize};

/// HTTPS port the PC listens on.
pub const HTTP_PORT: u16 = 47800;
/// UDP port the PC answers discovery broadcasts on.
pub const DISCOVERY_PORT: u16 = 47801;
/// Prefix of the text inside the pairing QR code.
pub const QR_PREFIX: &str = "NEXTPOS-PAIR:";

/// What the pairing QR code on the PC screen holds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PairingQr {
    pub v: u8,
    /// Shop name, shown on the phone before it connects.
    pub store: String,
    /// The PC's WiFi addresses (it may have several network cards).
    pub hosts: Vec<String>,
    pub port: u16,
    /// SHA-256 of the PC's TLS certificate, lowercase hex.
    pub fp: String,
    /// One-time pairing code, valid for a few minutes.
    pub code: String,
}

impl PairingQr {
    pub fn to_qr_text(&self) -> String {
        format!("{QR_PREFIX}{}", serde_json::to_string(self).unwrap_or_default())
    }

    pub fn parse(text: &str) -> Result<Self, String> {
        let body = text.trim().strip_prefix(QR_PREFIX).ok_or("This is not a Next POS pairing code.")?;
        let qr: PairingQr = serde_json::from_str(body).map_err(|_| "The pairing code could not be read. Show a new code on the PC.".to_string())?;
        if qr.v != 1 {
            return Err("This pairing code is from a different Next POS version. Update the app.".into());
        }
        if qr.fp.len() != 64 || !qr.fp.chars().all(|c| c.is_ascii_hexdigit()) || qr.code.len() < 16 {
            return Err("The pairing code is damaged. Show a new code on the PC.".into());
        }
        Ok(qr)
    }
}

/// Phone -> PC: pair this phone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairRequest {
    pub code: String,
    pub device_name: String,
}

/// PC -> phone: pairing accepted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairResponse {
    pub device_id: String,
    pub secret: String,
    pub store_name: String,
}

/// Phone -> PC: run one Next POS command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub cmd: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

/// Phone -> PC: a barcode the phone camera read, for the screen open on the PC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    pub code: String,
}

/// Header names for the phone's identity.
pub const H_DEVICE_ID: &str = "x-nextpos-device";
pub const H_DEVICE_SECRET: &str = "x-nextpos-secret";

/// Random bytes as lowercase hex.
pub fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    getrandom::getrandom(&mut b).expect("system random number generator");
    hex(&b)
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Constant-time comparison of two strings.
pub fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex(&Sha256::digest(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_round_trip_and_validation() {
        let qr = PairingQr { v: 1, store: "Madina Store".into(), hosts: vec!["192.168.1.5".into()], port: HTTP_PORT, fp: "a".repeat(64), code: random_hex(16) };
        assert_eq!(PairingQr::parse(&qr.to_qr_text()).unwrap(), qr);
        assert!(PairingQr::parse("hello").is_err());
        let mut bad = qr.clone();
        bad.fp = "zz".into();
        assert!(PairingQr::parse(&bad.to_qr_text()).is_err());
        assert!(ct_eq("abc", "abc") && !ct_eq("abc", "abd") && !ct_eq("abc", "ab"));
    }
}

/// PC side: serve one TLS connection with `handle(request) -> (status, json body)`.
pub fn serve_connection<F>(tcp: std::net::TcpStream, cfg: std::sync::Arc<rustls::ServerConfig>, handle: F)
where
    F: FnOnce(&http::Request, std::net::IpAddr) -> (u16, Vec<u8>),
{
    let peer = match tcp.peer_addr() {
        Ok(a) => a.ip(),
        Err(_) => return,
    };
    let _ = tcp.set_read_timeout(Some(std::time::Duration::from_secs(20)));
    let _ = tcp.set_write_timeout(Some(std::time::Duration::from_secs(20)));
    let Ok(conn) = rustls::ServerConnection::new(cfg) else { return };
    let mut stream = rustls::StreamOwned::new(conn, tcp);
    let (status, body) = match http::read_request(&mut stream) {
        Ok(req) if req.method == "POST" => handle(&req, peer),
        Ok(_) => (404, br#"{"error":"Not found"}"#.to_vec()),
        Err(e) if e.kind() == std::io::ErrorKind::InvalidData && e.to_string().contains("too large") => (413, br#"{"error":"Request too large"}"#.to_vec()),
        Err(_) => return,
    };
    let _ = http::write_response(&mut stream, status, &body);
    stream.conn.send_close_notify();
    let _ = std::io::Write::flush(&mut stream);
}
