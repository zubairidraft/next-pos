//! Sale returns, credit notes, stock restoration, and refund payouts.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnLineRequest {
    pub original_sale_line_id: String,
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
    pub refund_paisa: i64,
    pub restock_type: String, // "sellable" or "damaged"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostReturnRequest {
    pub original_sale_id: String,
    pub lines: Vec<ReturnLineRequest>,
    pub reason: Option<String>,
    pub refund_method: String, // "cash", "credit", "card"
    pub cash_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedReturn {
    pub id: String,
    pub doc_no: String,
    pub original_sale_id: String,
    pub refund_paisa: i64,
    pub restocked_items_count: usize,
    pub created_at: String,
}

pub struct ReturnRepo;

impl ReturnRepo {
    /// Post a customer return with validation, stock replenishment, and refund ledger update
    pub fn post_return(
        conn: &mut Connection,
        req: PostReturnRequest,
    ) -> Result<CompletedReturn, PosError> {
        if req.lines.is_empty() {
            return Err(PosError::Validation(
                "Return request must contain at least one line item.".to_string(),
            ));
        }

        let now = chrono::Utc::now().to_rfc3339();
        let return_id = Ulid::new().to_string();

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to start return transaction: {}", e)))?;

        // 1. Verify original sale exists and retrieve customer if any
        let party_id: Option<String> = tx
            .query_row(
                "SELECT party_id FROM sales WHERE id = ?1",
                params![req.original_sale_id],
                |r| r.get(0),
            )
            .map_err(|e| PosError::Validation(format!("Original sale not found: {}", e)))?;

        // 2. Validate line item return limits (cannot return more than purchased)
        let mut total_refund_paisa: i64 = 0;
        let mut validated_lines = Vec::new();

        for line in &req.lines {
            if line.qty_milli <= 0 {
                return Err(PosError::Validation(
                    "Return quantity must be greater than zero.".to_string(),
                ));
            }

            let (sold_qty, unit_cost_snapshot): (i64, i64) = tx
                .query_row(
                    "SELECT qty_milli, unit_cost_snapshot_paisa FROM sale_lines WHERE id = ?1 AND sale_id = ?2",
                    params![line.original_sale_line_id, req.original_sale_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|e| {
                    PosError::Validation(format!(
                        "Sale line {} not found in sale {}: {}",
                        line.original_sale_line_id, req.original_sale_id, e
                    ))
                })?;

            let already_returned_qty: i64 = tx
                .query_row(
                    "SELECT COALESCE(SUM(qty_milli), 0) FROM sale_return_lines WHERE original_sale_line_id = ?1",
                    params![line.original_sale_line_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            if already_returned_qty + line.qty_milli > sold_qty {
                return Err(PosError::Validation(format!(
                    "Return quantity ({} milli) exceeds remaining eligible quantity ({} milli) for line {}",
                    line.qty_milli,
                    sold_qty - already_returned_qty,
                    line.original_sale_line_id
                )));
            }

            total_refund_paisa += line.refund_paisa;
            validated_lines.push((line, unit_cost_snapshot));
        }

        // 3. Increment document sequence RET-
        let next_seq: i64 = tx
            .query_row(
                "SELECT next_no FROM document_sequences WHERE doc_type = 'return'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(1);

        let doc_no = format!("RET-{:04}", next_seq);

        tx.execute(
            "UPDATE document_sequences SET next_no = ?1 WHERE doc_type = 'return'",
            params![next_seq + 1],
        )
        .map_err(|e| PosError::Db(format!("Failed to increment return sequence: {}", e)))?;

        // 4. Insert into sale_returns header (parent table first)
        tx.execute(
            "INSERT INTO sale_returns (
                id, doc_no, original_sale_id, refund_paisa, reason, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                return_id,
                doc_no,
                req.original_sale_id,
                total_refund_paisa,
                req.reason,
                now
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert sale return header: {}", e)))?;

        // 5. Insert child return lines and restore stock
        let mut restocked_count: usize = 0;
        for (line, unit_cost_snapshot) in validated_lines {
            let return_line_id = Ulid::new().to_string();

            // Insert into sale_return_lines
            tx.execute(
                "INSERT INTO sale_return_lines (
                    id, return_id, original_sale_line_id, qty_milli, refund_paisa, restock_type
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    return_line_id,
                    return_id,
                    line.original_sale_line_id,
                    line.qty_milli,
                    line.refund_paisa,
                    line.restock_type
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert return line: {}", e)))?;

            // If restock_type == "sellable", replenish inventory
            if line.restock_type == "sellable" {
                InventoryRepo::record_movement(
                    &tx,
                    RecordMovementParams {
                        variant_id: line.variant_id.clone(),
                        qty_signed_milli: line.qty_milli,
                        movement_type: "return".to_string(),
                        source_doc: doc_no.clone(),
                        source_line: Some(return_line_id),
                        unit_cost_paisa: unit_cost_snapshot,
                        batch_id: None,
                        serial_id: None,
                        user_id: None,
                    },
                )?;

                restocked_count += 1;
            }
        }

        // 5. Settle refund payout
        if req.refund_method == "cash" {
            let payment_id = Ulid::new().to_string();
            tx.execute(
                "INSERT INTO payments (
                    id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at
                ) VALUES (?1, ?2, 'outbound', 'cash', ?3, ?4, ?5, ?6)",
                params![
                    payment_id,
                    party_id,
                    total_refund_paisa,
                    doc_no,
                    req.cash_session_id,
                    now
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to record refund cash payment: {}", e)))?;
        } else if req.refund_method == "credit" {
            // Customer Khata balance credit (reducing what customer owes us)
            if let Some(ref cust_id) = party_id {
                let prev_bal: i64 = tx
                    .query_row(
                        "SELECT balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
                        params![cust_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let new_bal = prev_bal - total_refund_paisa;
                let ledger_id = Ulid::new().to_string();

                tx.execute(
                    "INSERT INTO party_ledger (
                        id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at
                    ) VALUES (?1, ?2, 'return', 0, ?3, ?4, ?5, ?6)",
                    params![ledger_id, cust_id, total_refund_paisa, new_bal, doc_no, now],
                )
                .map_err(|e| PosError::Db(format!("Failed to record return customer credit: {}", e)))?;
            }
        }

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit return transaction: {}", e)))?;

        Ok(CompletedReturn {
            id: return_id,
            doc_no,
            original_sale_id: req.original_sale_id,
            refund_paisa: total_refund_paisa,
            restocked_items_count: restocked_count,
            created_at: now,
        })
    }
}
