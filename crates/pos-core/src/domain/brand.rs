use crate::error::{PosError, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Brand {
    pub id: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
}

pub struct BrandRepo;

impl BrandRepo {
    pub fn create(conn: &Connection, name: &str, name_ur: Option<&str>) -> Result<Brand> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(PosError::Validation("Brand name cannot be empty".into()));
        }
        let id = Ulid::new().to_string();
        let now = Utc::now();
        let now_str = now.to_rfc3339();

        conn.execute(
            "INSERT INTO brands (id, name, name_ur, active, created_at)
             VALUES (?1, ?2, ?3, 1, ?4)",
            params![id, trimmed_name, name_ur.map(|s| s.trim()), now_str],
        )
        .map_err(|e| PosError::Db(format!("Failed to create brand: {}", e)))?;

        Ok(Brand {
            id,
            name: trimmed_name.into(),
            name_ur: name_ur.map(|s| s.trim().to_string()),
            active: true,
            created_at: now,
        })
    }

    pub fn list(conn: &Connection) -> Result<Vec<Brand>> {
        let mut stmt = conn
            .prepare("SELECT id, name, name_ur, active, created_at FROM brands WHERE active = 1 ORDER BY name ASC")
            .map_err(|e| PosError::Db(format!("Failed to prepare brand list: {}", e)))?;

        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let name_ur: Option<String> = row.get(2)?;
                let active_int: i32 = row.get(3)?;
                let created_at_str: String = row.get(4)?;
                let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                Ok(Brand {
                    id,
                    name,
                    name_ur,
                    active: active_int == 1,
                    created_at,
                })
            })
            .map_err(|e| PosError::Db(format!("Failed to query brands: {}", e)))?;

        let mut brands = Vec::new();
        for item in rows {
            brands.push(item.map_err(|e| PosError::Db(format!("Brand row error: {}", e)))?);
        }
        Ok(brands)
    }

    pub fn search(conn: &Connection, query: &str) -> Result<Vec<Brand>> {
        let pattern = format!("%{}%", query.trim());
        let mut stmt = conn
            .prepare(
                "SELECT id, name, name_ur, active, created_at FROM brands
                 WHERE active = 1 AND (name LIKE ?1 OR name_ur LIKE ?1)
                 ORDER BY name ASC",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare brand search: {}", e)))?;

        let rows = stmt
            .query_map(params![pattern], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let name_ur: Option<String> = row.get(2)?;
                let active_int: i32 = row.get(3)?;
                let created_at_str: String = row.get(4)?;
                let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                Ok(Brand {
                    id,
                    name,
                    name_ur,
                    active: active_int == 1,
                    created_at,
                })
            })
            .map_err(|e| PosError::Db(format!("Failed to query search brands: {}", e)))?;

        let mut brands = Vec::new();
        for item in rows {
            brands.push(item.map_err(|e| PosError::Db(format!("Brand row error: {}", e)))?);
        }
        Ok(brands)
    }
}
