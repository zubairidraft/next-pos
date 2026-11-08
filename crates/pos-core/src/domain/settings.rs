use crate::error::{PosError, Result};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessSettings {
    pub id: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub ntn: Option<String>,
    pub strn: Option<String>,
    pub currency: String,
    pub time_zone: String,
    pub tax_mode: String,
    pub negative_stock_policy: String,
    pub enabled_packs: Vec<String>,
    pub fbr_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct SettingsRepo;

impl SettingsRepo {
    pub fn get(conn: &Connection) -> Result<BusinessSettings> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, name_ur, address, phone, ntn, strn, currency, time_zone,
                        tax_mode, negative_stock_policy, enabled_packs, fbr_enabled, created_at, updated_at
                 FROM business_settings
                 LIMIT 1",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare get settings: {}", e)))?;

        stmt.query_row([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let name_ur: Option<String> = row.get(2)?;
            let address: Option<String> = row.get(3)?;
            let phone: Option<String> = row.get(4)?;
            let ntn: Option<String> = row.get(5)?;
            let strn: Option<String> = row.get(6)?;
            let currency: String = row.get(7)?;
            let time_zone: String = row.get(8)?;
            let tax_mode: String = row.get(9)?;
            let negative_stock_policy: String = row.get(10)?;
            let packs_json: String = row.get(11)?;
            let fbr_int: i32 = row.get(12)?;
            let created_at_str: String = row.get(13)?;
            let updated_at_str: String = row.get(14)?;

            let enabled_packs: Vec<String> =
                serde_json::from_str(&packs_json).unwrap_or_else(|_| vec!["grocery".into()]);
            let created_at = DateTime::parse_from_rfc3339(&created_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(BusinessSettings {
                id,
                name,
                name_ur,
                address,
                phone,
                ntn,
                strn,
                currency,
                time_zone,
                tax_mode,
                negative_stock_policy,
                enabled_packs,
                fbr_enabled: fbr_int == 1,
                created_at,
                updated_at,
            })
        })
        .map_err(|e| PosError::NotFound(format!("No business settings found: {}", e)))
    }

    pub fn default_settings() -> BusinessSettings {
        BusinessSettings {
            id: "default".into(),
            name: "Next POS".into(),
            name_ur: None,
            address: None,
            phone: None,
            ntn: None,
            strn: None,
            currency: "PKR".into(),
            time_zone: "Asia/Karachi".into(),
            tax_mode: "inclusive".into(),
            negative_stock_policy: "Warn".into(),
            enabled_packs: vec!["grocery".into()],
            fbr_enabled: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    pub fn save_or_update(conn: &Connection, settings: &BusinessSettings) -> Result<()> {
        let packs_json = serde_json::to_string(&settings.enabled_packs)
            .map_err(|e| PosError::Validation(format!("Failed to serialize enabled_packs: {}", e)))?;
        let now = Utc::now().to_rfc3339();

        let count: i64 = conn
            .query_row("SELECT count(*) FROM business_settings", [], |row| row.get(0))
            .unwrap_or(0);

        if count == 0 {
            let id = if settings.id.is_empty() {
                Ulid::new().to_string()
            } else {
                settings.id.clone()
            };

            conn.execute(
                "INSERT INTO business_settings (
                    id, name, name_ur, address, phone, ntn, strn, currency, time_zone,
                    tax_mode, negative_stock_policy, enabled_packs, fbr_enabled, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![
                    id,
                    settings.name,
                    settings.name_ur,
                    settings.address,
                    settings.phone,
                    settings.ntn,
                    settings.strn,
                    settings.currency,
                    settings.time_zone,
                    settings.tax_mode,
                    settings.negative_stock_policy,
                    packs_json,
                    if settings.fbr_enabled { 1 } else { 0 },
                    now,
                    now
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert settings: {}", e)))?;
        } else {
            conn.execute(
                "UPDATE business_settings SET
                    name = ?1,
                    name_ur = ?2,
                    address = ?3,
                    phone = ?4,
                    ntn = ?5,
                    strn = ?6,
                    currency = ?7,
                    time_zone = ?8,
                    tax_mode = ?9,
                    negative_stock_policy = ?10,
                    enabled_packs = ?11,
                    fbr_enabled = ?12,
                    updated_at = ?13",
                params![
                    settings.name,
                    settings.name_ur,
                    settings.address,
                    settings.phone,
                    settings.ntn,
                    settings.strn,
                    settings.currency,
                    settings.time_zone,
                    settings.tax_mode,
                    settings.negative_stock_policy,
                    packs_json,
                    if settings.fbr_enabled { 1 } else { 0 },
                    now
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to update settings: {}", e)))?;
        }
        Ok(())
    }
}
