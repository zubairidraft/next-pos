use crate::error::{PosError, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Unit {
    pub id: String,
    pub code: String,
    pub name: String,
    pub decimals_allowed: u8,
    pub created_at: DateTime<Utc>,
}

pub struct UnitRepo;

impl UnitRepo {
    pub fn create(conn: &Connection, code: &str, name: &str, decimals_allowed: u8) -> Result<Unit> {
        let trimmed_code = code.trim().to_lowercase();
        let trimmed_name = name.trim();
        if trimmed_code.is_empty() || trimmed_name.is_empty() {
            return Err(PosError::Validation("Unit code and name cannot be empty".into()));
        }
        let id = Ulid::new().to_string();
        let now = Utc::now();
        let now_str = now.to_rfc3339();

        conn.execute(
            "INSERT INTO units (id, code, name, decimals_allowed, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, trimmed_code, trimmed_name, decimals_allowed, now_str],
        )
        .map_err(|e| PosError::Db(format!("Failed to create unit: {}", e)))?;

        Ok(Unit {
            id,
            code: trimmed_code,
            name: trimmed_name.into(),
            decimals_allowed,
            created_at: now,
        })
    }

    pub fn list(conn: &Connection) -> Result<Vec<Unit>> {
        let mut stmt = conn
            .prepare("SELECT id, code, name, decimals_allowed, created_at FROM units ORDER BY code ASC")
            .map_err(|e| PosError::Db(format!("Failed to prepare unit list: {}", e)))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let code: String = row.get(1)?;
                let name: String = row.get(2)?;
                let decimals: u8 = row.get(3)?;
                let created_at_str: String = row.get(4)?;
                let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                Ok(Unit {
                    id,
                    code,
                    name,
                    decimals_allowed: decimals,
                    created_at,
                })
            })
            .map_err(|e| PosError::Db(format!("Failed to query units: {}", e)))?;

        let mut units = Vec::new();
        for item in rows {
            units.push(item.map_err(|e| PosError::Db(format!("Unit row error: {}", e)))?);
        }
        Ok(units)
    }

    /// Seeds standard units used in Pakistani retail:
    /// pc (Piece, 0 decimals), kg (Kilogram, 3 decimals), ltr (Liter, 3 decimals),
    /// m (Meter, 2 decimals), dozen (Dozen, 0 decimals), carton (Carton, 0 decimals).
    pub fn seed_defaults(conn: &Connection) -> Result<()> {
        let defaults = [
            ("pc", "Piece", 0),
            ("kg", "Kilogram", 3),
            ("ltr", "Liter", 3),
            ("m", "Meter", 2),
            ("dozen", "Dozen", 0),
            ("carton", "Carton", 0),
        ];

        for (code, name, decimals) in defaults {
            let exists: i64 = conn
                .query_row("SELECT count(*) FROM units WHERE code = ?1", [code], |row| {
                    row.get(0)
                })
                .unwrap_or(0);

            if exists == 0 {
                let _ = Self::create(conn, code, name, decimals)?;
            }
        }
        Ok(())
    }
}
