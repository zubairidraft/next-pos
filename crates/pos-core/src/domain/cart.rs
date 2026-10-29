use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::{PosError, Result};
use crate::money::{calc_line_total, Paisa, Qty};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CartLine {
    pub id: String,
    pub variant_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub unit_id: String,
    pub unit_code: String,
    pub barcode: Option<String>,
    pub qty: Qty,
    pub unit_price: Paisa,
    pub discount_basis_points: u32,
    pub tax_rate_basis_points: u32,
}

impl CartLine {
    pub fn line_subtotal(&self) -> Paisa {
        calc_line_total(self.unit_price, self.qty)
    }

    pub fn line_discount(&self) -> Paisa {
        let sub = self.line_subtotal().0;
        let disc = (sub * self.discount_basis_points as i64) / 10_000;
        Paisa(disc)
    }

    pub fn line_net(&self) -> Paisa {
        self.line_subtotal() - self.line_discount()
    }

    pub fn line_tax(&self) -> Paisa {
        let net = self.line_net().0;
        let tax = (net * self.tax_rate_basis_points as i64) / 10_000;
        Paisa(tax)
    }

    pub fn line_total(&self) -> Paisa {
        self.line_net() + self.line_tax()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Cart {
    pub customer_id: Option<String>,
    pub lines: Vec<CartLine>,
    pub global_discount_basis_points: u32,
}

impl Cart {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_or_increment(&mut self, line: CartLine) {
        if let Some(existing) = self.lines.iter_mut().find(|l| l.variant_id == line.variant_id) {
            existing.qty = existing.qty + line.qty;
        } else {
            self.lines.push(line);
        }
    }

    pub fn set_qty(&mut self, variant_id: &str, qty: Qty) {
        if qty.0 <= 0 {
            self.lines.retain(|l| l.variant_id != variant_id);
        } else if let Some(existing) = self.lines.iter_mut().find(|l| l.variant_id == variant_id) {
            existing.qty = qty;
        }
    }

    pub fn remove_line(&mut self, line_id: &str) {
        self.lines.retain(|l| l.id != line_id);
    }

    pub fn clear(&mut self) {
        self.lines.clear();
        self.customer_id = None;
        self.global_discount_basis_points = 0;
    }

    pub fn subtotal(&self) -> Paisa {
        self.lines.iter().map(|l| l.line_subtotal()).fold(Paisa(0), |a, b| a + b)
    }

    pub fn line_discounts(&self) -> Paisa {
        self.lines.iter().map(|l| l.line_discount()).fold(Paisa(0), |a, b| a + b)
    }

    pub fn global_discount(&self) -> Paisa {
        let net_before_global = self.subtotal() - self.line_discounts();
        let disc = (net_before_global.0 * self.global_discount_basis_points as i64) / 10_000;
        Paisa(disc)
    }

    pub fn total_discount(&self) -> Paisa {
        self.line_discounts() + self.global_discount()
    }

    pub fn tax(&self) -> Paisa {
        self.lines.iter().map(|l| l.line_tax()).fold(Paisa(0), |a, b| a + b)
    }

    pub fn grand_total(&self) -> Paisa {
        let net = self.subtotal() - self.total_discount();
        net + self.tax()
    }

    pub fn item_count(&self) -> usize {
        self.lines.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParkedCartSummary {
    pub id: String,
    pub cart_name: String,
    pub customer_id: Option<String>,
    pub total_paisa: i64,
    pub item_count: usize,
    pub parked_at: String,
}

pub struct CartRepo;

impl CartRepo {
    /// Parks the current cart in the persistent SQLite parked_carts table.
    pub fn park_cart(
        conn: &Connection,
        cart: &Cart,
        cart_name: &str,
    ) -> Result<String> {
        if cart.lines.is_empty() {
            return Err(PosError::Validation("Cannot park an empty cart".to_string()));
        }

        let id = Ulid::new().to_string();
        let payload_json = serde_json::to_string(cart)
            .map_err(|e| PosError::Validation(format!("Serialization error: {}", e)))?;
        let now = Utc::now().to_rfc3339();
        let grand_total = cart.grand_total().0;
        let count = cart.item_count();

        conn.execute(
            "INSERT INTO parked_carts (id, cart_name, customer_id, payload_json, total_paisa, item_count, parked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, cart_name, cart.customer_id, payload_json, grand_total, count as i64, now],
        )
        .map_err(|e| PosError::Db(format!("Failed to park cart: {}", e)))?;

        Ok(id)
    }

    /// Lists all parked carts for recall.
    pub fn list_parked_carts(conn: &Connection) -> Result<Vec<ParkedCartSummary>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, cart_name, customer_id, total_paisa, item_count, parked_at
                 FROM parked_carts
                 ORDER BY parked_at DESC",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let count: i64 = row.get(4)?;
                Ok(ParkedCartSummary {
                    id: row.get(0)?,
                    cart_name: row.get(1)?,
                    customer_id: row.get(2)?,
                    total_paisa: row.get(3)?,
                    item_count: count as usize,
                    parked_at: row.get(5)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(list)
    }

    /// Recalls a parked cart by restoring its state and removing it from parked_carts.
    pub fn recall_cart(conn: &mut Connection, parked_cart_id: &str) -> Result<Cart> {
        let payload_json: String = conn
            .query_row(
                "SELECT payload_json FROM parked_carts WHERE id = ?1",
                params![parked_cart_id],
                |row| row.get(0),
            )
            .map_err(|_| PosError::NotFound(format!("Parked cart {} not found", parked_cart_id)))?;

        let cart: Cart = serde_json::from_str(&payload_json)
            .map_err(|e| PosError::Validation(format!("Failed to deserialize parked cart: {}", e)))?;

        conn.execute("DELETE FROM parked_carts WHERE id = ?1", params![parked_cart_id])
            .map_err(|e| PosError::Db(format!("Failed to remove recalled cart: {}", e)))?;

        Ok(cart)
    }
}
