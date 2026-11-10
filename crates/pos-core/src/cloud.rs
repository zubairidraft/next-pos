//! Next POS Cloud: the shop PC keeps a read-only copy of its data on the
//! owner's cloud account, so the owner and managers can see reports of all
//! their shops from anywhere.
//!
//! How it works (the PC never waits for the internet):
//! * Every change to a synced table is noted in `cloud_changes` by a database
//!   trigger (V12), in the same transaction as the sale / purchase itself.
//! * A background task in the desktop shell asks for the next batch, sends it
//!   and, only when the server said OK, removes those notes (`cloud_ack`).
//!   No internet = the notes wait; nothing in the shop slows down.
//! * The server keeps one copy of each row per shop. A sale and its later
//!   return are different rows, an edited receipt is the same row with new
//!   values, a deleted row is deleted there too. Sending a row twice is harmless.
//! * Secrets (passwords, PINs, phone keys, app settings) are never sent.
//!
//! The shop is linked once with a one-time code from the admin website.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{now, set_setting, setting, PosApp};
use crate::auth::Permission;
use crate::domain::audit::AuditRepo;
use crate::error::{PosError, Result};

#[path = "cloud_tables.rs"]
mod tables;
pub(crate) use tables::SYNC_TABLES;

/// Link codes start with this (they are shown on the admin website).
pub const LINK_PREFIX: &str = "NPC1.";
/// Rows per request.
pub const BATCH_ROWS: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct CloudStatus {
    pub linked: bool,
    pub shop_id: Option<String>,
    pub server: Option<String>,
    pub linked_at: Option<String>,
    pub last_synced_at: Option<String>,
    /// Last problem while sending (None when the last try worked).
    pub last_error: Option<String>,
    /// Changes waiting to be sent.
    pub pending: i64,
    pub backup_password_set: bool,
    pub last_backup_at: Option<String>,
    pub last_backup_error: Option<String>,
}

/// What the link code says: where the cloud is and the one-time code.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CloudLinkTarget {
    pub url: String,
    pub anon_key: String,
    pub code: String,
}

/// One request to the cloud.
#[derive(Debug, Clone)]
pub struct CloudRowBatch {
    pub url: String,
    pub anon_key: String,
    pub shop_id: String,
    pub shop_key: String,
    /// `{"t": table, "k": key, "op": "u"|"d", "d": row}`
    pub rows: Vec<Value>,
    /// Acknowledge up to here after the server accepted the batch.
    pub upto_seq: i64,
    /// More changes are waiting after this batch.
    pub more: bool,
}

/// What the shell needs to upload today's encrypted backup.
#[derive(Debug, Clone)]
pub struct CloudBackupPlan {
    pub url: String,
    pub anon_key: String,
    pub shop_id: String,
    pub shop_key: String,
    pub password: String,
}

fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let s = s.trim().trim_end_matches('=');
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).ok()
}

/// Reads a link code (`NPC1.` + base64url JSON `{u, a, c}`).
pub fn parse_link_code(code: &str) -> Result<CloudLinkTarget> {
    let bad = || PosError::Validation("This is not a Next POS Cloud link code. Copy it again from the admin website.".into());
    let body = code.trim().strip_prefix(LINK_PREFIX).ok_or_else(bad)?;
    let raw = b64url_decode(body).ok_or_else(bad)?;
    let v: Value = serde_json::from_slice(&raw).map_err(|_| bad())?;
    let url = v.get("u").and_then(Value::as_str).ok_or_else(bad)?.trim().trim_end_matches('/').to_string();
    let anon_key = v.get("a").and_then(Value::as_str).ok_or_else(bad)?.trim().to_string();
    let code = v.get("c").and_then(Value::as_str).ok_or_else(bad)?.trim().to_string();
    let local = url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
    if !(url.starts_with("https://") || local) || url.contains(' ') || anon_key.is_empty() || code.is_empty() {
        return Err(bad());
    }
    Ok(CloudLinkTarget { url, anon_key, code })
}

impl PosApp {
    fn cloud_flag(&self, key: &str) -> Result<Option<String>> {
        setting(self.conn()?, key)
    }

    /// The cloud card on the Backup screen (Owner only).
    pub fn cloud_status(&self) -> Result<CloudStatus> {
        self.require(Permission::SettingsManage)?;
        self.cloud_status_unchecked()
    }

    pub(crate) fn cloud_status_unchecked(&self) -> Result<CloudStatus> {
        let conn = self.conn()?;
        let pending: i64 = conn.query_row("SELECT COUNT(*) FROM cloud_changes", [], |r| r.get(0))?;
        let get = |k: &str| setting(conn, k);
        let none_if_empty = |v: Option<String>| v.filter(|s| !s.is_empty());
        Ok(CloudStatus {
            linked: get("cloud.enabled")?.as_deref() == Some("1"),
            shop_id: none_if_empty(get("cloud.shop_id")?),
            server: none_if_empty(get("cloud.url")?),
            linked_at: none_if_empty(get("cloud.linked_at")?),
            last_synced_at: none_if_empty(get("cloud.last_synced_at")?),
            last_error: none_if_empty(get("cloud.last_error")?),
            pending,
            backup_password_set: get("cloud.backup_password")?.map(|p| !p.is_empty()).unwrap_or(false),
            last_backup_at: none_if_empty(get("cloud.last_backup_at")?),
            last_backup_error: none_if_empty(get("cloud.last_backup_error")?),
        })
    }

    /// Step 1 of linking: read the code (the shell then asks the server).
    pub fn cloud_read_link_code(&self, code: &str) -> Result<CloudLinkTarget> {
        self.require(Permission::SettingsManage)?;
        parse_link_code(code)
    }

    /// Step 2 of linking: the server gave this shop its id and secret key.
    /// Turns sync on and queues everything for the first upload.
    pub fn cloud_finish_link(&self, target: &CloudLinkTarget, shop_id: &str, shop_key: &str) -> Result<CloudStatus> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        if shop_id.trim().is_empty() || shop_key.trim().is_empty() {
            return Err(PosError::Validation("The cloud did not return a shop key".into()));
        }
        let conn = self.conn()?;
        set_setting(conn, "cloud.url", &target.url)?;
        set_setting(conn, "cloud.api_key", &target.anon_key)?;
        set_setting(conn, "cloud.shop_id", shop_id.trim())?;
        set_setting(conn, "cloud.shop_key", shop_key.trim())?;
        set_setting(conn, "cloud.linked_at", &now().to_rfc3339())?;
        set_setting(conn, "cloud.last_error", "")?;
        set_setting(conn, "cloud.enabled", "1")?;
        self.cloud_queue_everything()?;
        AuditRepo::write(self.conn()?, Some(&uid), "cloud_linked", "settings", None, None, Some(&format!("{{\"shop_id\":\"{}\"}}", shop_id.trim())))?;
        self.cloud_status_unchecked()
    }

    /// Stops sending. The copy already on the cloud stays there.
    pub fn cloud_unlink(&self) -> Result<CloudStatus> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        let conn = self.conn()?;
        set_setting(conn, "cloud.enabled", "0")?;
        for k in ["cloud.shop_key", "cloud.shop_id", "cloud.linked_at", "cloud.last_error", "cloud.backup_password", "cloud.last_backup_error"] {
            set_setting(conn, k, "")?;
        }
        conn.execute("DELETE FROM cloud_changes", [])?;
        AuditRepo::write(conn, Some(&uid), "cloud_unlinked", "settings", None, None, None)?;
        self.cloud_status_unchecked()
    }

    /// Sends the whole shop again (fixes a cloud copy that got out of step).
    pub fn cloud_resend_all(&self) -> Result<CloudStatus> {
        self.require(Permission::SettingsManage)?;
        if self.cloud_flag("cloud.enabled")?.as_deref() != Some("1") {
            return Err(PosError::BusinessRule("Link this shop to Next POS Cloud first".into()));
        }
        self.cloud_queue_everything()?;
        self.cloud_status_unchecked()
    }

    fn cloud_queue_everything(&self) -> Result<()> {
        let tx = self.conn()?.unchecked_transaction()?;
        tx.execute("DELETE FROM cloud_changes", [])?;
        for (t, pk, _) in SYNC_TABLES {
            tx.execute(&format!("INSERT INTO cloud_changes (tbl, pk, op) SELECT '{t}', {pk}, 'u' FROM {t}"), [])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// The next rows to send, or None when not linked / nothing waits.
    /// Used by the background task, so it needs no logged-in user.
    pub fn cloud_next_batch(&self, max_rows: usize) -> Result<Option<CloudRowBatch>> {
        let conn = self.conn()?;
        if setting(conn, "cloud.enabled")?.as_deref() != Some("1") {
            return Ok(None);
        }
        let get = |k: &str| -> Result<String> { Ok(setting(conn, k)?.unwrap_or_default()) };
        let (url, anon_key, shop_id, shop_key) = (get("cloud.url")?, get("cloud.api_key")?, get("cloud.shop_id")?, get("cloud.shop_key")?);
        if url.is_empty() || anon_key.is_empty() || shop_id.is_empty() || shop_key.is_empty() {
            return Ok(None);
        }
        let max_rows = max_rows.clamp(1, 5000);
        let changes: Vec<(i64, String, String, String)> = conn
            .prepare("SELECT seq, tbl, pk, op FROM cloud_changes ORDER BY seq LIMIT ?1")?
            .query_map(params![max_rows as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        if changes.is_empty() {
            return Ok(None);
        }
        let upto_seq = changes.last().map(|c| c.0).unwrap_or(0);
        let more: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM cloud_changes WHERE seq > ?1)", params![upto_seq], |r| r.get(0))?;
        // The last note for a row wins (an insert then a delete = a delete).
        let mut order: Vec<(String, String)> = Vec::new();
        let mut last: std::collections::HashMap<(String, String), String> = std::collections::HashMap::new();
        for (_, t, k, op) in changes {
            let key = (t, k);
            if !last.contains_key(&key) {
                order.push(key.clone());
            }
            last.insert(key, op);
        }
        let mut rows = Vec::with_capacity(order.len());
        for key in order {
            let op = &last[&key];
            let (t, k) = key;
            let Some((_, pk, cols)) = SYNC_TABLES.iter().find(|(name, _, _)| *name == t) else { continue };
            let data: Option<String> = if op == "u" {
                let obj = cols.iter().map(|c| format!("'{c}', {c}")).collect::<Vec<_>>().join(", ");
                conn.query_row(&format!("SELECT json_object({obj}) FROM {t} WHERE {pk} = ?1"), params![k], |r| r.get(0)).optional()?
            } else {
                None
            };
            match data {
                Some(json) => rows.push(serde_json::json!({ "t": t, "k": k, "op": "u", "d": serde_json::from_str::<Value>(&json).unwrap_or(Value::Null) })),
                // Deleted (or gone since the note was made).
                None => rows.push(serde_json::json!({ "t": t, "k": k, "op": "d" })),
            }
        }
        Ok(Some(CloudRowBatch { url, anon_key, shop_id, shop_key, rows, upto_seq, more }))
    }

    /// The server stored the batch: forget the notes up to `upto_seq`.
    pub fn cloud_ack(&self, upto_seq: i64) -> Result<()> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM cloud_changes WHERE seq <= ?1", params![upto_seq])?;
        set_setting(conn, "cloud.last_synced_at", &now().to_rfc3339())?;
        set_setting(conn, "cloud.last_error", "")?;
        Ok(())
    }

    /// Remembers why sending failed (shown on the Backup screen).
    pub fn cloud_note_error(&self, message: &str) -> Result<()> {
        let msg: String = message.chars().take(300).collect();
        set_setting(self.conn()?, "cloud.last_error", &msg)
    }

    /// The password the daily cloud backup is locked with (Owner keeps it safe).
    pub fn cloud_set_backup_password(&self, password: &str) -> Result<CloudStatus> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        let p = password.trim();
        if !p.is_empty() && p.chars().count() < 8 {
            return Err(PosError::Validation("Use at least 8 characters for the backup password".into()));
        }
        let conn = self.conn()?;
        set_setting(conn, "cloud.backup_password", p)?;
        set_setting(conn, "cloud.last_backup_error", "")?;
        AuditRepo::write(conn, Some(&uid), if p.is_empty() { "cloud_backup_off" } else { "cloud_backup_on" }, "settings", None, None, None)?;
        self.cloud_status_unchecked()
    }

    /// A backup is due when linked, a password is set and the last upload is
    /// older than 20 hours (or `force`).
    pub fn cloud_backup_plan(&self, force: bool) -> Result<Option<CloudBackupPlan>> {
        let conn = self.conn()?;
        if setting(conn, "cloud.enabled")?.as_deref() != Some("1") {
            return Ok(None);
        }
        let get = |k: &str| -> Result<String> { Ok(setting(conn, k)?.unwrap_or_default()) };
        let password = get("cloud.backup_password")?;
        if password.is_empty() {
            return Ok(None);
        }
        if !force {
            if let Ok(last) = chrono::DateTime::parse_from_rfc3339(&get("cloud.last_backup_at")?) {
                if now().signed_duration_since(last.with_timezone(&chrono::Utc)) < chrono::Duration::hours(20) {
                    return Ok(None);
                }
            }
        }
        let (url, anon_key, shop_id, shop_key) = (get("cloud.url")?, get("cloud.api_key")?, get("cloud.shop_id")?, get("cloud.shop_key")?);
        if url.is_empty() || shop_key.is_empty() {
            return Ok(None);
        }
        Ok(Some(CloudBackupPlan { url, anon_key, shop_id, shop_key, password }))
    }

    /// Writes today's encrypted backup for the cloud upload (background task, no login needed).
    pub fn cloud_write_backup(&self, file: &std::path::Path, password: &str) -> Result<()> {
        crate::backup::CryptoBackupService::export_backup(self.conn()?, file, password)?;
        Ok(())
    }

    pub fn cloud_backup_result(&self, error: Option<&str>) -> Result<()> {
        let conn = self.conn()?;
        match error {
            None => {
                set_setting(conn, "cloud.last_backup_at", &now().to_rfc3339())?;
                set_setting(conn, "cloud.last_backup_error", "")
            }
            Some(e) => set_setting(conn, "cloud.last_backup_error", &e.chars().take(300).collect::<String>()),
        }
    }

    pub(crate) fn dispatch_cloud(&mut self, cmd: &str, a: &Value) -> Option<Result<Value>> {
        use super::{arg, json};
        let r = match cmd {
            "cloud_status" => self.cloud_status().and_then(json),
            "cloud_unlink" => self.cloud_unlink().and_then(json),
            "cloud_resend_all" => self.cloud_resend_all().and_then(json),
            "cloud_set_backup_password" => arg::<String>(a, "password").and_then(|p| self.cloud_set_backup_password(&p)).and_then(json),
            // Browser test mode only: the test server plays the desktop shell.
            #[cfg(feature = "dev-server")]
            "cloud_dev_link" => (|| {
                let target = CloudLinkTarget { url: arg(a, "url")?, anon_key: arg(a, "anon_key")?, code: "dev".into() };
                json(self.cloud_finish_link(&target, &arg::<String>(a, "shop_id")?, &arg::<String>(a, "shop_key")?)?)
            })(),
            #[cfg(feature = "dev-server")]
            "cloud_dev_batch" => (|| {
                let b = self.cloud_next_batch(arg::<Option<usize>>(a, "max")?.unwrap_or(BATCH_ROWS))?;
                json(b.map(|b| serde_json::json!({ "shop_id": b.shop_id, "shop_key": b.shop_key, "rows": b.rows, "upto_seq": b.upto_seq, "more": b.more })))
            })(),
            #[cfg(feature = "dev-server")]
            "cloud_dev_ack" => arg::<i64>(a, "upto_seq").and_then(|s| self.cloud_ack(s)).and_then(|_| json(true)),
            _ => return None,
        };
        Some(r)
    }
}
