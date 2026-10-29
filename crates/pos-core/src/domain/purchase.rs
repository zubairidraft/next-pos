use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseInvoice {
    pub id: String,
    pub doc_no: String,
    pub vendor_id: String,
    pub vendor_name: String,
    pub vendor_invoice_no: Option<String>,
    pub status: String,
    pub freight_paisa: i64,
    pub total_paisa: i64,
    pub lines: Vec<PurchaseInvoiceLine>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseInvoiceLine {
    pub id: String,
    pub purchase_id: String,
    pub variant_id: String,
    pub product_name: String,
    pub sku: String,
    pub unit_id: String,
    pub unit_code: String,
    pub received_qty_milli: i64,
    pub unit_cost_paisa: i64,
    pub total_paisa: i64,
    pub effective_unit_cost_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePurchaseLineInput {
    pub variant_id: String,
    pub unit_id: String,
    pub received_qty_milli: i64,
    pub unit_cost_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePurchaseInput {
    pub vendor_id: String,
    pub vendor_invoice_no: Option<String>,
    pub freight_paisa: i64,
    pub lines: Vec<CreatePurchaseLineInput>,
    pub user_id: Option<String>,
}

pub struct PurchaseRepo;

impl PurchaseRepo {
    /// Generates next document number from document_sequences (e.g. PUR-000001).
    pub fn next_doc_no(conn: &Connection, doc_type: &str) -> Result<String> {
        let (prefix, next_no): (String, i64) = conn
            .query_row(
                "SELECT prefix, next_no FROM document_sequences WHERE doc_type = ?1",
                params![doc_type],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| PosError::Db(format!("Failed to read document sequence for {}: {}", doc_type, e)))?;

        conn.execute(
            "UPDATE document_sequences SET next_no = next_no + 1 WHERE doc_type = ?1",
            params![doc_type],
        )
        .map_err(|e| PosError::Db(format!("Failed to increment document sequence: {}", e)))?;

        Ok(format!("{}{:06}", prefix, next_no))
    }

    /// Allocates landed cost (freight/expenses) proportionally across lines by line value.
    /// Returns vector of (effective_line_total_paisa, effective_unit_cost_paisa) per line.
    pub fn allocate_landed_cost(
        lines: &[CreatePurchaseLineInput],
        freight_paisa: i64,
    ) -> Result<Vec<(i64, i64)>> {
        if lines.is_empty() {
            return Err(PosError::Validation("Purchase invoice must have at least one line".to_string()));
        }

        let line_totals: Vec<i64> = lines
            .iter()
            .map(|l| (l.received_qty_milli * l.unit_cost_paisa) / 1000)
            .collect();

        let subtotal: i64 = line_totals.iter().sum();
        let mut results = Vec::with_capacity(lines.len());

        if freight_paisa == 0 || subtotal == 0 {
            for (idx, line) in lines.iter().enumerate() {
                let total = line_totals[idx];
                let unit_cost = if line.received_qty_milli > 0 {
                    (total * 1000) / line.received_qty_milli
                } else {
                    line.unit_cost_paisa
                };
                results.push((total, unit_cost));
            }
            return Ok(results);
        }

        // Proportional distribution
        let mut allocated_freight_sum: i64 = 0;
        let mut freight_shares = Vec::with_capacity(lines.len());
        let mut max_idx = 0;
        let mut max_val = -1;

        for (idx, &total) in line_totals.iter().enumerate() {
            let share = (total * freight_paisa) / subtotal;
            freight_shares.push(share);
            allocated_freight_sum += share;
            if total > max_val {
                max_val = total;
                max_idx = idx;
            }
        }

        // Remainder adjustment on largest line
        let remainder = freight_paisa - allocated_freight_sum;
        freight_shares[max_idx] += remainder;

        for (idx, line) in lines.iter().enumerate() {
            let effective_total = line_totals[idx] + freight_shares[idx];
            let effective_unit_cost = if line.received_qty_milli > 0 {
                (effective_total * 1000) / line.received_qty_milli
            } else {
                line.unit_cost_paisa
            };
            results.push((effective_total, effective_unit_cost));
        }

        Ok(results)
    }

    /// Calculates new Weighted-Average Cost (WAC) based on current stock and inbound purchase.
    pub fn calculate_new_avg_cost(
        current_on_hand_milli: i64,
        current_avg_cost_paisa: i64,
        inbound_qty_milli: i64,
        inbound_unit_cost_paisa: i64,
    ) -> i64 {
        if inbound_qty_milli <= 0 {
            return current_avg_cost_paisa;
        }

        if current_on_hand_milli <= 0 {
            return inbound_unit_cost_paisa;
        }

        let current_val = (current_on_hand_milli * current_avg_cost_paisa) / 1000;
        let inbound_val = (inbound_qty_milli * inbound_unit_cost_paisa) / 1000;
        let total_qty = current_on_hand_milli + inbound_qty_milli;

        if total_qty == 0 {
            return inbound_unit_cost_paisa;
        }

        ((current_val + inbound_val) * 1000) / total_qty
    }

    /// Records and posts a complete purchase invoice atomically.
    pub fn post_purchase(conn: &mut Connection, input: CreatePurchaseInput) -> Result<PurchaseInvoice> {
        if input.lines.is_empty() {
            return Err(PosError::Validation("Purchase invoice must have at least one line".to_string()));
        }

        // Validate vendor exists
        let vendor_name: String = conn
            .query_row(
                "SELECT name FROM parties WHERE id = ?1",
                params![input.vendor_id],
                |row| row.get(0),
            )
            .map_err(|_| PosError::NotFound(format!("Vendor {} does not exist", input.vendor_id)))?;

        let doc_no = Self::next_doc_no(conn, "purchase")?;
        let purchase_id = Ulid::new().to_string();
        let now = Utc::now().to_rfc3339();

        // Calculate landed cost allocations
        let allocations = Self::allocate_landed_cost(&input.lines, input.freight_paisa)?;
        let lines_subtotal: i64 = input
            .lines
            .iter()
            .map(|l| (l.received_qty_milli * l.unit_cost_paisa) / 1000)
            .sum();
        let total_invoice_paisa = lines_subtotal + input.freight_paisa;

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

        // 1. Insert purchase invoice
        tx.execute(
            "INSERT INTO purchases (id, doc_no, vendor_id, vendor_invoice_no, status, freight_paisa, total_paisa, created_at)
             VALUES (?1, ?2, ?3, ?4, 'received', ?5, ?6, ?7)",
            params![
                purchase_id,
                doc_no,
                input.vendor_id,
                input.vendor_invoice_no,
                input.freight_paisa,
                total_invoice_paisa,
                now,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert purchase: {}", e)))?;

        let mut lines = Vec::new();

        // 2. Insert lines, stock movements, and update WAC
        for (idx, line_input) in input.lines.iter().enumerate() {
            let line_id = Ulid::new().to_string();
            let (effective_line_total, effective_unit_cost) = allocations[idx];
            let base_line_total = (line_input.received_qty_milli * line_input.unit_cost_paisa) / 1000;

            tx.execute(
                "INSERT INTO purchase_lines (id, purchase_id, variant_id, unit_id, received_qty_milli, unit_cost_paisa, total_paisa)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    line_id,
                    purchase_id,
                    line_input.variant_id,
                    line_input.unit_id,
                    line_input.received_qty_milli,
                    effective_unit_cost,
                    effective_line_total,
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert purchase line: {}", e)))?;

            // Fetch current on hand and avg cost
            let current_balance = InventoryRepo::get_balance(&tx, &line_input.variant_id)?;
            let (cur_on_hand, cur_avg_cost) = match current_balance {
                Some(b) => (b.on_hand_milli, b.avg_cost_paisa),
                None => (0, 0),
            };

            let new_avg_cost = Self::calculate_new_avg_cost(
                cur_on_hand,
                cur_avg_cost,
                line_input.received_qty_milli,
                effective_unit_cost,
            );

            // Record inbound stock movement
            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: line_input.variant_id.clone(),
                    qty_signed_milli: line_input.received_qty_milli,
                    movement_type: "purchase".to_string(),
                    source_doc: doc_no.clone(),
                    source_line: Some(line_id.clone()),
                    unit_cost_paisa: effective_unit_cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: input.user_id.clone(),
                },
            )?;

            // Update average cost in inventory_balances
            InventoryRepo::update_avg_cost(&tx, &line_input.variant_id, new_avg_cost)?;

            // Fetch product and unit meta for return struct
            let (p_name, sku, unit_code): (String, String, String) = tx
                .query_row(
                    "SELECT p.name, p.sku, u.code
                     FROM product_variants pv
                     JOIN products p ON pv.product_id = p.id
                     JOIN units u ON ?1 = u.id
                     WHERE pv.id = ?2",
                    params![line_input.unit_id, line_input.variant_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap_or_else(|_| ("Unknown Product".to_string(), "".to_string(), "PCS".to_string()));

            lines.push(PurchaseInvoiceLine {
                id: line_id,
                purchase_id: purchase_id.clone(),
                variant_id: line_input.variant_id.clone(),
                product_name: p_name,
                sku,
                unit_id: line_input.unit_id.clone(),
                unit_code,
                received_qty_milli: line_input.received_qty_milli,
                unit_cost_paisa: line_input.unit_cost_paisa,
                total_paisa: base_line_total,
                effective_unit_cost_paisa: effective_unit_cost,
            });
        }

        // 3. Post vendor Khata party_ledger entry (Credit increases accounts payable)
        let ledger_id = Ulid::new().to_string();
        let prev_balance: i64 = tx
            .query_row(
                "SELECT balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
                params![input.vendor_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| {
                // If no ledger entry yet, check opening balance
                tx.query_row(
                    "SELECT opening_balance_paisa FROM parties WHERE id = ?1",
                    params![input.vendor_id],
                    |row| row.get(0),
                )
                .unwrap_or(0)
            });

        let new_party_balance = prev_balance + total_invoice_paisa;

        tx.execute(
            "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
             VALUES (?1, ?2, 'purchase', 0, ?3, ?4, ?5, ?6)",
            params![
                ledger_id,
                input.vendor_id,
                total_invoice_paisa,
                new_party_balance,
                doc_no,
                now,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert vendor ledger entry: {}", e)))?;

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit purchase invoice: {}", e)))?;

        Ok(PurchaseInvoice {
            id: purchase_id,
            doc_no,
            vendor_id: input.vendor_id,
            vendor_name,
            vendor_invoice_no: input.vendor_invoice_no,
            status: "received".to_string(),
            freight_paisa: input.freight_paisa,
            total_paisa: total_invoice_paisa,
            lines,
            created_at: now,
        })
    }

    /// Lists recent purchase invoices.
    pub fn list_purchases(conn: &Connection, limit: usize) -> Result<Vec<PurchaseInvoice>> {
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.doc_no, p.vendor_id, pt.name as vendor_name,
                        p.vendor_invoice_no, p.status, p.freight_paisa, p.total_paisa, p.created_at
                 FROM purchases p
                 JOIN parties pt ON p.vendor_id = pt.id
                 ORDER BY p.created_at DESC, p.doc_no DESC
                 LIMIT ?1",
            )
            .map_err(|e| PosError::Db(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(PurchaseInvoice {
                    id: row.get(0)?,
                    doc_no: row.get(1)?,
                    vendor_id: row.get(2)?,
                    vendor_name: row.get(3)?,
                    vendor_invoice_no: row.get(4)?,
                    status: row.get(5)?,
                    freight_paisa: row.get(6)?,
                    total_paisa: row.get(7)?,
                    lines: Vec::new(),
                    created_at: row.get(8)?,
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
