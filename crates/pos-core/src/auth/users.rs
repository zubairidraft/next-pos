//! Users, login (password or quick PIN switch), lockout and permission checks.

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::auth::hash::{hash_password, hash_pin, verify_password, verify_pin};
use crate::auth::session::{Permission, Role, UserSession};
use crate::db::key::{fill_random, hex_encode};
use crate::domain::audit::AuditRepo;
use crate::error::{PosError, Result};

/// Wrong attempts allowed before the account is locked.
pub const MAX_FAILED_ATTEMPTS: i64 = 5;
/// How long an account stays locked after too many wrong attempts.
pub const LOCKOUT_MINUTES: i64 = 5;
/// How long a login session lasts before the user must log in again.
pub const SESSION_HOURS: i64 = 12;
pub const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSummary {
    pub id: String,
    pub username: String,
    pub role: Role,
    pub active: bool,
    pub has_pin: bool,
}

pub struct UserRepo;

fn role_of(conn: &Connection, user_id: &str) -> Result<Role> {
    let names: Vec<String> = conn
        .prepare(
            "SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?1",
        )?
        .query_map(params![user_id], |r| r.get(0))?
        .collect::<std::result::Result<_, _>>()?;
    // Highest role wins if a user has several.
    for wanted in [Role::Owner, Role::Manager, Role::StockKeeper, Role::Cashier] {
        if names.iter().any(|n| Role::from_str(n) == Some(wanted)) {
            return Ok(wanted);
        }
    }
    Err(PosError::BusinessRule("User has no role assigned".into()))
}

fn new_session(user_id: &str, username: &str, role: Role, now: &DateTime<Utc>) -> UserSession {
    let mut tok = [0u8; 32];
    fill_random(&mut tok);
    UserSession {
        user_id: user_id.to_string(),
        username: username.to_string(),
        role,
        session_token: hex_encode(&tok),
        opened_at: *now,
        expires_at: *now + Duration::hours(SESSION_HOURS),
    }
}

impl UserRepo {
    /// True when no user exists yet: the app must run the first-run wizard,
    /// which creates the Owner account.
    pub fn needs_first_owner(conn: &Connection) -> Result<bool> {
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
        Ok(n == 0)
    }

    /// Creates a user. The very first user must be an Owner; after that only an
    /// Owner (`created_by`) may create users.
    pub fn create_user(
        conn: &Connection,
        username: &str,
        password: &str,
        pin: Option<&str>,
        role: Role,
        created_by: Option<&str>,
    ) -> Result<UserSummary> {
        let username = username.trim();
        if username.len() < 3 || username.len() > 32 {
            return Err(PosError::Validation("Username must be 3 to 32 characters".into()));
        }
        if password.chars().count() < MIN_PASSWORD_LEN {
            return Err(PosError::Validation(format!(
                "Password must be at least {} characters",
                MIN_PASSWORD_LEN
            )));
        }
        if Self::needs_first_owner(conn)? {
            if role != Role::Owner {
                return Err(PosError::BusinessRule("The first account must be the Owner".into()));
            }
        } else {
            let creator = created_by
                .ok_or_else(|| PosError::BusinessRule("Only the Owner can create users".into()))?;
            if role_of(conn, creator)? != Role::Owner {
                return Err(PosError::BusinessRule("Only the Owner can create users".into()));
            }
        }
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE lower(username) = lower(?1)",
            params![username],
            |r| r.get(0),
        )?;
        if exists > 0 {
            return Err(PosError::Validation("That username is already taken".into()));
        }

        let id = Ulid::new().to_string();
        let now = Utc::now().to_rfc3339();
        let pw_hash = hash_password(password)?;
        let pin_hash = match pin {
            Some(p) => Some(hash_pin(p)?),
            None => None,
        };
        conn.execute(
            "INSERT INTO users (id, username, password_hash, pin_hash, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params![id, username, pw_hash, pin_hash, now],
        )?;
        conn.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?1, ?2)",
            params![id, role.as_str()],
        )?;
        AuditRepo::write(conn, created_by, "user_created", "user", Some(&id), None,
            Some(&format!("{{\"username\":\"{}\",\"role\":\"{}\"}}", username, role.as_str())))?;
        Ok(UserSummary { id, username: username.to_string(), role, active: true, has_pin: pin.is_some() })
    }

    /// Active users for the quick-switch screen (no hashes returned).
    pub fn list_users(conn: &Connection) -> Result<Vec<UserSummary>> {
        let rows: Vec<(String, String, bool, bool)> = conn
            .prepare("SELECT id, username, active, pin_hash IS NOT NULL FROM users ORDER BY username")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? == 1, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|(id, username, active, has_pin)| {
                let role = role_of(conn, &id)?;
                Ok(UserSummary { id, username, role, active, has_pin })
            })
            .collect()
    }

    /// Full login with username and password.
    pub fn login_password(conn: &Connection, username: &str, password: &str, now: &DateTime<Utc>) -> Result<UserSession> {
        let row: Option<(String, String, String)> = conn
            .query_row(
                "SELECT id, username, password_hash FROM users WHERE lower(username) = lower(?1) AND active = 1",
                params![username.trim()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((id, uname, hash)) = row else {
            AuditRepo::write(conn, None, "login_failed", "user", None, Some("unknown username"), None)?;
            return Err(PosError::Validation("Invalid username or password".into()));
        };
        Self::check_attempt(conn, &id, &uname, now, || verify_password(password, &hash))
    }

    /// Quick cashier switch: pick the user on screen, then enter their PIN.
    pub fn login_pin(conn: &Connection, user_id: &str, pin: &str, now: &DateTime<Utc>) -> Result<UserSession> {
        let row: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT username, pin_hash FROM users WHERE id = ?1 AND active = 1",
                params![user_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((uname, Some(hash))) = row else {
            return Err(PosError::Validation("This user cannot log in with a PIN".into()));
        };
        Self::check_attempt(conn, user_id, &uname, now, || verify_pin(pin, &hash))
    }

    fn check_attempt(
        conn: &Connection,
        user_id: &str,
        username: &str,
        now: &DateTime<Utc>,
        verify: impl FnOnce() -> Result<bool>,
    ) -> Result<UserSession> {
        let (failed, locked_until): (i64, Option<String>) = conn.query_row(
            "SELECT failed_attempts, locked_until FROM users WHERE id = ?1",
            params![user_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        if let Some(until) = locked_until
            .as_deref()
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc))
        {
            if *now < until {
                let mins = (until - *now).num_minutes() + 1;
                return Err(PosError::BusinessRule(format!(
                    "Too many wrong attempts. Try again in {} minute(s) or ask the Owner",
                    mins
                )));
            }
        }

        if verify()? {
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?2 WHERE id = ?1",
                params![user_id, now.to_rfc3339()],
            )?;
            AuditRepo::write(conn, Some(user_id), "login_success", "user", Some(user_id), None, None)?;
            let role = role_of(conn, user_id)?;
            return Ok(new_session(user_id, username, role, now));
        }

        let failed = failed + 1;
        if failed >= MAX_FAILED_ATTEMPTS {
            let until = *now + Duration::minutes(LOCKOUT_MINUTES);
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = ?2 WHERE id = ?1",
                params![user_id, until.to_rfc3339()],
            )?;
            AuditRepo::write(conn, Some(user_id), "login_locked", "user", Some(user_id), None, None)?;
            return Err(PosError::BusinessRule(format!(
                "Too many wrong attempts. Locked for {} minutes",
                LOCKOUT_MINUTES
            )));
        }
        conn.execute("UPDATE users SET failed_attempts = ?2 WHERE id = ?1", params![user_id, failed])?;
        AuditRepo::write(conn, Some(user_id), "login_failed", "user", Some(user_id), None, None)?;
        Err(PosError::Validation(format!(
            "Wrong password or PIN ({} attempt(s) left)",
            MAX_FAILED_ATTEMPTS - failed
        )))
    }

    /// Sets or changes a user's PIN. Users may change their own; the Owner may change anyone's.
    pub fn set_pin(conn: &Connection, actor_id: &str, user_id: &str, new_pin: &str) -> Result<()> {
        if actor_id != user_id && role_of(conn, actor_id)? != Role::Owner {
            return Err(PosError::BusinessRule("Only the Owner can change another user's PIN".into()));
        }
        let h = hash_pin(new_pin)?;
        conn.execute(
            "UPDATE users SET pin_hash = ?2, updated_at = ?3 WHERE id = ?1",
            params![user_id, h, Utc::now().to_rfc3339()],
        )?;
        AuditRepo::write(conn, Some(actor_id), "pin_changed", "user", Some(user_id), None, None)?;
        Ok(())
    }

    /// Fails unless `session` is still valid, the user is still active and their role has `perm`.
    pub fn require_permission(conn: &Connection, session: &UserSession, perm: Permission, now: &DateTime<Utc>) -> Result<()> {
        if *now > session.expires_at {
            return Err(PosError::BusinessRule("Session expired; please log in again".into()));
        }
        let active: Option<i64> = conn
            .query_row("SELECT active FROM users WHERE id = ?1", params![session.user_id], |r| r.get(0))
            .optional()?;
        if active != Some(1) {
            return Err(PosError::BusinessRule("This user account is disabled".into()));
        }
        // Re-read the role so a demotion takes effect immediately.
        if !role_of(conn, &session.user_id)?.can(perm) {
            return Err(PosError::BusinessRule(format!("Your role is not allowed to do this ({:?})", perm)));
        }
        Ok(())
    }
}
