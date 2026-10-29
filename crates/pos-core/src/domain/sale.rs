use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::purchase::PurchaseRepo;
use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentTenderInput {
    pub method: String, // 'cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'credit'
    pub amount_paisa: i64,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSaleLineInput {
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
    pub unit_price_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSaleRequest {
    pub customer_id: Option<String>,
    pub cash_session_id: Option<String>,
    pub lines: Vec<PostSaleLineInput>,
    pub global_discount_paisa: i64,
    pub tenders: Vec<PaymentTenderInput>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleLineDto {
    pub id: String,
    pub variant_id: String,
    pub product_name: String,
    pub sku: String,
    pub unit_code: String,
    pub qty_milli: i64,
    pub unit_price_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub total_paisa: i64,
    pub cogs_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedSale {
    pub id: String,
    pub doc_no: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub total_paisa: i64,
    pub tendered_paisa: i64,
    pub change_paisa: i64,
    pub lines: Vec<SaleLineDto>,
    pub tenders: Vec<PaymentTenderInput>,
    pub created_at: String,
}

pub struct SaleRepo;

impl SaleRepo {
    /// Atomically posts a completed sale in an immediate transaction:
    /// 1. Inserts into sales and sale_lines with COGS snapshot
    /// 2. Deducts inventory in stock_movements with strict negative stock policy check
    /// 3. Records inbound payments for all tenders
    /// 4. Updates customer Khata if credit is tendered
    pub fn post_sale(conn: &mut Connection, req: PostSaleRequest) -> Result<CompletedSale> {
        if req.lines.is_empty() {
            return Err(PosError::Validation("Cannot post sale without items".to_string()));
        }

        // Calculate subtotals
        let mut subtotal_paisa: i64 = 0;
        let mut line_discounts_paisa: i64 = 0;
        let mut tax_paisa: i64 = 0;

        for line in &req.lines {
            let line_gross = (line.qty_milli * line.unit_price_paisa) / 1000;
            subtotal_paisa += line_gross;
            line_discounts_paisa += line.discount_paisa;
            tax_paisa += line.tax_paisa;
        }

        let total_discount_paisa = line_discounts_paisa + req.global_discount_paisa;
        let grand_total_paisa = subtotal_paisa - total_discount_paisa + tax_paisa;

        // Tender validation
        let total_tendered: i64 = req.tenders.iter().map(|t| t.amount_paisa).sum();
        if total_tendered < grand_total_paisa {
            return Err(PosError::Validation(format!(
                "Insufficient payment: grand total is {} Paisa but tendered only {} Paisa",
                grand_total_paisa, total_tendered
            )));
        }

        let change_paisa = total_tendered - grand_total_paisa;

        // Customer credit validation
        for t in &req.tenders {
            if t.method == "credit" && req.customer_id.is_none() {
                return Err(PosError::Validation(
                    "Credit sale requires selecting a valid registered customer".to_string(),
                ));
            }
        }

        let sale_id = Ulid::new().to_string();
        let doc_no = PurchaseRepo::next_doc_no(conn, "sale")?;
        let now = Utc::now().to_rfc3339();

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to start transaction: {}", e)))?;

        // 1. Insert sales header
        tx.execute(
            "INSERT INTO sales (
                id, doc_no, status, party_id, cash_session_id,
                subtotal_paisa, discount_paisa, tax_paisa, total_paisa, created_at
            ) VALUES (?1, ?2, 'posted', ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                sale_id,
                doc_no,
                req.customer_id,
                req.cash_session_id,
                subtotal_paisa,
                total_discount_paisa,
                tax_paisa,
                grand_total_paisa,
                now,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert sale header: {}", e)))?;

        let mut lines_dto = Vec::with_capacity(req.lines.len());

        // 2. Insert sale lines and record stock deductions
        for line in &req.lines {
            let line_id = Ulid::new().to_string();

            // Fetch average cost snapshot for COGS
            let cur_balance = InventoryRepo::get_balance(&tx, &line.variant_id)?;
            let avg_cost = match cur_balance {
                Some(b) => b.avg_cost_paisa,
                None => 0,
            };
            let cogs_paisa = (line.qty_milli * avg_cost) / 1000;
            let line_gross = (line.qty_milli * line.unit_price_paisa) / 1000;
            let line_total = line_gross - line.discount_paisa + line.tax_paisa;

            tx.execute(
                "INSERT INTO sale_lines (
                    id, sale_id, variant_id, unit_id, qty_milli, unit_price_paisa,
                    discount_paisa, tax_paisa, total_paisa, unit_cost_snapshot_paisa, cogs_paisa
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    line_id,
                    sale_id,
                    line.variant_id,
                    line.unit_id,
                    line.qty_milli,
                    line.unit_price_paisa,
                    line.discount_paisa,
                    line.tax_paisa,
                    line_total,
                    avg_cost,
                    cogs_paisa,
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert sale line: {}", e)))?;

            // Deduct stock immutably (Strict negative stock policy checked inside InventoryRepo)
            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: line.variant_id.clone(),
                    qty_signed_milli: -line.qty_milli,
                    movement_type: "sale".to_string(),
                    source_doc: doc_no.clone(),
                    source_line: Some(line_id.clone()),
                    unit_cost_paisa: avg_cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: req.user_id.clone(),
                },
            )?;

            // Query metadata for return
            let (p_name, sku, u_code): (String, String, String) = tx
                .query_row(
                    "SELECT p.name, p.sku, u.code
                     FROM product_variants pv
                     JOIN products p ON pv.product_id = p.id
                     JOIN units u ON ?1 = u.id
                     WHERE pv.id = ?2",
                    params![line.unit_id, line.variant_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap_or_else(|_| ("Product".to_string(), "".to_string(), "PCS".to_string()));

            lines_dto.push(SaleLineDto {
                id: line_id,
                variant_id: line.variant_id.clone(),
                product_name: p_name,
                sku,
                unit_code: u_code,
                qty_milli: line.qty_milli,
                unit_price_paisa: line.unit_price_paisa,
                discount_paisa: line.discount_paisa,
                tax_paisa: line.tax_paisa,
                total_paisa: line_total,
                cogs_paisa,
            });
        }

        // 3. Record payments & Khata receivables
        for tender in &req.tenders {
            if tender.method == "credit" {
                // If credit tender (Khata), record customer debit in party_ledger
                if let Some(ref cust_id) = req.customer_id {
                    let prev_balance: i64 = tx
                        .query_row(
                            "SELECT balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
                            params![cust_id],
                            |row| row.get(0),
                        )
                        .unwrap_or(0);

                    let new_bal = prev_balance + tender.amount_paisa;
                    let ledger_id = Ulid::new().to_string();

                    tx.execute(
                        "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                         VALUES (?1, ?2, 'sale', ?3, 0, ?4, ?5, ?6)",
                        params![ledger_id, cust_id, tender.amount_paisa, new_bal, doc_no, now],
                    )
                    .map_err(|e| PosError::Db(format!("Failed to insert customer credit entry: {}", e)))?;
                }
            } else {
                let payment_id = Ulid::new().to_string();
                tx.execute(
                    "INSERT INTO payments (
                        id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at
                    ) VALUES (?1, ?2, 'inbound', ?3, ?4, ?5, ?6, ?7)",
                    params![
                        payment_id,
                        req.customer_id,
                        tender.method,
                        tender.amount_paisa,
                        tender.reference,
                        req.cash_session_id,
                        now,
                    ],
                )
                .map_err(|e| PosError::Db(format!("Failed to record payment tender: {}", e)))?;
            }
        }

        // Query customer name if set
        let customer_name = req.customer_id.as_ref().and_then(|cid| {
            tx.query_row(
                "SELECT name FROM parties WHERE id = ?1",
                params![cid],
                |r| r.get(0),
            )
            .ok()
        });

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit sale transaction: {}", e)))?;

        Ok(CompletedSale {
            id: sale_id,
            doc_no,
            customer_id: req.customer_id,
            customer_name,
            subtotal_paisa,
            discount_paisa: total_discount_paisa,
            tax_paisa,
            total_paisa: grand_total_paisa,
            tendered_paisa: total_tendered,
            change_paisa,
            lines: lines_dto,
            tenders: req.tenders,
            created_at: now,
        })
    }
}
