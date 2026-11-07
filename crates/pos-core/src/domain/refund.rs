//! Sale returns, credit notes, stock restoration, and refund payouts.

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::audit::AuditRepo;
use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::khata::KhataRepo;
use crate::domain::sale::unit_factor;
use crate::error::PosError;
use crate::money::mul_div_half_up;

/// Refund methods. `credit` reduces what the customer owes in their khata.
pub const REFUND_METHODS: [&str; 7] = ["cash", "credit", "card", "jazzcash", "easypaisa", "raast", "bank"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnLineRequest {
    pub original_sale_line_id: String,
    /// Must match the variant on the original sale line.
    pub variant_id: String,
    /// Must match the unit on the original sale line.
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
    pub refund_method: String, // one of REFUND_METHODS
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
    /// Post a customer return. Validates quantity, item, unit and refund amount against
    /// the original sale line, restocks in base units, settles the refund and writes the
    /// audit trail, all inside one `BEGIN IMMEDIATE` transaction.
    ///
    /// Refund cap per line = the amount the customer actually paid for that line
    /// (line total after its share of the bill discount), pro-rated by quantity,
    /// minus anything already refunded on that line.
    pub fn post_return(
        conn: &mut Connection,
        req: PostReturnRequest,
    ) -> Result<CompletedReturn, PosError> {
        if req.lines.is_empty() {
            return Err(PosError::Validation(
                "Return request must contain at least one line item.".to_string(),
            ));
        }
        if !REFUND_METHODS.contains(&req.refund_method.as_str()) {
            return Err(PosError::Validation(format!("Unknown refund method '{}'", req.refund_method)));
        }

        let now = chrono::Utc::now().to_rfc3339();
        let return_id = Ulid::new().to_string();

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| PosError::Db(format!("Failed to start return transaction: {}", e)))?;

        // 1. Original sale, its customer and what was actually paid
        let (party_id, sale_total, status): (Option<String>, i64, String) = tx
            .query_row(
                "SELECT party_id, total_paisa, status FROM sales WHERE id = ?1",
                params![req.original_sale_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| PosError::Validation(format!("Original sale not found: {}", e)))?;
        if status != "posted" {
            return Err(PosError::Validation(format!("Sale is '{}' and cannot be returned", status)));
        }
        if req.refund_method == "credit" && party_id.is_none() {
            return Err(PosError::Validation(
                "Khata refund needs a sale made to a registered customer".to_string(),
            ));
        }
        let sum_line_totals: i64 = tx.query_row(
            "SELECT COALESCE(SUM(total_paisa), 0) FROM sale_lines WHERE sale_id = ?1",
            params![req.original_sale_id],
            |r| r.get(0),
        )?;

        // 2. Validate each line against the original
        let mut total_refund_paisa: i64 = 0;
        let mut validated = Vec::new();
        let mut seen_lines = std::collections::HashSet::new();

        for line in &req.lines {
            if line.qty_milli <= 0 {
                return Err(PosError::Validation(
                    "Return quantity must be greater than zero.".to_string(),
                ));
            }
            if line.refund_paisa < 0 {
                return Err(PosError::Validation("Refund amount cannot be negative.".to_string()));
            }
            if line.restock_type != "sellable" && line.restock_type != "damaged" {
                return Err(PosError::Validation("Restock type must be 'sellable' or 'damaged'.".to_string()));
            }
            if !seen_lines.insert(line.original_sale_line_id.clone()) {
                return Err(PosError::Validation("The same sale line appears twice in one return.".to_string()));
            }

            let orig: Option<(String, String, i64, i64, i64)> = tx
                .query_row(
                    "SELECT variant_id, unit_id, qty_milli, total_paisa, unit_cost_snapshot_paisa
                     FROM sale_lines WHERE id = ?1 AND sale_id = ?2",
                    params![line.original_sale_line_id, req.original_sale_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .optional()?;
            let (orig_variant, orig_unit, sold_qty, line_total, unit_cost_snapshot) = orig.ok_or_else(|| {
                PosError::Validation(format!(
                    "Sale line {} not found in sale {}",
                    line.original_sale_line_id, req.original_sale_id
                ))
            })?;
            if line.variant_id != orig_variant || line.unit_id != orig_unit {
                return Err(PosError::Validation(
                    "Returned item or unit does not match the item on the original receipt.".to_string(),
                ));
            }

            let (already_qty, already_refund): (i64, i64) = tx.query_row(
                "SELECT COALESCE(SUM(qty_milli), 0), COALESCE(SUM(refund_paisa), 0)
                 FROM sale_return_lines WHERE original_sale_line_id = ?1",
                params![line.original_sale_line_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            if already_qty + line.qty_milli > sold_qty {
                return Err(PosError::Validation(format!(
                    "Return quantity ({} milli) exceeds remaining eligible quantity ({} milli) for line {}",
                    line.qty_milli,
                    sold_qty - already_qty,
                    line.original_sale_line_id
                )));
            }

            // What the customer paid for this line after its share of the bill discount
            let paid_for_line = if sum_line_totals > 0 {
                mul_div_half_up(line_total, sale_total, sum_line_totals)
            } else {
                0
            };
            let cumulative_cap = mul_div_half_up(paid_for_line, already_qty + line.qty_milli, sold_qty);
            let max_refund_now = (cumulative_cap - already_refund).max(0);
            if line.refund_paisa > max_refund_now {
                return Err(PosError::Validation(format!(
                    "Refund {} paisa is more than the {} paisa paid for these items",
                    line.refund_paisa, max_refund_now
                )));
            }

            let factor = unit_factor(&tx, &orig_variant, &orig_unit)?;
            total_refund_paisa += line.refund_paisa;
            validated.push((line, orig_variant, factor, unit_cost_snapshot));
        }

        // 3. Return document number (inside the transaction)
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

        // 4. Header
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

        // 5. Lines and stock (always the ORIGINAL item, converted to base units)
        let mut restocked_count: usize = 0;
        for (line, orig_variant, factor, unit_cost_snapshot) in validated {
            let return_line_id = Ulid::new().to_string();
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

            let is_service: bool = tx
                .query_row(
                    "SELECT p.is_service FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                    params![orig_variant],
                    |r| r.get::<_, i64>(0),
                )
                .map(|v| v != 0)
                .unwrap_or(false);
            if line.restock_type == "sellable" && !is_service {
                InventoryRepo::record_movement(
                    &tx,
                    RecordMovementParams {
                        variant_id: orig_variant,
                        qty_signed_milli: mul_div_half_up(line.qty_milli, factor, 1000),
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

        // 6. Refund payout
        if total_refund_paisa > 0 {
            if req.refund_method == "credit" {
                let cust_id = party_id.as_deref().unwrap_or_default();
                let prev_bal = KhataRepo::get_balance(&tx, cust_id)?;
                tx.execute(
                    "INSERT INTO party_ledger (
                        id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at
                    ) VALUES (?1, ?2, 'return', 0, ?3, ?4, ?5, ?6)",
                    params![Ulid::new().to_string(), cust_id, total_refund_paisa, prev_bal - total_refund_paisa, doc_no, now],
                )
                .map_err(|e| PosError::Db(format!("Failed to record return customer credit: {}", e)))?;
            } else {
                tx.execute(
                    "INSERT INTO payments (
                        id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at
                    ) VALUES (?1, ?2, 'outbound', ?3, ?4, ?5, ?6, ?7)",
                    params![
                        Ulid::new().to_string(),
                        party_id,
                        req.refund_method,
                        total_refund_paisa,
                        doc_no,
                        req.cash_session_id,
                        now
                    ],
                )
                .map_err(|e| PosError::Db(format!("Failed to record refund payment: {}", e)))?;
            }
        }

        AuditRepo::write(
            &tx,
            None,
            "sale_returned",
            "sale_return",
            Some(&return_id),
            req.reason.as_deref(),
            Some(&format!(
                "{{\"doc_no\":\"{}\",\"original_sale_id\":\"{}\",\"refund_paisa\":{},\"method\":\"{}\"}}",
                doc_no, req.original_sale_id, total_refund_paisa, req.refund_method
            )),
        )?;

        // Cloud Sync Outbox: record refund event for multi-store synchronization
        let outbox_payload = serde_json::json!({
            "id": return_id,
            "doc_no": doc_no,
            "original_sale_id": req.original_sale_id,
            "refund_paisa": total_refund_paisa,
            "refund_method": req.refund_method,
        }).to_string();

        let _ = tx.execute(
            "INSERT INTO sync_outbox (event_id, event_type, payload_json, occurred_at) VALUES (?1, 'sale_refunded', ?2, ?3)",
            params![Ulid::new().to_string(), outbox_payload, now],
        );

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
