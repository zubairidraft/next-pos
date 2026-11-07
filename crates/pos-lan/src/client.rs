//! Phone side of the shop link.

use std::io;
use std::net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

use rustls::pki_types::ServerName;
use rustls::{ClientConnection, StreamOwned};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{http, tls, PairRequest, PairResponse, PairingQr, RpcRequest, ScanRequest, H_DEVICE_ID, H_DEVICE_SECRET};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const IO_TIMEOUT: Duration = Duration::from_secs(25);
const DISCOVERY_WAIT: Duration = Duration::from_millis(2500);

/// What the phone keeps after pairing (in its private app storage).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pairing {
    pub store_name: String,
    /// Known PC addresses, the one that worked last first.
    pub hosts: Vec<String>,
    pub port: u16,
    pub fingerprint: String,
    pub device_id: String,
    pub secret: String,
    #[serde(default = "default_discovery_port")]
    pub discovery_port: u16,
}

fn default_discovery_port() -> u16 {
    crate::DISCOVERY_PORT
}

/// Why a call to the PC did not work. `Display` text is shown to the user.
#[derive(Debug, Clone, PartialEq)]
pub enum LinkError {
    /// The PC could not be reached (off, app closed, other WiFi).
    Offline(String),
    /// The PC no longer knows this phone (removed by the owner): pair again.
    NotPaired(String),
    /// Something answered but it was not the paired PC.
    WrongPc,
    /// The PC refused the request.
    Refused(String),
}

impl std::fmt::Display for LinkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LinkError::Offline(m) => write!(f, "PC_OFFLINE: {m}"),
            LinkError::NotPaired(m) => write!(f, "NOT_PAIRED: {m}"),
            LinkError::WrongPc => write!(f, "WRONG_PC: A different computer answered. Pair this phone again from the shop PC."),
            LinkError::Refused(m) => write!(f, "{m}"),
        }
    }
}

enum Attempt {
    Done(http::Response),
    /// Could not connect at all.
    Unreachable(String),
    /// Connected, but the certificate was not the paired PC's.
    Wrong,
}

fn is_wrong_pc(e: &io::Error) -> bool {
    e.get_ref()
        .and_then(|inner| inner.downcast_ref::<rustls::Error>())
        .map_or(false, |r| matches!(r, rustls::Error::General(m) if m == "NEXTPOS_WRONG_PC"))
}

fn attempt(addr: SocketAddr, fingerprint: &str, path: &str, headers: &[(&str, &str)], body: &[u8]) -> Attempt {
    let tcp = match TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
        Ok(t) => t,
        Err(e) => return Attempt::Unreachable(e.to_string()),
    };
    let _ = tcp.set_read_timeout(Some(IO_TIMEOUT));
    let _ = tcp.set_write_timeout(Some(IO_TIMEOUT));
    let _ = tcp.set_nodelay(true);
    let cfg = match tls::pinned_client_config(fingerprint) {
        Ok(c) => c,
        Err(e) => return Attempt::Unreachable(e),
    };
    let conn = match ClientConnection::new(cfg, ServerName::try_from("nextpos.local").expect("static name").to_owned()) {
        Ok(c) => c,
        Err(e) => return Attempt::Unreachable(e.to_string()),
    };
    let mut stream = StreamOwned::new(conn, tcp);
    let res = http::write_request(&mut stream, path, headers, body).and_then(|_| http::read_response(&mut stream));
    match res {
        Ok(r) => Attempt::Done(r),
        Err(e) if is_wrong_pc(&e) => Attempt::Wrong,
        Err(e) => Attempt::Unreachable(e.to_string()),
    }
}

fn addr_of(host: &str, port: u16) -> Option<SocketAddr> {
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Some(SocketAddr::new(ip, port));
    }
    (host, port).to_socket_addrs().ok()?.next()
}

/// Send one request, trying every known address, then discovery.
/// On success the working address moves to the front of `hosts`.
fn send(p: &mut Pairing, path: &str, headers: &[(&str, &str)], body: &[u8]) -> Result<(http::Response, bool), LinkError> {
    let mut wrong = false;
    let mut last_err = String::from("no address known");
    for round in 0..2 {
        if round == 1 {
            let found = crate::discovery::discover(&p.fingerprint, p.discovery_port, &p.hosts, DISCOVERY_WAIT);
            if found.is_empty() {
                break;
            }
            for (ip, port) in found.into_iter().rev() {
                let s = ip.to_string();
                p.hosts.retain(|h| h != &s);
                p.hosts.insert(0, s);
                p.port = port;
            }
        }
        let hosts = p.hosts.clone();
        for (i, h) in hosts.iter().enumerate() {
            let Some(addr) = addr_of(h, p.port) else { continue };
            match attempt(addr, &p.fingerprint, path, headers, body) {
                Attempt::Done(r) => {
                    let moved = i != 0 || round == 1;
                    if i != 0 {
                        let host = p.hosts.remove(i);
                        p.hosts.insert(0, host);
                    }
                    p.hosts.truncate(6);
                    return Ok((r, moved));
                }
                Attempt::Unreachable(e) => last_err = e,
                Attempt::Wrong => wrong = true,
            }
        }
    }
    if wrong {
        return Err(LinkError::WrongPc);
    }
    Err(LinkError::Offline(format!(
        "Cannot reach the shop PC. Check that the phone is on the shop WiFi and Next POS is open on the PC. ({last_err})"
    )))
}

fn error_text(body: &[u8]) -> String {
    serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| "The PC refused the request.".into())
}

/// Pair this phone using the text read from the PC's QR code.
pub fn pair(qr_text: &str, device_name: &str) -> Result<Pairing, LinkError> {
    let qr = PairingQr::parse(qr_text).map_err(LinkError::Refused)?;
    let mut p = Pairing {
        store_name: qr.store.clone(),
        hosts: qr.hosts.clone(),
        port: qr.port,
        fingerprint: qr.fp.to_ascii_lowercase(),
        device_id: String::new(),
        secret: String::new(),
        discovery_port: crate::DISCOVERY_PORT,
    };
    let name: String = device_name.trim().chars().take(40).collect();
    let body = serde_json::to_vec(&PairRequest { code: qr.code, device_name: if name.is_empty() { "Android phone".into() } else { name } }).unwrap_or_default();
    let (res, _) = send(&mut p, "/v1/pair", &[], &body)?;
    if res.status != 200 {
        return Err(LinkError::Refused(error_text(&res.body)));
    }
    let ok: PairResponse = serde_json::from_slice(&res.body).map_err(|_| LinkError::Refused("The PC sent an answer this app cannot read. Update the app.".into()))?;
    p.device_id = ok.device_id;
    p.secret = ok.secret;
    p.store_name = ok.store_name;
    Ok(p)
}

impl Pairing {
    fn authed(&mut self, path: &str, body: &[u8]) -> Result<(Value, bool), LinkError> {
        let (id, secret) = (self.device_id.clone(), self.secret.clone());
        let (res, moved) = send(self, path, &[(H_DEVICE_ID, &id), (H_DEVICE_SECRET, &secret)], body)?;
        match res.status {
            200 => Ok((serde_json::from_slice(&res.body).unwrap_or(Value::Null), moved)),
            401 => Err(LinkError::NotPaired(error_text(&res.body))),
            _ => Err(LinkError::Refused(error_text(&res.body))),
        }
    }

    /// Run a Next POS command on the PC. Returns (result, address changed).
    /// A business-rule refusal (e.g. price below wholesale) is `Refused`.
    pub fn rpc(&mut self, cmd: &str, args: Value) -> Result<(Value, bool), LinkError> {
        let body = serde_json::to_vec(&RpcRequest { cmd: cmd.into(), args }).unwrap_or_default();
        let (v, moved) = self.authed("/v1/rpc", &body)?;
        if v.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok((v.get("data").cloned().unwrap_or(Value::Null), moved))
        } else {
            Err(LinkError::Refused(v.get("error").and_then(Value::as_str).unwrap_or("The PC refused the request.").to_string()))
        }
    }

    /// Send a scanned barcode to the screen open on the PC.
    pub fn scan(&mut self, code: &str) -> Result<(Value, bool), LinkError> {
        let body = serde_json::to_vec(&ScanRequest { code: code.into() }).unwrap_or_default();
        self.authed("/v1/scan", &body)
    }

    /// Check the link; returns the PC's short status.
    pub fn ping(&mut self) -> Result<(Value, bool), LinkError> {
        self.authed("/v1/ping", b"{}")
    }
}
