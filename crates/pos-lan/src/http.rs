//! Just enough HTTP/1.1 for the shop link: one JSON request per connection.

use std::collections::HashMap;
use std::io::{Read, Write};

const MAX_HEAD: usize = 16 * 1024;
/// Largest body either side accepts (a big purchase invoice is far smaller).
pub const MAX_BODY: usize = 4 * 1024 * 1024;

#[derive(Debug)]
pub struct Request {
    pub method: String,
    pub path: String,
    /// Header names in lowercase.
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

fn read_head<R: Read>(r: &mut R) -> std::io::Result<(Vec<u8>, Vec<u8>)> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 2048];
    loop {
        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let rest = buf.split_off(pos + 4);
            buf.truncate(pos);
            return Ok((buf, rest));
        }
        if buf.len() > MAX_HEAD {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "header too large"));
        }
        let n = r.read(&mut chunk)?;
        if n == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "connection closed"));
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}

fn parse_headers<'a>(lines: impl Iterator<Item = &'a str>) -> HashMap<String, String> {
    lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect()
}

fn read_body<R: Read>(r: &mut R, headers: &HashMap<String, String>, mut already: Vec<u8>) -> std::io::Result<Vec<u8>> {
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "body too large"));
    }
    if already.len() > len {
        already.truncate(len);
    }
    let mut body = already;
    let start = body.len();
    body.resize(len, 0);
    r.read_exact(&mut body[start..])?;
    Ok(body)
}

pub fn read_request<R: Read>(r: &mut R) -> std::io::Result<Request> {
    let (head, rest) = read_head(r)?;
    let text = String::from_utf8_lossy(&head);
    let mut lines = text.split("\r\n");
    let first = lines.next().unwrap_or_default();
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    let headers = parse_headers(lines);
    let body = read_body(r, &headers, rest)?;
    Ok(Request { method, path, headers, body })
}

pub fn write_response<W: Write>(w: &mut W, status: u16, body: &[u8]) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        body.len()
    );
    w.write_all(head.as_bytes())?;
    w.write_all(body)?;
    w.flush()
}

pub fn write_request<W: Write>(w: &mut W, path: &str, headers: &[(&str, &str)], body: &[u8]) -> std::io::Result<()> {
    let mut head = format!("POST {path} HTTP/1.1\r\nHost: nextpos.local\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n", body.len());
    for (k, v) in headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    w.write_all(head.as_bytes())?;
    w.write_all(body)?;
    w.flush()
}

pub fn read_response<R: Read>(r: &mut R) -> std::io::Result<Response> {
    let (head, rest) = read_head(r)?;
    let text = String::from_utf8_lossy(&head);
    let mut lines = text.split("\r\n");
    let status = lines.next().unwrap_or_default().split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let headers = parse_headers(lines);
    let body = read_body(r, &headers, rest)?;
    Ok(Response { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_and_response_round_trip() {
        let mut wire = Vec::new();
        write_request(&mut wire, "/v1/rpc", &[("X-NextPOS-Device", "d1")], br#"{"cmd":"x"}"#).unwrap();
        let req = read_request(&mut wire.as_slice()).unwrap();
        assert_eq!((req.method.as_str(), req.path.as_str()), ("POST", "/v1/rpc"));
        assert_eq!(req.headers["x-nextpos-device"], "d1");
        assert_eq!(req.body, br#"{"cmd":"x"}"#);

        let mut wire = Vec::new();
        write_response(&mut wire, 401, b"{}").unwrap();
        let res = read_response(&mut wire.as_slice()).unwrap();
        assert_eq!((res.status, res.body.as_slice()), (401, b"{}".as_slice()));
    }

    #[test]
    fn rejects_huge_body() {
        let wire = format!("POST / HTTP/1.1\r\nContent-Length: {}\r\n\r\n", MAX_BODY + 1);
        assert!(read_request(&mut wire.as_bytes()).is_err());
    }
}
