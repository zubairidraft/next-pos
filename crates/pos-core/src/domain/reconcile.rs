use std::collections::HashMap;
use std::time::Instant;
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::domain::purchase::PurchaseRepo;
use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebuildSummary {
    pub variants_processed: usize,
    pub total_movements_replayed: usize,
    pub discrepancies_corrected: usize,
    pub duration_ms: u128,
}

pub struct ReconcileEngine;

impl ReconcileEngine {
    /// Replays the entire immutable stock_movements ledger and reconstructs inventory_balances
    /// identically, verifying zero ledger drift.
    pub fn rebuild_inventory_cache(conn: &mut Connection) -> Result<RebuildSummary> {
        let start = Instant::now();
        let now = Utc::now().to_rfc3339();

        // 1. Fetch current cached balances for discrepancy comparison
        let mut cached_balances: HashMap<String, (i64, i64)> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT variant_id, on_hand_milli, avg_cost_paisa FROM inventory_balances")
                .map_err(|e| PosError::Db(e.to_string()))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)))
                })
                .map_err(|e| PosError::Db(e.to_string()))?;

            for r in rows {
                let (vid, bal) = r.map_err(|e| PosError::Db(e.to_string()))?;
                cached_balances.insert(vid, bal);
            }
        }

        // 2. Fetch all movements in chronological order
        struct MovementRow {
            variant_id: String,
            qty_signed_milli: i64,
            unit_cost_paisa: i64,
        }

        let mut stmt = conn
            .prepare(
                "SELECT variant_id, qty_signed_milli, unit_cost_paisa
                 FROM stock_movements
                 ORDER BY occurred_at ASC, id ASC",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let movement_rows = stmt
            .query_map([], |row| {
                Ok(MovementRow {
                    variant_id: row.get(0)?,
                    qty_signed_milli: row.get(1)?,
                    unit_cost_paisa: row.get(2)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut total_movements = 0;
        let mut computed_balances: HashMap<String, (i64, i64)> = HashMap::new(); // variant_id -> (on_hand, avg_cost)

        for m in movement_rows {
            let m = m.map_err(|e| PosError::Db(e.to_string()))?;
            total_movements += 1;

            let entry = computed_balances.entry(m.variant_id).or_insert((0, 0));
            let cur_qty = entry.0;
            let cur_cost = entry.1;

            if m.qty_signed_milli > 0 {
                // Inbound intake: recalculate WAC
                let new_avg_cost = PurchaseRepo::calculate_new_avg_cost(
                    cur_qty,
                    cur_cost,
                    m.qty_signed_milli,
                    m.unit_cost_paisa,
                );
                entry.0 = cur_qty + m.qty_signed_milli;
                entry.1 = new_avg_cost;
            } else {
                // Outbound deduction: cost remains unchanged, qty decreases
                entry.0 = cur_qty + m.qty_signed_milli;
            }
        }
        drop(stmt);

        // 3. Count discrepancies & update database in a single transaction
        let mut discrepancies_corrected = 0;
        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

        for (variant_id, (comp_qty, comp_cost)) in &computed_balances {
            if let Some(&(cached_qty, cached_cost)) = cached_balances.get(variant_id) {
                if cached_qty != *comp_qty || cached_cost != *comp_cost {
                    discrepancies_corrected += 1;
                }
            } else {
                discrepancies_corrected += 1;
            }

            tx.execute(
                "INSERT INTO inventory_balances (variant_id, on_hand_milli, avg_cost_paisa, last_rebuilt_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(variant_id) DO UPDATE SET
                     on_hand_milli = excluded.on_hand_milli,
                     avg_cost_paisa = excluded.avg_cost_paisa,
                     last_rebuilt_at = excluded.last_rebuilt_at",
                params![variant_id, comp_qty, comp_cost, now],
            )
            .map_err(|e| PosError::Db(format!("Failed to update rebuilt balance: {}", e)))?;
        }

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit rebuild: {}", e)))?;

        Ok(RebuildSummary {
            variants_processed: computed_balances.len(),
            total_movements_replayed: total_movements,
            discrepancies_corrected,
            duration_ms: start.elapsed().as_millis(),
        })
    }
}
