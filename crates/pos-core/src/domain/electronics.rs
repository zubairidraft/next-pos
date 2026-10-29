//! Electronics & mobile shop IMEI and serial number tracking.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::PosError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SerialStatus {
    InStock,
    Sold,
    Returned,
    Defective,
}

impl SerialStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SerialStatus::InStock => "in_stock",
            SerialStatus::Sold => "sold",
            SerialStatus::Returned => "returned",
            SerialStatus::Defective => "defective",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "in_stock" => Some(SerialStatus::InStock),
            "sold" => Some(SerialStatus::Sold),
            "returned" => Some(SerialStatus::Returned),
            "defective" => Some(SerialStatus::Defective),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductSerial {
    pub id: String,
    pub variant_id: String,
    pub imei_or_serial: String,
    pub status: SerialStatus,
    pub purchase_doc: Option<String>,
    pub sale_doc: Option<String>,
    pub warranty_months: u32,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ElectronicsRepo;

impl ElectronicsRepo {
    /// Inbound receiving: register a unique serial/IMEI into stock
    pub fn register_serial(
        conn: &Connection,
        variant_id: &str,
        imei_or_serial: &str,
        purchase_doc: Option<&str>,
        warranty_months: u32,
    ) -> Result<ProductSerial, PosError> {
        let clean_serial = imei_or_serial.trim();
        if clean_serial.is_empty() {
            return Err(PosError::Validation("Serial / IMEI number cannot be empty".to_string()));
        }

        // Check if an in_stock serial already exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM product_serials WHERE variant_id = ?1 AND imei_or_serial = ?2 AND status = 'in_stock'",
                params![variant_id, clean_serial],
                |r| r.get(0),
            )
            .unwrap_or(false);

        if exists {
            return Err(PosError::Validation(format!(
                "Serial / IMEI '{}' is already registered and marked In Stock!",
                clean_serial
            )));
        }

        let id = Ulid::new().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO product_serials (id, variant_id, imei_or_serial, status, purchase_doc, sale_doc, warranty_months, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'in_stock', ?4, NULL, ?5, ?6, ?7)",
            params![id, variant_id, clean_serial, purchase_doc, warranty_months, now, now],
        ).map_err(|e| PosError::Db(format!("Failed to register serial: {}", e)))?;

        Ok(ProductSerial {
            id,
            variant_id: variant_id.to_string(),
            imei_or_serial: clean_serial.to_string(),
            status: SerialStatus::InStock,
            purchase_doc: purchase_doc.map(|s| s.to_string()),
            sale_doc: None,
            warranty_months,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Outbound checkout: validate that serial is in stock
    pub fn validate_serial_available(
        conn: &Connection,
        variant_id: &str,
        imei_or_serial: &str,
    ) -> Result<bool, PosError> {
        let clean = imei_or_serial.trim();
        let is_available: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM product_serials WHERE variant_id = ?1 AND imei_or_serial = ?2 AND status = 'in_stock'",
                params![variant_id, clean],
                |r| r.get(0),
            )
            .unwrap_or(false);

        Ok(is_available)
    }

    /// Mark serial as sold on checkout completion
    pub fn mark_serial_sold(
        conn: &Connection,
        variant_id: &str,
        imei_or_serial: &str,
        sale_doc: &str,
    ) -> Result<(), PosError> {
        let clean = imei_or_serial.trim();
        let now = Utc::now().to_rfc3339();

        let rows = conn.execute(
            "UPDATE product_serials SET status = 'sold', sale_doc = ?1, updated_at = ?2
             WHERE variant_id = ?3 AND imei_or_serial = ?4 AND status = 'in_stock'",
            params![sale_doc, now, variant_id, clean],
        ).map_err(|e| PosError::Db(format!("Failed to mark serial sold: {}", e)))?;

        if rows == 0 {
            return Err(PosError::Validation(format!(
                "Cannot mark sold: Serial '{}' is not currently in stock!",
                clean
            )));
        }

        Ok(())
    }

    /// List all active in-stock serials for a variant
    pub fn list_in_stock_serials(
        conn: &Connection,
        variant_id: &str,
    ) -> Result<Vec<String>, PosError> {
        let mut stmt = conn
            .prepare("SELECT imei_or_serial FROM product_serials WHERE variant_id = ?1 AND status = 'in_stock' ORDER BY created_at ASC")
            .map_err(|e| PosError::Db(format!("Query prep failed: {}", e)))?;

        let rows = stmt
            .query_map(params![variant_id], |r| r.get(0))
            .map_err(|e| PosError::Db(format!("Query failed: {}", e)))?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(|e| PosError::Db(format!("Row error: {}", e)))?);
        }

        Ok(results)
    }
}
