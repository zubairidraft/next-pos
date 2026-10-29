use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::{PosError, Result};
use crate::money::Qty;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockMovement {
    pub id: String,
    pub variant_id: String,
    pub qty_signed_milli: i64,
    pub movement_type: String,
    pub source_doc: String,
    pub source_line: Option<String>,
    pub unit_cost_paisa: i64,
    pub value_delta_paisa: i64,
    pub batch_id: Option<String>,
    pub serial_id: Option<String>,
    pub occurred_at: String,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryBalance {
    pub variant_id: String,
    pub on_hand_milli: i64,
    pub avg_cost_paisa: i64,
    pub last_rebuilt_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryBalanceView {
    pub variant_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_name_ur: Option<String>,
    pub sku: String,
    pub barcode: Option<String>,
    pub unit_code: String,
    pub on_hand_milli: i64,
    pub avg_cost_paisa: i64,
    pub total_valuation_paisa: i64,
    pub last_rebuilt_at: String,
}

#[derive(Debug, Clone)]
pub struct RecordMovementParams {
    pub variant_id: String,
    pub qty_signed_milli: i64,
    pub movement_type: String,
    pub source_doc: String,
    pub source_line: Option<String>,
    pub unit_cost_paisa: i64,
    pub batch_id: Option<String>,
    pub serial_id: Option<String>,
    pub user_id: Option<String>,
}

pub struct InventoryRepo;

impl InventoryRepo {
    /// Records an immutable stock movement and updates the materialized balance cache atomically.
    /// Strictly blocks outbound negative stock if the system setting stock_policy is "Block".
    pub fn record_movement(conn: &Connection, params: RecordMovementParams) -> Result<StockMovement> {
        let now = Utc::now().to_rfc3339();

        // 1. Check stock policy if deduction
        if params.qty_signed_milli < 0 {
            let policy: String = conn
                .query_row(
                    "SELECT stock_policy FROM business_settings LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "Block".to_string());

            if policy == "Block" {
                let current_on_hand: i64 = conn
                    .query_row(
                        "SELECT on_hand_milli FROM inventory_balances WHERE variant_id = ?1",
                        [&params.variant_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                if current_on_hand + params.qty_signed_milli < 0 {
                    return Err(PosError::NegativeStockBlocked {
                        variant_id: params.variant_id,
                        requested_milli: -params.qty_signed_milli,
                        available_milli: current_on_hand,
                    });
                }
            }
        }

        let movement_id = Ulid::new().to_string();
        let value_delta_paisa = (params.qty_signed_milli * params.unit_cost_paisa) / 1000;

        // 2. Insert into stock_movements
        conn.execute(
            "INSERT INTO stock_movements (
                id, variant_id, qty_signed_milli, movement_type, source_doc, source_line,
                unit_cost_paisa, value_delta_paisa, batch_id, serial_id, occurred_at, user_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                movement_id,
                params.variant_id,
                params.qty_signed_milli,
                params.movement_type,
                params.source_doc,
                params.source_line,
                params.unit_cost_paisa,
                value_delta_paisa,
                params.batch_id,
                params.serial_id,
                now,
                params.user_id,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert stock movement: {}", e)))?;

        // 3. Upsert inventory_balances
        conn.execute(
            "INSERT INTO inventory_balances (variant_id, on_hand_milli, avg_cost_paisa, last_rebuilt_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(variant_id) DO UPDATE SET
                 on_hand_milli = on_hand_milli + excluded.on_hand_milli,
                 last_rebuilt_at = excluded.last_rebuilt_at",
            params![params.variant_id, params.qty_signed_milli, params.unit_cost_paisa, now],
        )
        .map_err(|e| PosError::Db(format!("Failed to update inventory balance: {}", e)))?;

        Ok(StockMovement {
            id: movement_id,
            variant_id: params.variant_id,
            qty_signed_milli: params.qty_signed_milli,
            movement_type: params.movement_type,
            source_doc: params.source_doc,
            source_line: params.source_line,
            unit_cost_paisa: params.unit_cost_paisa,
            value_delta_paisa,
            batch_id: params.batch_id,
            serial_id: params.serial_id,
            occurred_at: now,
            user_id: params.user_id,
        })
    }

    /// Updates the weighted-average cost in inventory_balances.
    pub fn update_avg_cost(conn: &Connection, variant_id: &str, new_avg_cost_paisa: i64) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE inventory_balances SET avg_cost_paisa = ?1, last_rebuilt_at = ?2 WHERE variant_id = ?3",
            params![new_avg_cost_paisa, now, variant_id],
        )
        .map_err(|e| PosError::Db(format!("Failed to update average cost: {}", e)))?;
        Ok(())
    }

    /// Fetches the current inventory balance for a variant.
    pub fn get_balance(conn: &Connection, variant_id: &str) -> Result<Option<InventoryBalance>> {
        let mut stmt = conn
            .prepare("SELECT variant_id, on_hand_milli, avg_cost_paisa, last_rebuilt_at FROM inventory_balances WHERE variant_id = ?1")
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut rows = stmt
            .query(params![variant_id])
            .map_err(|e| PosError::Db(e.to_string()))?;

        if let Some(row) = rows.next().map_err(|e| PosError::Db(e.to_string()))? {
            Ok(Some(InventoryBalance {
                variant_id: row.get(0).map_err(|e| PosError::Db(e.to_string()))?,
                on_hand_milli: row.get(1).map_err(|e| PosError::Db(e.to_string()))?,
                avg_cost_paisa: row.get(2).map_err(|e| PosError::Db(e.to_string()))?,
                last_rebuilt_at: row.get(3).map_err(|e| PosError::Db(e.to_string()))?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Gets on-hand quantity wrapped in Qty.
    pub fn get_on_hand_qty(conn: &Connection, variant_id: &str) -> Result<Qty> {
        let on_hand: i64 = conn
            .query_row(
                "SELECT on_hand_milli FROM inventory_balances WHERE variant_id = ?1",
                params![variant_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        Ok(Qty(on_hand))
    }

    /// Retrieves chronological movement history for a variant.
    pub fn get_history(conn: &Connection, variant_id: &str, limit: usize) -> Result<Vec<StockMovement>> {
        let mut stmt = conn
            .prepare(
                "SELECT id, variant_id, qty_signed_milli, movement_type, source_doc, source_line,
                        unit_cost_paisa, value_delta_paisa, batch_id, serial_id, occurred_at, user_id
                 FROM stock_movements
                 WHERE variant_id = ?1
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let rows = stmt
            .query_map(params![variant_id, limit as i64], |row| {
                Ok(StockMovement {
                    id: row.get(0)?,
                    variant_id: row.get(1)?,
                    qty_signed_milli: row.get(2)?,
                    movement_type: row.get(3)?,
                    source_doc: row.get(4)?,
                    source_line: row.get(5)?,
                    unit_cost_paisa: row.get(6)?,
                    value_delta_paisa: row.get(7)?,
                    batch_id: row.get(8)?,
                    serial_id: row.get(9)?,
                    occurred_at: row.get(10)?,
                    user_id: row.get(11)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(list)
    }

    /// Lists inventory balances joined with product details and calculated valuation.
    pub fn list_balances(conn: &Connection) -> Result<Vec<InventoryBalanceView>> {
        let mut stmt = conn
            .prepare(
                "SELECT ib.variant_id, p.id as product_id, p.name, p.name_ur, p.sku,
                        b.value as barcode, u.code as unit_code,
                        ib.on_hand_milli, ib.avg_cost_paisa, ib.last_rebuilt_at
                 FROM inventory_balances ib
                 JOIN product_variants pv ON ib.variant_id = pv.id
                 JOIN products p ON pv.product_id = p.id
                 JOIN units u ON p.base_unit_id = u.id
                 LEFT JOIN (SELECT variant_id, MIN(value) as value FROM barcodes GROUP BY variant_id) b ON b.variant_id = pv.id
                 ORDER BY p.name ASC",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let on_hand_milli: i64 = row.get(7)?;
                let avg_cost_paisa: i64 = row.get(8)?;
                let total_valuation_paisa = (on_hand_milli * avg_cost_paisa) / 1000;

                Ok(InventoryBalanceView {
                    variant_id: row.get(0)?,
                    product_id: row.get(1)?,
                    product_name: row.get(2)?,
                    product_name_ur: row.get(3)?,
                    sku: row.get(4)?,
                    barcode: row.get(5)?,
                    unit_code: row.get(6)?,
                    on_hand_milli,
                    avg_cost_paisa,
                    total_valuation_paisa,
                    last_rebuilt_at: row.get(9)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(list)
    }
}
