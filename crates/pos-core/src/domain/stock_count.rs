use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::purchase::PurchaseRepo;
use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockCountSession {
    pub id: String,
    pub doc_no: String,
    pub status: String,
    pub notes: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub approved_by: Option<String>,
    pub lines: Vec<StockCountLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockCountLine {
    pub id: String,
    pub session_id: String,
    pub variant_id: String,
    pub sku: String,
    pub product_name: String,
    pub expected_qty_milli: i64,
    pub counted_qty_milli: i64,
    pub variance_qty_milli: i64,
    pub unit_cost_paisa: i64,
    pub variance_value_paisa: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordCountItemInput {
    pub variant_id: String,
    pub counted_qty_milli: i64,
    pub notes: Option<String>,
}

pub struct StockCountRepo;

impl StockCountRepo {
    /// Starts a new physical inventory audit session.
    pub fn start_session(conn: &Connection, notes: Option<String>) -> Result<StockCountSession> {
        let doc_no = PurchaseRepo::next_doc_no(conn, "count")?;
        let session_id = Ulid::new().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO stock_count_sessions (id, doc_no, status, notes, started_at)
             VALUES (?1, ?2, 'in_progress', ?3, ?4)",
            params![session_id, doc_no, notes, now],
        )
        .map_err(|e| PosError::Db(format!("Failed to start stock count session: {}", e)))?;

        Ok(StockCountSession {
            id: session_id,
            doc_no,
            status: "in_progress".to_string(),
            notes,
            started_at: now,
            completed_at: None,
            approved_by: None,
            lines: Vec::new(),
        })
    }

    /// Records scanned physical counts for items in a session.
    pub fn record_counts(
        conn: &mut Connection,
        session_id: &str,
        items: Vec<RecordCountItemInput>,
    ) -> Result<()> {
        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(e.to_string()))?;

        for item in items {
            let line_id = Ulid::new().to_string();

            // Fetch current on hand and average cost
            let balance = InventoryRepo::get_balance(&tx, &item.variant_id)?;
            let (expected_qty, avg_cost) = match balance {
                Some(b) => (b.on_hand_milli, b.avg_cost_paisa),
                None => (0, 0),
            };

            let variance_qty = item.counted_qty_milli - expected_qty;
            let variance_val = (variance_qty * avg_cost) / 1000;

            tx.execute(
                "INSERT INTO stock_count_lines (
                    id, session_id, variant_id, expected_qty_milli, counted_qty_milli,
                    variance_qty_milli, unit_cost_paisa, variance_value_paisa, notes
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    line_id,
                    session_id,
                    item.variant_id,
                    expected_qty,
                    item.counted_qty_milli,
                    variance_qty,
                    avg_cost,
                    variance_val,
                    item.notes,
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to record stock count line: {}", e)))?;
        }

        tx.commit()
            .map_err(|e| PosError::Db(e.to_string()))?;
        Ok(())
    }

    /// Finalizes a stock count session with manager approval, automatically posting
    /// compensating stock adjustments for any discrepancies found.
    pub fn finalize_and_adjust(
        conn: &mut Connection,
        session_id: &str,
        approved_by_user_id: &str,
    ) -> Result<StockCountSession> {
        let (doc_no, status): (String, String) = conn
            .query_row(
                "SELECT doc_no, status FROM stock_count_sessions WHERE id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| PosError::NotFound(format!("Stock count session {} not found", session_id)))?;

        if status == "completed" {
            return Err(PosError::BusinessRule("Stock count session is already completed".to_string()));
        }

        let now = Utc::now().to_rfc3339();
        let valid_user_id: Option<String> = if approved_by_user_id.is_empty() {
            None
        } else {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM users WHERE id = ?1",
                    params![approved_by_user_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if exists > 0 {
                Some(approved_by_user_id.to_string())
            } else {
                None
            }
        };

        // 1. Fetch all lines with discrepancies
        let mut lines = Vec::new();
        {
            let mut stmt = conn
                .prepare(
                    "SELECT scl.id, scl.variant_id, p.sku, p.name,
                            scl.expected_qty_milli, scl.counted_qty_milli,
                            scl.variance_qty_milli, scl.unit_cost_paisa, scl.variance_value_paisa, scl.notes
                     FROM stock_count_lines scl
                     JOIN product_variants pv ON scl.variant_id = pv.id
                     JOIN products p ON pv.product_id = p.id
                     WHERE scl.session_id = ?1",
                )
                .map_err(|e| PosError::Db(e.to_string()))?;

            let rows = stmt
                .query_map(params![session_id], |row| {
                    Ok(StockCountLine {
                        id: row.get(0)?,
                        session_id: session_id.to_string(),
                        variant_id: row.get(1)?,
                        sku: row.get(2)?,
                        product_name: row.get(3)?,
                        expected_qty_milli: row.get(4)?,
                        counted_qty_milli: row.get(5)?,
                        variance_qty_milli: row.get(6)?,
                        unit_cost_paisa: row.get(7)?,
                        variance_value_paisa: row.get(8)?,
                        notes: row.get(9)?,
                    })
                })
                .map_err(|e| PosError::Db(e.to_string()))?;

            for r in rows {
                lines.push(r.map_err(|e| PosError::Db(e.to_string()))?);
            }
        }

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(e.to_string()))?;

        // 2. Post stock_movements adjustments for non-zero variances
        for line in &lines {
            if line.variance_qty_milli != 0 {
                InventoryRepo::record_movement(
                    &tx,
                    RecordMovementParams {
                        variant_id: line.variant_id.clone(),
                        qty_signed_milli: line.variance_qty_milli,
                        movement_type: "adjustment".to_string(),
                        source_doc: doc_no.clone(),
                        source_line: Some(line.id.clone()),
                        unit_cost_paisa: line.unit_cost_paisa,
                        batch_id: None,
                        serial_id: None,
                        user_id: valid_user_id.clone(),
                    },
                )?;
            }
        }

        // 3. Mark session completed
        tx.execute(
            "UPDATE stock_count_sessions
             SET status = 'completed', completed_at = ?1, approved_by = ?2
             WHERE id = ?3",
            params![now, valid_user_id, session_id],
        )
        .map_err(|e| PosError::Db(e.to_string()))?;

        tx.commit()
            .map_err(|e| PosError::Db(e.to_string()))?;

        Ok(StockCountSession {
            id: session_id.to_string(),
            doc_no,
            status: "completed".to_string(),
            notes: None,
            started_at: "".to_string(),
            completed_at: Some(now),
            approved_by: valid_user_id,
            lines,
        })
    }
}
