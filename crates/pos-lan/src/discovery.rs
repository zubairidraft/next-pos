//! Finding the shop PC on the WiFi when its address has changed.
//! The phone shouts on UDP; the PC answers with its port and certificate
//! fingerprint. The phone only uses an answer whose fingerprint it already
//! trusts, and then still checks the certificate when it connects.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const ASK: &str = "NEXTPOS-DISCOVER/1";
const ANSWER: &str = "NEXTPOS-HERE/1";

/// PC side: answer discovery broadcasts until `stop` is set.
pub fn run_responder(socket: UdpSocket, http_port: u16, fingerprint: String, stop: Arc<AtomicBool>) {
    let _ = socket.set_read_timeout(Some(Duration::from_millis(500)));
    let reply = format!("{ANSWER} {http_port} {fingerprint}");
    let mut buf = [0u8; 256];
    while !stop.load(Ordering::Relaxed) {
        if let Ok((n, from)) = socket.recv_from(&mut buf) {
            if &buf[..n] == ASK.as_bytes() {
                let _ = socket.send_to(reply.as_bytes(), from);
            }
        }
    }
}

/// Phone side: the addresses of PCs answering with this fingerprint.
/// `hints` are earlier known addresses; their /24 broadcast is tried too.
pub fn discover(fingerprint: &str, port: u16, hints: &[String], wait: Duration) -> Vec<(IpAddr, u16)> {
    let Ok(socket) = UdpSocket::bind(SocketAddr::from(([0, 0, 0, 0], 0))) else { return vec![] };
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(Duration::from_millis(200)));
    let mut targets: Vec<SocketAddr> = vec![SocketAddr::from((Ipv4Addr::BROADCAST, port))];
    for h in hints {
        if let Ok(IpAddr::V4(ip)) = h.parse::<IpAddr>() {
            let o = ip.octets();
            targets.push(SocketAddr::from((Ipv4Addr::new(o[0], o[1], o[2], 255), port)));
        }
    }
    let mut found = Vec::new();
    let mut buf = [0u8; 256];
    let start = Instant::now();
    let mut sent_at = None::<Instant>;
    while start.elapsed() < wait {
        if sent_at.map_or(true, |t| t.elapsed() > Duration::from_millis(600)) {
            for t in &targets {
                let _ = socket.send_to(ASK.as_bytes(), t);
            }
            sent_at = Some(Instant::now());
        }
        if let Ok((n, from)) = socket.recv_from(&mut buf) {
            let text = String::from_utf8_lossy(&buf[..n]);
            let mut parts = text.split_whitespace();
            if parts.next() != Some(ANSWER) {
                continue;
            }
            let (Some(p), Some(fp)) = (parts.next().and_then(|p| p.parse::<u16>().ok()), parts.next()) else { continue };
            if crate::ct_eq(&fp.to_ascii_lowercase(), &fingerprint.to_ascii_lowercase()) && !found.contains(&(from.ip(), p)) {
                found.push((from.ip(), p));
                break;
            }
        }
    }
    found
}
