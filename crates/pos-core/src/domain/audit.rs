//! Audit trail and manager-approval helpers used inside posting transactions.

use rusqlite::{params, Connection};
use ulid::Ulid;

use crate::error::{PosError, Result};

pub struct AuditRepo;

impl AuditRepo {
    /// Writes one immutable audit row. Call it inside the same transaction as the
    /// change it describes, so the audit row and the change commit or fail together.
    pub fn write(
        conn: &Connection,
        actor: Option<&str>,
        action: &str,
        entity: &str,
        entity_id: Option<&str>,
        reason: Option<&str>,
        details_json: Option<&str>,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO audit_log (id, actor, action, entity, entity_id, reason, details_json, occurred_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Ulid::new().to_string(),
                actor.unwrap_or("system"),
                action,
                entity,
                entity_id,
                reason,
                details_json,
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to write audit log: {}", e)))?;
        Ok(())
    }

    /// Verifies that `user_id` is an active user holding the Owner or Manager role.
    /// Used for price overrides, credit-limit overrides and other approvals.
    pub fn require_manager(conn: &Connection, user_id: &str, what: &str) -> Result<()> {
        let ok: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM users u
                 JOIN user_roles ur ON ur.user_id = u.id
                 JOIN roles r ON r.id = ur.role_id
                 WHERE u.id = ?1 AND u.active = 1 AND lower(r.name) IN ('owner', 'manager')",
                params![user_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if ok == 0 {
            return Err(PosError::BusinessRule(format!(
                "{} requires approval by an active Owner or Manager",
                what
            )));
        }
        Ok(())
    }
}
