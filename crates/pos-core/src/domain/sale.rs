use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::domain::audit::AuditRepo;
use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::khata::KhataRepo;
use crate::domain::purchase::PurchaseRepo;
use crate::error::{PosError, Result};
use crate::money::mul_div_half_up;

/// Tender methods accepted at checkout. `credit` means "post to customer khata".
pub const TENDER_METHODS: [&str; 8] = [
    "cash", "card", "jazzcash", "easypaisa", "raast", "bank", "cheque", "credit",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentTenderInput {
    pub method: String, // one of TENDER_METHODS
    pub amount_paisa: i64,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSaleLineInput {
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
    /// Price shown at the counter. Must match the catalog price for this unit
    /// (retail, or the customer's price list) unless `price_override_by` is set.
    pub unit_price_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    /// User id of the Owner/Manager who approved a price different from the catalog.
    #[serde(default)]
    pub price_override_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostSaleRequest {
    pub customer_id: Option<String>,
    pub cash_session_id: Option<String>,
    pub lines: Vec<PostSaleLineInput>,
    pub global_discount_paisa: i64,
    pub tenders: Vec<PaymentTenderInput>,
    pub user_id: Option<String>,
    /// User id of the Owner/Manager who approved going over the customer's credit limit.
    #[serde(default)]
    pub credit_override_by: Option<String>,
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

/// Packaging factor (milli base units per 1 sale unit) for a variant/unit pair.
pub(crate) fn unit_factor(conn: &Connection, variant_id: &str, unit_id: &str) -> Result<i64> {
    let factor: Option<i64> = conn
        .query_row(
            "SELECT factor_to_base FROM variant_units WHERE variant_id = ?1 AND unit_id = ?2 LIMIT 1",
            params![variant_id, unit_id],
            |r| r.get(0),
        )
        .optional()?;
    match factor {
        Some(f) if f > 0 => Ok(f),
        _ => Err(PosError::Validation(format!(
            "Unit {} is not configured for product variant {}",
            unit_id, variant_id
        ))),
    }
}

/// Catalog price for one sale unit from a price list. Falls back to the base-unit
/// price scaled by the packaging factor when no unit-specific price exists.
fn catalog_price(
    conn: &Connection,
    variant_id: &str,
    unit_id: &str,
    factor: i64,
    price_list_id: &str,
) -> Result<Option<i64>> {
    let direct: Option<i64> = conn
        .query_row(
            "SELECT price_paisa FROM prices WHERE variant_id = ?1 AND unit_id = ?2 AND price_list_id = ?3",
            params![variant_id, unit_id, price_list_id],
            |r| r.get(0),
        )
        .optional()?;
    if direct.is_some() {
        return Ok(direct);
    }
    let base: Option<i64> = conn
        .query_row(
            "SELECT p.price_paisa FROM prices p
             JOIN variant_units vu ON vu.variant_id = p.variant_id AND vu.unit_id = p.unit_id
             WHERE p.variant_id = ?1 AND p.price_list_id = ?2 AND vu.factor_to_base = 1000
             LIMIT 1",
            params![variant_id, price_list_id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(base.map(|b| mul_div_half_up(b, factor, 1000)))
}

impl SaleRepo {
    /// Atomically posts a completed sale in one `BEGIN IMMEDIATE` transaction:
    /// validates every line against the catalog, deducts stock in base units,
    /// records net cash and other tenders, posts khata credit (with credit-limit
    /// enforcement), allocates the invoice number and writes the audit trail.
    pub fn post_sale(conn: &mut Connection, req: PostSaleRequest) -> Result<CompletedSale> {
        if req.lines.is_empty() {
            return Err(PosError::Validation("Cannot post sale without items".to_string()));
        }
        if req.global_discount_paisa < 0 {
            return Err(PosError::Validation("Bill discount cannot be negative".to_string()));
        }
        for t in &req.tenders {
            if !TENDER_METHODS.contains(&t.method.as_str()) {
                return Err(PosError::Validation(format!("Unknown payment method '{}'", t.method)));
            }
            if t.amount_paisa <= 0 {
                return Err(PosError::Validation("Each payment amount must be greater than zero".to_string()));
            }
        }
        let credit_paisa: i64 = req.tenders.iter().filter(|t| t.method == "credit").map(|t| t.amount_paisa).sum();
        if credit_paisa > 0 && req.customer_id.is_none() {
            return Err(PosError::Validation(
                "Credit sale requires selecting a valid registered customer".to_string(),
            ));
        }

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| PosError::Db(format!("Failed to start transaction: {}", e)))?;

        // Customer must exist and be a customer; their price list unlocks wholesale prices.
        let customer: Option<(String, Option<String>)> = match &req.customer_id {
            Some(cid) => {
                let row: Option<(String, String, Option<String>)> = tx
                    .query_row(
                        "SELECT name, party_type, price_list_id FROM parties WHERE id = ?1 AND active = 1",
                        params![cid],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                    )
                    .optional()?;
                match row {
                    Some((name, ptype, list)) if ptype == "customer" || ptype == "both" => Some((name, list)),
                    Some(_) => return Err(PosError::Validation("Selected party is not a customer".to_string())),
                    None => return Err(PosError::NotFound(format!("Customer {} not found", cid))),
                }
            }
            None => None,
        };
        let customer_list = customer.as_ref().and_then(|c| c.1.clone());

        // ---- Validate and price every line before writing anything ----
        struct Priced {
            input: PostSaleLineInput,
            factor: i64,
            gross: i64,
        }
        let mut priced = Vec::with_capacity(req.lines.len());
        let mut subtotal_paisa: i64 = 0;
        let mut line_discounts_paisa: i64 = 0;
        let mut tax_paisa: i64 = 0;

        for line in &req.lines {
            if line.qty_milli <= 0 {
                return Err(PosError::Validation("Quantity must be greater than zero".to_string()));
            }
            if line.unit_price_paisa < 0 || line.discount_paisa < 0 || line.tax_paisa < 0 {
                return Err(PosError::Validation("Price, discount and tax cannot be negative".to_string()));
            }
            let factor = unit_factor(&tx, &line.variant_id, &line.unit_id)?;

            let mut allowed: Vec<i64> = Vec::new();
            if let Some(p) = catalog_price(&tx, &line.variant_id, &line.unit_id, factor, "retail")? {
                allowed.push(p);
            }
            if let Some(list) = customer_list.as_deref() {
                if list != "retail" {
                    if let Some(p) = catalog_price(&tx, &line.variant_id, &line.unit_id, factor, list)? {
                        allowed.push(p);
                    }
                }
            }
            if !allowed.contains(&line.unit_price_paisa) {
                match &line.price_override_by {
                    Some(approver) => AuditRepo::require_manager(&tx, approver, "Changing the selling price")?,
                    None => {
                        return Err(PosError::BusinessRule(format!(
                            "Price {} paisa does not match the catalog price {:?} for this item; manager approval required",
                            line.unit_price_paisa, allowed
                        )))
                    }
                }
            }

            let gross = mul_div_half_up(line.qty_milli, line.unit_price_paisa, 1000);
            if line.discount_paisa > gross {
                return Err(PosError::Validation("Line discount cannot be larger than the line amount".to_string()));
            }
            subtotal_paisa += gross;
            line_discounts_paisa += line.discount_paisa;
            tax_paisa += line.tax_paisa;
            priced.push(Priced { input: line.clone(), factor, gross });
        }

        if req.global_discount_paisa > subtotal_paisa - line_discounts_paisa {
            return Err(PosError::Validation("Bill discount cannot be larger than the bill".to_string()));
        }
        let total_discount_paisa = line_discounts_paisa + req.global_discount_paisa;
        let grand_total_paisa = subtotal_paisa - total_discount_paisa + tax_paisa;

        // ---- Tenders: only cash can produce change ----
        let total_tendered: i64 = req.tenders.iter().map(|t| t.amount_paisa).sum();
        if total_tendered < grand_total_paisa {
            return Err(PosError::Validation(format!(
                "Insufficient payment: grand total is {} Paisa but tendered only {} Paisa",
                grand_total_paisa, total_tendered
            )));
        }
        let cash_paisa: i64 = req.tenders.iter().filter(|t| t.method == "cash").map(|t| t.amount_paisa).sum();
        let non_cash_paisa = total_tendered - cash_paisa;
        if non_cash_paisa > grand_total_paisa {
            return Err(PosError::Validation(
                "Card, digital and khata payments cannot exceed the bill; change is only given from cash".to_string(),
            ));
        }
        let change_paisa = total_tendered - grand_total_paisa; // always <= cash_paisa here

        // ---- Credit limit ----
        if credit_paisa > 0 {
            let cust_id = req.customer_id.as_deref().unwrap_or_default();
            let check = KhataRepo::check_credit_limit(&tx, cust_id, credit_paisa)?;
            if !check.allowed {
                match &req.credit_override_by {
                    Some(approver) => AuditRepo::require_manager(&tx, approver, "Exceeding the customer credit limit")?,
                    None => {
                        return Err(PosError::BusinessRule(format!(
                            "Credit limit exceeded: balance would be {} Paisa against a limit of {} Paisa; manager approval required",
                            check.resulting_balance_paisa, check.credit_limit_paisa
                        )))
                    }
                }
            }
        }

        // ---- Write ----
        let sale_id = Ulid::new().to_string();
        let doc_no = PurchaseRepo::next_doc_no(&tx, "sale")?;
        let now = Utc::now().to_rfc3339();

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

        let mut lines_dto = Vec::with_capacity(priced.len());
        for p in &priced {
            let line = &p.input;
            let line_id = Ulid::new().to_string();
            let base_qty_milli = mul_div_half_up(line.qty_milli, p.factor, 1000);

            // Average cost per base unit; when no balance exists yet, use the latest receipt cost.
            let avg_cost = match InventoryRepo::get_balance(&tx, &line.variant_id)? {
                Some(b) if b.avg_cost_paisa > 0 => b.avg_cost_paisa,
                _ => tx
                    .query_row(
                        "SELECT unit_cost_paisa FROM stock_movements
                         WHERE variant_id = ?1 AND qty_signed_milli > 0 AND unit_cost_paisa > 0
                         ORDER BY occurred_at DESC, id DESC LIMIT 1",
                        params![line.variant_id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .unwrap_or(0),
            };
            let cogs_paisa = mul_div_half_up(base_qty_milli, avg_cost, 1000);
            let line_total = p.gross - line.discount_paisa + line.tax_paisa;

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

            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: line.variant_id.clone(),
                    qty_signed_milli: -base_qty_milli,
                    movement_type: "sale".to_string(),
                    source_doc: doc_no.clone(),
                    source_line: Some(line_id.clone()),
                    unit_cost_paisa: avg_cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: req.user_id.clone(),
                },
            )?;

            if let Some(approver) = &line.price_override_by {
                AuditRepo::write(
                    &tx,
                    Some(approver),
                    "price_override",
                    "sale_line",
                    Some(&line_id),
                    None,
                    Some(&format!(
                        "{{\"doc_no\":\"{}\",\"unit_price_paisa\":{}}}",
                        doc_no, line.unit_price_paisa
                    )),
                )?;
            }

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

        // ---- Payments ----
        // Cash is stored NET of change, so the drawer expectation equals real cash kept.
        if cash_paisa > 0 {
            let net_cash = cash_paisa - change_paisa;
            if net_cash > 0 {
                let reference = format!("{} (received {}, change {})", doc_no, cash_paisa, change_paisa);
                tx.execute(
                    "INSERT INTO payments (id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at)
                     VALUES (?1, ?2, 'inbound', 'cash', ?3, ?4, ?5, ?6)",
                    params![Ulid::new().to_string(), req.customer_id, net_cash, reference, req.cash_session_id, now],
                )
                .map_err(|e| PosError::Db(format!("Failed to record cash payment: {}", e)))?;
            }
        }
        for tender in req.tenders.iter().filter(|t| t.method != "cash" && t.method != "credit") {
            tx.execute(
                "INSERT INTO payments (id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at)
                 VALUES (?1, ?2, 'inbound', ?3, ?4, ?5, ?6, ?7)",
                params![
                    Ulid::new().to_string(),
                    req.customer_id,
                    tender.method,
                    tender.amount_paisa,
                    tender.reference.clone().unwrap_or_else(|| doc_no.clone()),
                    req.cash_session_id,
                    now,
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to record payment tender: {}", e)))?;
        }
        if credit_paisa > 0 {
            let cust_id = req.customer_id.as_deref().unwrap_or_default();
            let prev_balance = KhataRepo::get_balance(&tx, cust_id)?; // includes opening balance
            tx.execute(
                "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                 VALUES (?1, ?2, 'sale', ?3, 0, ?4, ?5, ?6)",
                params![Ulid::new().to_string(), cust_id, credit_paisa, prev_balance + credit_paisa, doc_no, now],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert customer credit entry: {}", e)))?;
            if let Some(approver) = &req.credit_override_by {
                AuditRepo::write(&tx, Some(approver), "credit_limit_override", "sale", Some(&sale_id), None, None)?;
            }
        }

        AuditRepo::write(
            &tx,
            req.user_id.as_deref(),
            "sale_posted",
            "sale",
            Some(&sale_id),
            None,
            Some(&format!(
                "{{\"doc_no\":\"{}\",\"total_paisa\":{},\"discount_paisa\":{},\"credit_paisa\":{}}}",
                doc_no, grand_total_paisa, total_discount_paisa, credit_paisa
            )),
        )?;

        // Cloud Sync Outbox: record event for multi-store background synchronization
        let outbox_payload = serde_json::json!({
            "id": sale_id,
            "doc_no": doc_no,
            "subtotal_paisa": subtotal_paisa,
            "discount_paisa": total_discount_paisa,
            "tax_paisa": tax_paisa,
            "grand_total_paisa": grand_total_paisa,
            "customer_id": req.customer_id,
        }).to_string();

        let _ = tx.execute(
            "INSERT INTO sync_outbox (event_id, event_type, payload_json, occurred_at) VALUES (?1, 'sale_posted', ?2, ?3)",
            params![Ulid::new().to_string(), outbox_payload, now],
        );

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit sale transaction: {}", e)))?;

        Ok(CompletedSale {
            id: sale_id,
            doc_no,
            customer_id: req.customer_id,
            customer_name: customer.map(|c| c.0),
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
