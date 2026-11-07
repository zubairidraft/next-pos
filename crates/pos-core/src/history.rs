//! Sale and purchase history listing, detail inspection, revision snapshots,
//! and full transactional editing with stock reversal, khata settlement,
//! WAC recalculation, and audit trail.

use chrono::{DateTime, Duration, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ulid::Ulid;

use super::{now, PosApp};
use crate::auth::Permission;
use crate::domain::audit::AuditRepo;
use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::khata::KhataRepo;
use crate::domain::purchase::{CreatePurchaseLineInput, PurchaseInvoice, PurchaseInvoiceLine, PurchaseRepo};
use crate::domain::sale::{
    catalog_price, unit_factor, PaymentTenderInput, PostSaleLineInput,
    SaleRepo,
};
use crate::domain::shift::ShiftRepo;
use crate::error::{PosError, Result};
use crate::money::{mul_div_half_up, Paisa};

fn format_milli_qty(milli: i64) -> String {
    if milli % 1000 == 0 {
        format!("{}", milli / 1000)
    } else if milli % 100 == 0 {
        format!("{:.1}", milli as f64 / 1000.0)
    } else if milli % 10 == 0 {
        format!("{:.2}", milli as f64 / 1000.0)
    } else {
        format!("{:.3}", milli as f64 / 1000.0)
    }
}

// ---------------------------------------------------------------- DTOs

#[derive(Debug, Clone, Deserialize)]
pub struct SaleListQuery {
    pub from: String,          // "YYYY-MM-DD" local date or RFC3339
    pub to: String,            // inclusive
    pub offset_min: i32,       // shop time zone (Pakistan = 300)
    pub query: Option<String>, // doc no, customer name/phone, product name/sku/barcode
    pub limit: Option<usize>,  // default 200, max 1000
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaleListRow {
    pub id: String,
    pub doc_no: String,
    pub created_at: String,
    pub customer_name: Option<String>,
    pub salesman: Option<String>,
    pub item_count: i64,
    pub total_paisa: i64,
    pub paid_text: String,
    pub status: String,
    pub revision: i64,
    pub returned_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentRow {
    pub id: String,
    pub method: String,
    pub amount_paisa: i64,
    pub reference: Option<String>,
    pub direction: String,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnSummary {
    pub id: String,
    pub doc_no: String,
    pub refund_paisa: i64,
    pub created_at: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevisionRow {
    pub revision: i64,
    pub reason: String,
    pub edited_by: Option<String>,
    pub edited_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaleDetail {
    pub receipt: super::ReceiptData,
    pub payments: Vec<PaymentRow>,
    pub credit_paisa: i64,
    pub returns: Vec<ReturnSummary>,
    pub revisions: Vec<RevisionRow>,
    pub can_edit: bool,
    pub edit_blocked_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EditSaleInput {
    pub sale_id: String,
    pub expected_revision: i64,
    pub customer_id: Option<String>,
    pub lines: Vec<super::CheckoutLineInput>,
    #[serde(default)]
    pub global_discount_paisa: i64,
    #[serde(default)]
    pub settlement: Vec<PaymentTenderInput>,
    #[serde(default)]
    pub refund_to_khata: bool,
    pub reason: String,
    #[serde(default)]
    pub approval: Option<super::ApprovalInput>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaleEditPreview {
    pub old_total_paisa: i64,
    pub new_total_paisa: i64,
    pub diff_paisa: i64,
    pub stock_warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PurchaseListQuery {
    pub from: String,
    pub to: String,
    pub offset_min: i32,
    pub query: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PurchaseListRow {
    pub id: String,
    pub doc_no: String,
    pub created_at: String,
    pub vendor_name: String,
    pub vendor_invoice_no: Option<String>,
    pub item_count: i64,
    pub freight_paisa: i64,
    pub total_paisa: i64,
    pub status: String,
    pub revision: i64,
    pub returned_paisa: i64,
    pub entered_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnSummary {
    pub id: String,
    pub doc_no: String,
    pub total_paisa: i64,
    pub created_at: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PurchaseDetail {
    pub invoice: PurchaseInvoice,
    pub returns: Vec<PurchaseReturnSummary>,
    pub paid_paisa: i64,
    pub revisions: Vec<RevisionRow>,
    pub can_edit: bool,
    pub edit_blocked_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EditPurchaseInput {
    pub purchase_id: String,
    pub expected_revision: i64,
    pub vendor_id: String,
    pub vendor_invoice_no: Option<String>,
    pub freight_paisa: i64,
    pub lines: Vec<CreatePurchaseLineInput>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PurchaseEditPreview {
    pub old_total_paisa: i64,
    pub new_total_paisa: i64,
    pub diff_paisa: i64,
    pub vendor_diff_text: String,
}

// ---------------------------------------------------------------- Helpers

fn parse_local_date_range(from: &str, to: &str, offset_min: i32) -> Result<(String, String)> {
    let parse_point = |s: &str, is_end: bool| -> Result<DateTime<Utc>> {
        let trimmed = s.trim();
        if trimmed.contains('T') {
            return DateTime::parse_from_rfc3339(trimmed)
                .map(|d| d.with_timezone(&Utc))
                .map_err(|_| PosError::Validation(format!("Invalid date '{}'", s)));
        }
        let nd = NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
            .map_err(|_| PosError::Validation(format!("Invalid date '{}', expected YYYY-MM-DD", s)))?;
        let naive_dt = if is_end {
            nd.and_hms_micro_opt(23, 59, 59, 999_999)
        } else {
            nd.and_hms_opt(0, 0, 0)
        }
        .unwrap();
        let utc_dt = DateTime::<Utc>::from_naive_utc_and_offset(naive_dt, Utc)
            - Duration::minutes(offset_min as i64);
        Ok(utc_dt)
    };

    let start = parse_point(from, false)?;
    let end = parse_point(to, true)?;
    if end < start {
        return Err(PosError::Validation("The 'to' date is before the 'from' date".into()));
    }
    Ok((start.to_rfc3339(), end.to_rfc3339()))
}

fn build_paid_text(conn: &Connection, doc_no: &str) -> String {
    let mut parts = Vec::new();

    // Query inbound payments
    let mut stmt = conn
        .prepare(
            "SELECT method, SUM(amount_paisa) FROM payments
             WHERE direction = 'inbound' AND (reference = ?1 OR reference LIKE ?1 || ' %')
             GROUP BY method",
        )
        .ok();
    if let Some(ref mut st) = stmt {
        if let Ok(rows) = st.query_map(params![doc_no], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        }) {
            for row in rows.flatten() {
                let (method, amount) = row;
                if amount > 0 {
                    let label = match method.as_str() {
                        "cash" => "Cash",
                        "card" => "Card",
                        "jazzcash" => "JazzCash",
                        "easypaisa" => "EasyPaisa",
                        "raast" => "Raast",
                        "bank" => "Bank",
                        "cheque" => "Cheque",
                        other => other,
                    };
                    parts.push(format!("{} {}", label, Paisa(amount)));
                }
            }
        }
    }

    // Khata part
    let credit: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(debit_paisa), 0) FROM party_ledger WHERE source_doc = ?1 AND entry_type = 'sale'",
            params![doc_no],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if credit > 0 {
        parts.push(format!("Khata {}", Paisa(credit)));
    }

    if parts.is_empty() {
        "Unpaid".to_string()
    } else {
        parts.join(" · ")
    }
}

impl PosApp {
    /// Lines the user did not re-price keep the price they were sold at. The edit
    /// screen sends `price_override_paisa = None` for those, so take the old line's
    /// unit price (same item and unit) instead of today's catalog price.
    fn resolve_edit_lines(&self, sale_id: &str, lines: &[super::CheckoutLineInput]) -> Result<Vec<super::CheckoutLineInput>> {
        let old = super::load_sale(self.conn()?, sale_id)?;
        Ok(lines
            .iter()
            .map(|l| {
                let mut l = l.clone();
                if l.price_override_paisa.is_none() {
                    if let Some(ol) = old.lines.iter().find(|ol| ol.variant_id == l.variant_id && ol.unit_id == l.unit_id) {
                        l.price_override_paisa = Some(ol.unit_price_paisa);
                    }
                }
                l
            })
            .collect())
    }
}

// ---------------------------------------------------------------- PosApp Implementation

impl PosApp {
    /// Lists sales matching the date range and query for the Sale History screen.
    pub fn list_sales(&self, q: SaleListQuery) -> Result<Vec<SaleListRow>> {
        self.require(Permission::SalesCreate)
            .or_else(|_| self.require(Permission::SalesReturn))?;

        let (from_utc, to_utc) = parse_local_date_range(&q.from, &q.to, q.offset_min)?;
        let conn = self.conn()?;
        let limit = q.limit.unwrap_or(200).clamp(1, 1000);
        let offset = q.offset.unwrap_or(0);

        let query_term = q.query.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let like_pat = query_term.map(|t| format!("%{}%", t));

        let sql = "
            SELECT 
                s.id,
                s.doc_no,
                s.created_at,
                p.name as customer_name,
                COALESCE(u.username, su.username) as salesman,
                (SELECT COUNT(*) FROM sale_lines WHERE sale_id = s.id) as item_count,
                s.total_paisa,
                s.status,
                s.revision,
                COALESCE((SELECT SUM(refund_paisa) FROM sale_returns WHERE original_sale_id = s.id), 0) as returned_paisa
            FROM sales s
            LEFT JOIN parties p ON p.id = s.party_id
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN cash_sessions cs ON cs.id = s.cash_session_id
            LEFT JOIN users su ON su.id = cs.user_id
            WHERE s.created_at >= ?1 AND s.created_at <= ?2
              AND (?3 IS NULL OR (
                  s.doc_no LIKE ?3
                  OR (p.name IS NOT NULL AND p.name LIKE ?3)
                  OR (p.phone IS NOT NULL AND p.phone LIKE ?3)
                  OR EXISTS (
                      SELECT 1 FROM sale_lines sl
                      JOIN product_variants pv ON pv.id = sl.variant_id
                      JOIN products pr ON pr.id = pv.product_id
                      LEFT JOIN barcodes b ON b.variant_id = pv.id
                      WHERE sl.sale_id = s.id AND (
                          pr.name LIKE ?3
                          OR pr.name_ur LIKE ?3
                          OR pv.sku LIKE ?3
                          OR b.value LIKE ?3
                      )
                  )
              ))
            ORDER BY s.created_at DESC
            LIMIT ?4 OFFSET ?5
        ";

        let mut stmt = conn.prepare(sql).map_err(|e| PosError::Db(e.to_string()))?;
        let rows = stmt
            .query_map(params![from_utc, to_utc, like_pat, limit as i64, offset as i64], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                    r.get::<_, String>(7)?,
                    r.get::<_, i64>(8)?,
                    r.get::<_, i64>(9)?,
                ))
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            let (id, doc_no, created_at, customer_name, salesman, item_count, total_paisa, status, revision, returned_paisa) = r?;
            let paid_text = build_paid_text(conn, &doc_no);
            list.push(SaleListRow {
                id,
                doc_no,
                created_at,
                customer_name,
                salesman,
                item_count,
                total_paisa,
                paid_text,
                status,
                revision,
                returned_paisa,
            });
        }
        Ok(list)
    }

    /// Full details of a sale receipt: receipt markup data, payments, credit, returns,
    /// revisions, and edit eligibility.
    pub fn sale_detail(&self, sale_id: &str) -> Result<SaleDetail> {
        self.require(Permission::SalesCreate)
            .or_else(|_| self.require(Permission::SalesReturn))?;

        let conn = self.conn()?;
        let receipt = self.receipt(sale_id)?;
        let doc_no = &receipt.sale.doc_no;

        // Payments
        let mut pay_stmt = conn.prepare(
            "SELECT id, method, amount_paisa, reference, direction, occurred_at FROM payments
             WHERE reference = ?1 OR reference LIKE ?1 || ' %'
             ORDER BY occurred_at ASC",
        )?;
        let payments = pay_stmt
            .query_map(params![doc_no], |r| {
                Ok(PaymentRow {
                    id: r.get(0)?,
                    method: r.get(1)?,
                    amount_paisa: r.get(2)?,
                    reference: r.get(3)?,
                    direction: r.get(4)?,
                    occurred_at: r.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Khata credit
        let credit_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(debit_paisa), 0) FROM party_ledger WHERE source_doc = ?1 AND entry_type = 'sale'",
                params![doc_no],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Returns
        let mut ret_stmt = conn.prepare(
            "SELECT id, doc_no, refund_paisa, created_at, reason FROM sale_returns
             WHERE original_sale_id = ?1 ORDER BY created_at DESC",
        )?;
        let returns = ret_stmt
            .query_map(params![sale_id], |r| {
                Ok(ReturnSummary {
                    id: r.get(0)?,
                    doc_no: r.get(1)?,
                    refund_paisa: r.get(2)?,
                    created_at: r.get(3)?,
                    reason: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Revisions
        let mut rev_stmt = conn.prepare(
            "SELECT dr.revision, dr.reason, u.username, dr.edited_at
             FROM document_revisions dr
             LEFT JOIN users u ON u.id = dr.edited_by
             WHERE dr.doc_kind = 'sale' AND dr.doc_id = ?1
             ORDER BY dr.revision ASC",
        )?;
        let revisions = rev_stmt
            .query_map(params![sale_id], |r| {
                Ok(RevisionRow {
                    revision: r.get(0)?,
                    reason: r.get(1)?,
                    edited_by: r.get(2)?,
                    edited_at: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Evaluate edit eligibility
        let mut edit_blocked_reason = None;
        if receipt.sale.revision < 0 || receipt.sale.lines.is_empty() {
            // sanity check
        }
        let status: String = conn
            .query_row("SELECT status FROM sales WHERE id = ?1", params![sale_id], |r| r.get(0))
            .unwrap_or_else(|_| "posted".into());
        if status != "posted" {
            edit_blocked_reason = Some("This sale is voided/held and cannot be edited.".to_string());
        } else if !returns.is_empty() {
            edit_blocked_reason = Some("Items from this receipt were returned. Use Return instead of Edit.".to_string());
        } else if self.require(Permission::SalesVoid).is_err() {
            edit_blocked_reason = Some("Editing a receipt needs Owner/Manager approval.".to_string());
        }

        let can_edit = edit_blocked_reason.is_none();

        Ok(SaleDetail {
            receipt,
            payments,
            credit_paisa,
            returns,
            revisions,
            can_edit,
            edit_blocked_reason,
        })
    }

    /// Views an earlier version snapshot of a sale document.
    pub fn sale_revision(&self, sale_id: &str, revision: i64) -> Result<serde_json::Value> {
        self.require(Permission::SalesCreate)
            .or_else(|_| self.require(Permission::SalesReturn))?;
        let conn = self.conn()?;
        let snapshot_json: String = conn
            .query_row(
                "SELECT snapshot_json FROM document_revisions WHERE doc_kind = 'sale' AND doc_id = ?1 AND revision = ?2",
                params![sale_id, revision],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound(format!("Revision {} of sale {} not found", revision, sale_id)))?;

        serde_json::from_str(&snapshot_json).map_err(|e| PosError::Db(format!("Failed to parse revision JSON: {}", e)))
    }

    /// Previews a sale edit without writing anything: old/new totals, difference, and stock warnings.
    pub fn quote_sale_edit(&self, input: &EditSaleInput) -> Result<SaleEditPreview> {
        self.require(Permission::SalesCreate)
            .or_else(|_| self.require(Permission::SalesReturn))?;

        if input.lines.is_empty() {
            return Err(PosError::Validation("A receipt needs at least one item.".into()));
        }

        let conn = self.conn()?;
        let old = super::load_sale(conn, &input.sale_id)?;
        let old_total_paisa = old.total_paisa;

        // Customer price list
        let customer_list: Option<String> = match &input.customer_id {
            Some(cid) => conn
                .query_row(
                    "SELECT price_list_id FROM parties WHERE id = ?1 AND active = 1",
                    params![cid],
                    |r| r.get(0),
                )
                .optional()?
                .flatten(),
            None => None,
        };

        // Stock warnings (totals come from the same quote as checkout, below)
        let mut stock_warnings = Vec::new();

        for line in &input.lines {
            let factor = unit_factor(conn, &line.variant_id, &line.unit_id)?;
            let cat_price = match customer_list.as_deref() {
                Some(list) if list != "retail" => catalog_price(conn, &line.variant_id, &line.unit_id, factor, list)?
                    .or(catalog_price(conn, &line.variant_id, &line.unit_id, factor, "retail")?),
                _ => catalog_price(conn, &line.variant_id, &line.unit_id, factor, "retail")?,
            }
            .unwrap_or(0);

            let _ = cat_price;

            // Check stock warning
            let is_service: bool = conn
                .query_row(
                    "SELECT p.is_service FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                    params![line.variant_id],
                    |r| r.get::<_, i64>(0),
                )
                .map(|v| v != 0)
                .unwrap_or(false);

            if !is_service {
                let on_hand: i64 = conn
                    .query_row(
                        "SELECT on_hand_milli FROM inventory_balances WHERE variant_id = ?1",
                        params![line.variant_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let base_needed = mul_div_half_up(line.qty_milli, factor, 1000);
                // Also account for old sale line base qty for this item
                let old_base: i64 = old
                    .lines
                    .iter()
                    .filter(|ol| ol.variant_id == line.variant_id)
                    .map(|ol| ol.qty_milli)
                    .sum();
                let net_needed = base_needed - old_base;
                if net_needed > on_hand {
                    let name: String = conn
                        .query_row(
                            "SELECT p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                            params![line.variant_id],
                            |r| r.get(0),
                        )
                        .unwrap_or_else(|_| "Item".into());
                    stock_warnings.push(format!("{}: requested {}, but stock on hand is only {}", name, format_milli_qty(net_needed), format_milli_qty(on_hand)));
                }
            }
        }

        let resolved = self.resolve_edit_lines(&input.sale_id, &input.lines)?;
        let quote = self.quote(input.customer_id.as_deref(), &resolved, input.global_discount_paisa)?;
        let new_total_paisa = quote.total_paisa;
        let diff_paisa = new_total_paisa - old_total_paisa;

        Ok(SaleEditPreview {
            old_total_paisa,
            new_total_paisa,
            diff_paisa,
            stock_warnings,
        })
    }

    /// Edits a posted sale document using reverse-and-repost inside a single transaction.
    ///
    /// Accounting behavior:
    /// - Sales reports use `sales.created_at`, so the edited sale stays on its original date
    ///   with the new amounts.
    /// - The cash difference appears on the edit date through the payments table.
    pub fn edit_sale(&mut self, input: EditSaleInput) -> Result<super::ReceiptData> {
        // Permission check: requires SalesVoid OR valid Manager approval
        let actor_id = if let Ok(s) = self.require(Permission::SalesVoid) {
            s.user_id.clone()
        } else if let Some(appr) = &input.approval {
            self.verify_approval(appr, "Editing a receipt")?
        } else {
            return Err(PosError::BusinessRule("Editing a receipt needs Owner/Manager approval.".into()));
        };

        if input.reason.trim().len() < 3 {
            return Err(PosError::Validation("Reason is required (min 3 characters).".into()));
        }
        if input.lines.is_empty() {
            return Err(PosError::Validation("A receipt needs at least one item.".into()));
        }

        let now_str = now().to_rfc3339();

        // Same prices, discounts and tax as checkout. Untouched lines keep their old price.
        let resolved = self.resolve_edit_lines(&input.sale_id, &input.lines)?;
        let quote = self.quote(input.customer_id.as_deref(), &resolved, input.global_discount_paisa)?;
        let post_lines: Vec<PostSaleLineInput> = quote
            .lines
            .iter()
            .zip(input.lines.iter())
            .map(|(q, orig)| PostSaleLineInput {
                variant_id: q.variant_id.clone(),
                unit_id: q.unit_id.clone(),
                qty_milli: q.qty_milli,
                unit_price_paisa: q.unit_price_paisa,
                discount_paisa: q.discount_paisa,
                tax_paisa: q.tax_paisa,
                // Only a price the user typed in this edit counts as a price change by the editor.
                price_override_by: if orig.price_override_paisa.is_some() { Some(actor_id.clone()) } else { None },
            })
            .collect();

        {
            let conn = self.conn_mut()?;
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

        // 1. Load current sale header and validate preconditions
        let (doc_no, party_id, old_subtotal, old_discount, old_tax, old_total, created_at, revision, status):
            (String, Option<String>, i64, i64, i64, i64, String, i64, String) = tx
            .query_row(
                "SELECT doc_no, party_id, subtotal_paisa, discount_paisa, tax_paisa, total_paisa, created_at, revision, status
                 FROM sales WHERE id = ?1",
                params![input.sale_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound("Sale not found".into()))?;

        if status != "posted" {
            return Err(PosError::BusinessRule("This sale is voided/held and cannot be edited.".into()));
        }
        if revision != input.expected_revision {
            return Err(PosError::BusinessRule("This receipt was changed by someone else. Reopen it.".into()));
        }

        let return_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM sale_returns WHERE original_sale_id = ?1",
                params![input.sale_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if return_count > 0 {
            return Err(PosError::BusinessRule("Items from this receipt were returned. Use Return instead of Edit.".into()));
        }

        // Check if customer changed and old sale had credit
        let old_credit: i64 = tx
            .query_row(
                "SELECT COALESCE(SUM(debit_paisa), 0) FROM party_ledger WHERE source_doc = ?1 AND entry_type = 'sale'",
                params![doc_no],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if input.customer_id.is_none() && (old_credit > 0 || input.settlement.iter().any(|t| t.method == "credit") || input.refund_to_khata) {
            return Err(PosError::BusinessRule("Select a customer for the khata part.".into()));
        }

        // Load old lines for snapshot and reversal
        struct OldLine {
            id: String,
            variant_id: String,
            unit_id: String,
            qty_milli: i64,
            unit_price_paisa: i64,
            discount_paisa: i64,
            tax_paisa: i64,
            total_paisa: i64,
            unit_cost_snapshot_paisa: i64,
            cogs_paisa: i64,
        }
        let old_lines: Vec<OldLine> = {
            let mut old_lines_stmt = tx.prepare(
                "SELECT id, variant_id, unit_id, qty_milli, unit_price_paisa, discount_paisa, tax_paisa, total_paisa, unit_cost_snapshot_paisa, cogs_paisa
                 FROM sale_lines WHERE sale_id = ?1",
            )?;
            let rows = old_lines_stmt
                .query_map(params![input.sale_id], |r| {
                    Ok(OldLine {
                        id: r.get(0)?,
                        variant_id: r.get(1)?,
                        unit_id: r.get(2)?,
                        qty_milli: r.get(3)?,
                        unit_price_paisa: r.get(4)?,
                        discount_paisa: r.get(5)?,
                        tax_paisa: r.get(6)?,
                        total_paisa: r.get(7)?,
                        unit_cost_snapshot_paisa: r.get(8)?,
                        cogs_paisa: r.get(9)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        // Serial check: check if any old movement had a serial_id
        let serial_movements: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM stock_movements WHERE source_doc = ?1 AND serial_id IS NOT NULL",
                params![doc_no],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if serial_movements > 0 {
            // Check if items or quantities changed
            let mut changed = false;
            if input.lines.len() != old_lines.len() {
                changed = true;
            } else {
                for (ol, nl) in old_lines.iter().zip(input.lines.iter()) {
                    if ol.variant_id != nl.variant_id || ol.qty_milli != nl.qty_milli || ol.unit_id != nl.unit_id {
                        changed = true;
                        break;
                    }
                }
            }
            if changed {
                return Err(PosError::BusinessRule("Serial/IMEI items cannot be changed by edit. Return them instead.".into()));
            }
        }

        // Save snapshot of document before editing
        let old_payments_json: Vec<serde_json::Value> = {
            let mut st = tx.prepare("SELECT method, amount_paisa, reference FROM payments WHERE reference = ?1 OR reference LIKE ?1 || ' %'")?;
            let rows = st.query_map(params![doc_no], |r| {
                Ok(json!({ "method": r.get::<_, String>(0)?, "amount_paisa": r.get::<_, i64>(1)?, "reference": r.get::<_, Option<String>>(2)? }))
            })?.collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let old_lines_json: Vec<serde_json::Value> = old_lines.iter().map(|l| {
            json!({
                "variant_id": l.variant_id,
                "unit_id": l.unit_id,
                "qty_milli": l.qty_milli,
                "unit_price_paisa": l.unit_price_paisa,
                "discount_paisa": l.discount_paisa,
                "tax_paisa": l.tax_paisa,
                "total_paisa": l.total_paisa,
                "unit_cost_snapshot_paisa": l.unit_cost_snapshot_paisa,
                "cogs_paisa": l.cogs_paisa,
            })
        }).collect();

        let snapshot = json!({
            "header": {
                "id": input.sale_id,
                "doc_no": doc_no,
                "party_id": party_id,
                "subtotal_paisa": old_subtotal,
                "discount_paisa": old_discount,
                "tax_paisa": old_tax,
                "total_paisa": old_total,
                "created_at": created_at,
                "revision": revision,
            },
            "lines": old_lines_json,
            "payments": old_payments_json,
            "credit_paisa": old_credit,
        });

        tx.execute(
            "INSERT INTO document_revisions (id, doc_kind, doc_id, revision, snapshot_json, reason, edited_by, edited_at)
             VALUES (?1, 'sale', ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Ulid::new().to_string(),
                input.sale_id,
                revision,
                snapshot.to_string(),
                input.reason.trim(),
                actor_id,
                now_str,
            ],
        )?;

        // 2. Reverse old stock movements
        for ol in &old_lines {
            let is_service: bool = tx
                .query_row(
                    "SELECT p.is_service FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                    params![ol.variant_id],
                    |r| r.get::<_, i64>(0),
                )
                .map(|v| v != 0)
                .unwrap_or(false);

            if !is_service {
                let factor = unit_factor(&tx, &ol.variant_id, &ol.unit_id)?;
                let base_qty = mul_div_half_up(ol.qty_milli, factor, 1000);
                InventoryRepo::record_movement(
                    &tx,
                    RecordMovementParams {
                        variant_id: ol.variant_id.clone(),
                        qty_signed_milli: base_qty,
                        movement_type: "sale_edit_reversal".to_string(),
                        source_doc: doc_no.clone(),
                        source_line: Some(ol.id.clone()),
                        unit_cost_paisa: ol.unit_cost_snapshot_paisa,
                        batch_id: None,
                        serial_id: None,
                        user_id: Some(actor_id.clone()),
                    },
                )?;
            }
        }

        // 3. Delete old lines
        tx.execute("DELETE FROM sale_lines WHERE sale_id = ?1", params![input.sale_id])?;

        // 4. Validate and insert new lines
        let customer_list: Option<String> = match &input.customer_id {
            Some(cid) => tx
                .query_row(
                    "SELECT price_list_id FROM parties WHERE id = ?1 AND active = 1",
                    params![cid],
                    |r| r.get(0),
                )
                .optional()?
                .flatten(),
            None => None,
        };

        let outcome = SaleRepo::validate_and_price_lines(&tx, &post_lines, customer_list.as_deref())?;
        let _new_lines_dto = SaleRepo::insert_lines_and_movements(
            &tx,
            &input.sale_id,
            &doc_no,
            &outcome.priced,
            Some(&actor_id),
            "sale_edit",
        )?;

        let new_subtotal = outcome.subtotal_paisa;
        let new_line_discounts = outcome.line_discounts_paisa;
        let new_tax = outcome.tax_paisa;

        if input.global_discount_paisa > new_subtotal - new_line_discounts {
            return Err(PosError::Validation("Bill discount cannot be larger than the bill".to_string()));
        }
        let new_total_discount = new_line_discounts + input.global_discount_paisa;
        let new_grand_total = new_subtotal - new_total_discount + new_tax;
        let new_revision = revision + 1;

        // 5. Update sales header
        tx.execute(
            "UPDATE sales SET party_id = ?1, subtotal_paisa = ?2, discount_paisa = ?3, tax_paisa = ?4, total_paisa = ?5,
                    revision = ?6, edited_at = ?7, edited_by = ?8 WHERE id = ?9",
            params![
                input.customer_id,
                new_subtotal,
                new_total_discount,
                new_tax,
                new_grand_total,
                new_revision,
                now_str,
                actor_id,
                input.sale_id,
            ],
        )?;

        // 6. Settle money difference
        let diff_paisa = new_grand_total - old_total;

        // Active shift check for actor if cash is involved
        let shift = ShiftRepo::get_active_session(&tx, &actor_id)?;
        let shift_id = shift.as_ref().map(|s| s.id.clone());

        // Handle customer changed on khata part
        if party_id != input.customer_id && old_credit > 0 {
            let old_cid = party_id.as_deref().unwrap();
            let old_bal = KhataRepo::get_balance(&tx, old_cid)?;
            tx.execute(
                "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                 VALUES (?1, ?2, 'sale_edit', 0, ?3, ?4, ?5, ?6)",
                params![Ulid::new().to_string(), old_cid, old_credit, old_bal - old_credit, doc_no, now_str],
            )?;

            if let Some(new_cid) = &input.customer_id {
                let new_bal = KhataRepo::get_balance(&tx, new_cid)?;
                tx.execute(
                    "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                     VALUES (?1, ?2, 'sale_edit', ?3, 0, ?4, ?5, ?6)",
                    params![Ulid::new().to_string(), new_cid, old_credit, new_bal + old_credit, doc_no, now_str],
                )?;
            }
        }

        if diff_paisa > 0 {
            // Customer pays more
            let mut settled_sum: i64 = 0;
            for t in &input.settlement {
                settled_sum += t.amount_paisa;
                if t.method == "credit" {
                    let cid = input.customer_id.as_deref().ok_or_else(|| {
                        PosError::Validation("Customer is required for credit settlement".into())
                    })?;
                    let check = KhataRepo::check_credit_limit(&tx, cid, t.amount_paisa)?;
                    if !check.allowed {
                        return Err(PosError::BusinessRule(format!(
                            "Credit limit exceeded: resulting balance {} Paisa exceeds limit {} Paisa",
                            check.resulting_balance_paisa, check.credit_limit_paisa
                        )));
                    }
                    let prev_bal = KhataRepo::get_balance(&tx, cid)?;
                    tx.execute(
                        "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                         VALUES (?1, ?2, 'sale_edit', ?3, 0, ?4, ?5, ?6)",
                        params![Ulid::new().to_string(), cid, t.amount_paisa, prev_bal + t.amount_paisa, doc_no, now_str],
                    )?;
                } else {
                    if shift_id.is_none() && t.method == "cash" {
                        return Err(PosError::BusinessRule("Start your shift before an edit that moves cash.".into()));
                    }
                    let ref_str = format!("{} edit rev {}", doc_no, new_revision);
                    tx.execute(
                        "INSERT INTO payments (id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at)
                         VALUES (?1, ?2, 'inbound', ?3, ?4, ?5, ?6, ?7)",
                        params![Ulid::new().to_string(), input.customer_id, t.method, t.amount_paisa, ref_str, shift_id, now_str],
                    )?;
                }
            }
            if settled_sum != diff_paisa {
                return Err(PosError::Validation(format!(
                    "Settlement mismatch: difference is {} but tenders total {}",
                    Paisa(diff_paisa),
                    Paisa(settled_sum)
                )));
            }
        } else if diff_paisa < 0 {
            // Shop gives money back
            let refund_amount = -diff_paisa;
            if input.refund_to_khata {
                let cid = input.customer_id.as_deref().ok_or_else(|| {
                    PosError::Validation("Customer is required to reduce khata.".into())
                })?;

                // Check invoice allocations received against this sale
                let paid_on_sale: i64 = tx
                    .query_row(
                        "SELECT COALESCE(SUM(allocated_paisa), 0) FROM invoice_allocations WHERE sale_id = ?1",
                        params![input.sale_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);

                let resulting_khata = old_credit - refund_amount;
                if resulting_khata < paid_on_sale {
                    return Err(PosError::BusinessRule(format!(
                        "Rs {} was already received against this receipt on khata. The new khata amount cannot be lower.",
                        Paisa(paid_on_sale)
                    )));
                }

                let prev_bal = KhataRepo::get_balance(&tx, cid)?;
                tx.execute(
                    "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                     VALUES (?1, ?2, 'sale_edit', 0, ?3, ?4, ?5, ?6)",
                    params![Ulid::new().to_string(), cid, refund_amount, prev_bal - refund_amount, doc_no, now_str],
                )?;
            } else {
                // Cash refund
                if shift_id.is_none() {
                    return Err(PosError::BusinessRule("Start your shift before an edit that moves cash.".into()));
                }
                let ref_str = format!("{} edit rev {}", doc_no, new_revision);
                tx.execute(
                    "INSERT INTO payments (id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at)
                     VALUES (?1, ?2, 'outbound', 'cash', ?3, ?4, ?5, ?6)",
                    params![Ulid::new().to_string(), input.customer_id, refund_amount, ref_str, shift_id, now_str],
                )?;
            }
        }

        // 7. Audit & Sync outbox
        AuditRepo::write(
            &tx,
            Some(&actor_id),
            "sale_edited",
            "sale",
            Some(&input.sale_id),
            None,
            Some(&json!({
                "doc_no": doc_no,
                "old_total": old_total,
                "new_total": new_grand_total,
                "revision": new_revision,
            }).to_string()),
        )?;

        let outbox_payload = json!({
            "sale_id": input.sale_id,
            "doc_no": doc_no,
            "old_total_paisa": old_total,
            "new_total_paisa": new_grand_total,
            "revision": new_revision,
            "edited_by": actor_id,
            "edited_at": now_str,
        }).to_string();

        let _ = tx.execute(
            "INSERT INTO sync_outbox (event_id, event_type, payload_json, occurred_at) VALUES (?1, 'sale_edited', ?2, ?3)",
            params![Ulid::new().to_string(), outbox_payload, now_str],
        );

        tx.commit().map_err(|e| PosError::Db(format!("Failed to commit sale edit: {}", e)))?;
        }

        // 8. Return updated receipt data
        self.receipt(&input.sale_id)
    }

    /// Lists purchases matching the query and date range.
    pub fn list_purchases_filtered(&self, q: PurchaseListQuery) -> Result<Vec<PurchaseListRow>> {
        self.require(Permission::PurchaseEntry)?;

        let (from_utc, to_utc) = parse_local_date_range(&q.from, &q.to, q.offset_min)?;
        let conn = self.conn()?;
        let limit = q.limit.unwrap_or(200).clamp(1, 1000);
        let offset = q.offset.unwrap_or(0);

        let query_term = q.query.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let like_pat = query_term.map(|t| format!("%{}%", t));

        let sql = "
            SELECT 
                p.id,
                p.doc_no,
                p.created_at,
                pt.name as vendor_name,
                p.vendor_invoice_no,
                (SELECT COUNT(*) FROM purchase_lines WHERE purchase_id = p.id) as item_count,
                p.freight_paisa,
                p.total_paisa,
                p.status,
                p.revision,
                COALESCE((SELECT SUM(total_paisa) FROM purchase_returns WHERE purchase_id = p.id), 0) as returned_paisa,
                u.username as entered_by
            FROM purchases p
            JOIN parties pt ON pt.id = p.vendor_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.created_at >= ?1 AND p.created_at <= ?2
              AND (?3 IS NULL OR (
                  p.doc_no LIKE ?3
                  OR pt.name LIKE ?3
                  OR (pt.phone IS NOT NULL AND pt.phone LIKE ?3)
                  OR (p.vendor_invoice_no IS NOT NULL AND p.vendor_invoice_no LIKE ?3)
                  OR EXISTS (
                      SELECT 1 FROM purchase_lines pl
                      JOIN product_variants pv ON pv.id = pl.variant_id
                      JOIN products pr ON pr.id = pv.product_id
                      LEFT JOIN barcodes b ON b.variant_id = pv.id
                      WHERE pl.purchase_id = p.id AND (
                          pr.name LIKE ?3
                          OR pr.name_ur LIKE ?3
                          OR pv.sku LIKE ?3
                          OR b.value LIKE ?3
                      )
                  )
              ))
            ORDER BY p.created_at DESC
            LIMIT ?4 OFFSET ?5
        ";

        let mut stmt = conn.prepare(sql).map_err(|e| PosError::Db(e.to_string()))?;
        let rows = stmt
            .query_map(params![from_utc, to_utc, like_pat, limit as i64, offset as i64], |r| {
                Ok(PurchaseListRow {
                    id: r.get(0)?,
                    doc_no: r.get(1)?,
                    created_at: r.get(2)?,
                    vendor_name: r.get(3)?,
                    vendor_invoice_no: r.get(4)?,
                    item_count: r.get(5)?,
                    freight_paisa: r.get(6)?,
                    total_paisa: r.get(7)?,
                    status: r.get(8)?,
                    revision: r.get::<_, Option<i64>>(9)?.unwrap_or(0),
                    returned_paisa: r.get(10)?,
                    entered_by: r.get(11)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    /// Full details of a purchase invoice: invoice lines, returns, paid amount, revisions, and edit eligibility.
    pub fn purchase_detail(&self, purchase_id: &str) -> Result<PurchaseDetail> {
        self.require(Permission::PurchaseEntry)?;
        let conn = self.conn()?;

        let (doc_no, vendor_id, vendor_name, vendor_invoice_no, status, freight_paisa, total_paisa, created_at, revision):
            (String, String, String, Option<String>, String, i64, i64, String, i64) = conn
            .query_row(
                "SELECT p.doc_no, p.vendor_id, pt.name, p.vendor_invoice_no, p.status, p.freight_paisa, p.total_paisa, p.created_at, p.revision
                 FROM purchases p JOIN parties pt ON pt.id = p.vendor_id WHERE p.id = ?1",
                params![purchase_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get::<_, Option<i64>>(8)?.unwrap_or(0))),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound("Purchase invoice not found".into()))?;

        // Lines
        let mut lines_stmt = conn.prepare(
            "SELECT pl.id, pl.variant_id, pr.name, pv.sku, pl.unit_id, u.code, pl.received_qty_milli, pl.unit_cost_paisa, pl.total_paisa
             FROM purchase_lines pl
             JOIN product_variants pv ON pv.id = pl.variant_id
             JOIN products pr ON pr.id = pv.product_id
             JOIN units u ON u.id = pl.unit_id
             WHERE pl.purchase_id = ?1",
        )?;
        let lines = lines_stmt
            .query_map(params![purchase_id], |r| {
                let received_qty: i64 = r.get(6)?;
                let total: i64 = r.get(8)?;
                let eff_cost = if received_qty > 0 { (total * 1000) / received_qty } else { r.get(7)? };
                Ok(PurchaseInvoiceLine {
                    id: r.get(0)?,
                    purchase_id: purchase_id.to_string(),
                    variant_id: r.get(1)?,
                    product_name: r.get(2)?,
                    sku: r.get(3)?,
                    unit_id: r.get(4)?,
                    unit_code: r.get(5)?,
                    received_qty_milli: received_qty,
                    unit_cost_paisa: r.get(7)?,
                    total_paisa: total,
                    effective_unit_cost_paisa: eff_cost,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        let invoice = PurchaseInvoice {
            id: purchase_id.to_string(),
            doc_no,
            vendor_id,
            vendor_name,
            vendor_invoice_no,
            status: status.clone(),
            freight_paisa,
            total_paisa,
            lines,
            created_at,
            revision,
        };

        // Returns
        let mut ret_stmt = conn.prepare(
            "SELECT id, doc_no, total_paisa, created_at, reason FROM purchase_returns WHERE purchase_id = ?1 ORDER BY created_at DESC",
        )?;
        let returns = ret_stmt
            .query_map(params![purchase_id], |r| {
                Ok(PurchaseReturnSummary {
                    id: r.get(0)?,
                    doc_no: r.get(1)?,
                    total_paisa: r.get(2)?,
                    created_at: r.get(3)?,
                    reason: r.get(4)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Paid amount via invoice allocations
        let paid_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(allocated_paisa), 0) FROM invoice_allocations WHERE purchase_id = ?1",
                params![purchase_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Revisions
        let mut rev_stmt = conn.prepare(
            "SELECT dr.revision, dr.reason, u.username, dr.edited_at
             FROM document_revisions dr
             LEFT JOIN users u ON u.id = dr.edited_by
             WHERE dr.doc_kind = 'purchase' AND dr.doc_id = ?1
             ORDER BY dr.revision ASC",
        )?;
        let revisions = rev_stmt
            .query_map(params![purchase_id], |r| {
                Ok(RevisionRow {
                    revision: r.get(0)?,
                    reason: r.get(1)?,
                    edited_by: r.get(2)?,
                    edited_at: r.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        // Eligibility check (Section 5.3)
        let mut edit_blocked_reason = None;
        if status != "received" {
            edit_blocked_reason = Some("This purchase is not received/active and cannot be edited.".into());
        } else if !returns.is_empty() {
            edit_blocked_reason = Some("Items of this purchase were returned to the vendor. It cannot be edited.".into());
        } else if self.require(Permission::PriceEdit).is_err() {
            edit_blocked_reason = Some("Editing a purchase requires Owner or Manager privileges.".into());
        }

        let can_edit = edit_blocked_reason.is_none();

        Ok(PurchaseDetail {
            invoice,
            returns,
            paid_paisa,
            revisions,
            can_edit,
            edit_blocked_reason,
        })
    }

    /// Views an earlier version snapshot of a purchase invoice.
    pub fn purchase_revision(&self, purchase_id: &str, revision: i64) -> Result<serde_json::Value> {
        self.require(Permission::PurchaseEntry)?;
        let conn = self.conn()?;
        let snapshot_json: String = conn
            .query_row(
                "SELECT snapshot_json FROM document_revisions WHERE doc_kind = 'purchase' AND doc_id = ?1 AND revision = ?2",
                params![purchase_id, revision],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound(format!("Revision {} of purchase {} not found", revision, purchase_id)))?;

        serde_json::from_str(&snapshot_json).map_err(|e| PosError::Db(format!("Failed to parse revision JSON: {}", e)))
    }

    /// Previews a purchase invoice edit: old/new totals, difference, and vendor khata effect.
    pub fn quote_purchase_edit(&self, input: &EditPurchaseInput) -> Result<PurchaseEditPreview> {
        self.require(Permission::PurchaseEntry)?;
        if input.lines.is_empty() {
            return Err(PosError::Validation("A purchase needs at least one item.".into()));
        }

        let conn = self.conn()?;
        let old_total_paisa: i64 = conn
            .query_row("SELECT total_paisa FROM purchases WHERE id = ?1", params![input.purchase_id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| PosError::NotFound("Purchase not found".into()))?;

        let lines_subtotal: i64 = input
            .lines
            .iter()
            .map(|l| (l.received_qty_milli * l.unit_cost_paisa) / 1000)
            .sum();
        let new_total_paisa = lines_subtotal + input.freight_paisa;
        let diff_paisa = new_total_paisa - old_total_paisa;

        let vendor_diff_text = if diff_paisa > 0 {
            format!("Vendor balance will increase by Rs {}", Paisa(diff_paisa))
        } else if diff_paisa < 0 {
            format!("Vendor balance will decrease by Rs {}", Paisa(-diff_paisa))
        } else {
            "Vendor balance will not change".to_string()
        };

        Ok(PurchaseEditPreview {
            old_total_paisa,
            new_total_paisa,
            diff_paisa,
            vendor_diff_text,
        })
    }

    /// Edits a purchase invoice with stock reversal, average cost adjustment, and vendor khata update.
    ///
    /// Known, accepted limit: sales made after this purchase keep the cost (COGS) they
    /// were saved with; edits do not change past profit.
    pub fn edit_purchase(&mut self, input: EditPurchaseInput) -> Result<PurchaseInvoice> {
        self.require(Permission::PurchaseEntry)?;
        let actor = self.require(Permission::PriceEdit)?;
        let actor_id = actor.user_id.clone();

        if input.reason.trim().len() < 3 {
            return Err(PosError::Validation("Reason is required (min 3 characters).".into()));
        }
        if input.lines.is_empty() {
            return Err(PosError::Validation("A purchase needs at least one item.".into()));
        }

        let now_str = now().to_rfc3339();

        let (doc_no, created_at, new_total_paisa, new_revision, new_lines) = {
            let conn = self.conn_mut()?;
            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

        // 1. Load current purchase header and validate preconditions
        let (doc_no, old_vendor_id, old_vendor_invoice_no, status, old_freight, old_total, created_at, revision):
            (String, String, Option<String>, String, i64, i64, String, i64) = tx
            .query_row(
                "SELECT doc_no, vendor_id, vendor_invoice_no, status, freight_paisa, total_paisa, created_at, revision
                 FROM purchases WHERE id = ?1",
                params![input.purchase_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get::<_, Option<i64>>(7)?.unwrap_or(0))),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound("Purchase not found".into()))?;

        if status != "received" {
            return Err(PosError::BusinessRule("This purchase is not received/active and cannot be edited.".into()));
        }
        if revision != input.expected_revision {
            return Err(PosError::BusinessRule("This purchase was changed by someone else. Reopen it.".into()));
        }

        let return_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM purchase_returns WHERE purchase_id = ?1",
                params![input.purchase_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if return_count > 0 {
            return Err(PosError::BusinessRule("Items of this purchase were returned to the vendor. It cannot be edited.".into()));
        }

        // Calculate new totals
        let allocations = PurchaseRepo::allocate_landed_cost(&input.lines, input.freight_paisa)?;
        let lines_subtotal: i64 = input
            .lines
            .iter()
            .map(|l| (l.received_qty_milli * l.unit_cost_paisa) / 1000)
            .sum();
        let new_total_paisa = lines_subtotal + input.freight_paisa;

        // Check invoice allocations
        let paid_paisa: i64 = tx
            .query_row(
                "SELECT COALESCE(SUM(allocated_paisa), 0) FROM invoice_allocations WHERE purchase_id = ?1",
                params![input.purchase_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if new_total_paisa < paid_paisa {
            return Err(PosError::BusinessRule(format!(
                "Rs {} was already paid on this bill. The new total cannot be lower.",
                Paisa(paid_paisa)
            )));
        }

        // Load old lines for snapshot and reversal
        struct OldPurLine {
            id: String,
            variant_id: String,
            unit_id: String,
            received_qty_milli: i64,
            unit_cost_paisa: i64,
            total_paisa: i64,
        }
        let old_lines: Vec<OldPurLine> = {
            let mut old_lines_stmt = tx.prepare(
                "SELECT id, variant_id, unit_id, received_qty_milli, unit_cost_paisa, total_paisa FROM purchase_lines WHERE purchase_id = ?1",
            )?;
            let rows = old_lines_stmt
                .query_map(params![input.purchase_id], |r| {
                    Ok(OldPurLine {
                        id: r.get(0)?,
                        variant_id: r.get(1)?,
                        unit_id: r.get(2)?,
                        received_qty_milli: r.get(3)?,
                        unit_cost_paisa: r.get(4)?,
                        total_paisa: r.get(5)?,
                    })
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        // 1. Snapshot
        let old_lines_json: Vec<serde_json::Value> = old_lines.iter().map(|l| {
            json!({
                "id": l.id,
                "variant_id": l.variant_id,
                "unit_id": l.unit_id,
                "received_qty_milli": l.received_qty_milli,
                "unit_cost_paisa": l.unit_cost_paisa,
                "total_paisa": l.total_paisa,
            })
        }).collect();

        let snapshot = json!({
            "header": {
                "id": input.purchase_id,
                "doc_no": doc_no,
                "vendor_id": old_vendor_id,
                "vendor_invoice_no": old_vendor_invoice_no,
                "freight_paisa": old_freight,
                "total_paisa": old_total,
                "created_at": created_at,
                "revision": revision,
            },
            "lines": old_lines_json,
        });

        tx.execute(
            "INSERT INTO document_revisions (id, doc_kind, doc_id, revision, snapshot_json, reason, edited_by, edited_at)
             VALUES (?1, 'purchase', ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Ulid::new().to_string(),
                input.purchase_id,
                revision,
                snapshot.to_string(),
                input.reason.trim(),
                actor_id,
                now_str,
            ],
        )?;

        // 2. Stock and cost per item BEFORE the edit.
        let mut variants: Vec<String> = Vec::new();
        for v in old_lines.iter().map(|l| &l.variant_id).chain(input.lines.iter().map(|l| &l.variant_id)) {
            if !variants.contains(v) {
                variants.push(v.clone());
            }
        }
        let mut before: std::collections::HashMap<String, (i64, i64)> = std::collections::HashMap::new();
        for v in &variants {
            let b = InventoryRepo::get_balance(&tx, v)?.map(|b| (b.on_hand_milli, b.avg_cost_paisa)).unwrap_or((0, 0));
            before.insert(v.clone(), b);
        }

        // 3. Replace the lines. The new lines go in first (stock in), then the old lines
        // are taken back out, so only the real difference has to be in stock: fixing the
        // rate of a purchase that is partly sold works; lowering the qty below what was
        // already sold is refused.
        tx.execute("DELETE FROM purchase_lines WHERE purchase_id = ?1", params![input.purchase_id])?;

        let new_lines = PurchaseRepo::build_and_insert_purchase_lines(
            &tx,
            &input.purchase_id,
            &doc_no,
            &input.lines,
            &allocations,
            Some(&actor_id),
            "purchase_edit",
        )?;

        for ol in &old_lines {
            let reversal_result = InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: ol.variant_id.clone(),
                    qty_signed_milli: -ol.received_qty_milli,
                    movement_type: "purchase_edit_reversal".to_string(),
                    source_doc: doc_no.clone(),
                    source_line: Some(ol.id.clone()),
                    unit_cost_paisa: ol.unit_cost_paisa,
                    batch_id: None,
                    serial_id: None,
                    user_id: Some(actor_id.clone()),
                },
            );
            if let Err(e) = reversal_result {
                if !matches!(e, PosError::NegativeStockBlocked { .. }) {
                    return Err(e);
                }
                let name: String = tx
                    .query_row(
                        "SELECT p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                        params![ol.variant_id],
                        |r| r.get(0),
                    )
                    .unwrap_or_else(|_| "Item".into());
                let (cur_on_hand, _) = before.get(&ol.variant_id).copied().unwrap_or((0, 0));
                let old_qty: i64 = old_lines.iter().filter(|l| l.variant_id == ol.variant_id).map(|l| l.received_qty_milli).sum();
                let sold = (old_qty - cur_on_hand).max(0);
                return Err(PosError::BusinessRule(format!(
                    "{}: {} already sold from this purchase. You can lower qty by at most {}.",
                    name,
                    format_milli_qty(sold),
                    format_milli_qty(cur_on_hand.max(0))
                )));
            }
        }

        // 4. Average cost. Units of this bill still in stock are re-costed at the new
        // rate; added units come in at the new rate, removed units leave at it. Sales
        // already made keep their saved cost (past profit is not recalculated).
        for v in &variants {
            let (oh, avg) = before.get(v).copied().unwrap_or((0, 0));
            let old_q: i128 = old_lines.iter().filter(|l| &l.variant_id == v).map(|l| l.received_qty_milli as i128).sum();
            let old_val: i128 = old_lines
                .iter()
                .filter(|l| &l.variant_id == v)
                .map(|l| l.received_qty_milli as i128 * l.unit_cost_paisa as i128 / 1000)
                .sum();
            let (new_q, new_val): (i128, i128) = input
                .lines
                .iter()
                .zip(allocations.iter())
                .filter(|(l, _)| &l.variant_id == v)
                .fold((0, 0), |(q, val), (l, a)| (q + l.received_qty_milli as i128, val + a.0 as i128));
            let oh = oh as i128;
            let value_before = oh * avg as i128 / 1000;
            let value_after = if new_q == 0 {
                value_before - old_val
            } else if old_q == 0 {
                value_before + new_val
            } else {
                let kept = oh.max(0).min(old_q);
                value_before + kept * new_val / new_q - kept * old_val / old_q + (new_q - old_q) * new_val / new_q
            };
            let qty_after = oh - old_q + new_q;
            let new_avg = if qty_after > 0 {
                (value_after.max(0) * 1000 / qty_after) as i64
            } else if new_q > 0 {
                (new_val * 1000 / new_q) as i64
            } else {
                avg
            };
            InventoryRepo::update_avg_cost(&tx, v, new_avg)?;
        }

        // 5. Update purchase header
        let new_revision = revision + 1;
        tx.execute(
            "UPDATE purchases SET vendor_id = ?1, vendor_invoice_no = ?2, freight_paisa = ?3, total_paisa = ?4,
                    revision = ?5, edited_at = ?6, edited_by = ?7 WHERE id = ?8",
            params![
                input.vendor_id,
                input.vendor_invoice_no,
                input.freight_paisa,
                new_total_paisa,
                new_revision,
                now_str,
                actor_id,
                input.purchase_id,
            ],
        )?;

        // 6. Vendor khata
        let diff_paisa = new_total_paisa - old_total;
        if input.vendor_id == old_vendor_id {
            if diff_paisa != 0 {
                let prev_bal = KhataRepo::get_balance(&tx, &input.vendor_id)?;
                let (debit, credit) = if diff_paisa > 0 {
                    (0, diff_paisa)
                } else {
                    (-diff_paisa, 0)
                };
                let new_bal = prev_bal + credit - debit;
                tx.execute(
                    "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                     VALUES (?1, ?2, 'purchase_edit', ?3, ?4, ?5, ?6, ?7)",
                    params![Ulid::new().to_string(), input.vendor_id, debit, credit, new_bal, doc_no, now_str],
                )?;
            }
        } else {
            // Vendor changed: debit old vendor, credit new vendor
            let old_bal = KhataRepo::get_balance(&tx, &old_vendor_id)?;
            tx.execute(
                "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                 VALUES (?1, ?2, 'purchase_edit', ?3, 0, ?4, ?5, ?6)",
                params![Ulid::new().to_string(), old_vendor_id, old_total, old_bal - old_total, doc_no, now_str],
            )?;

            let new_bal = KhataRepo::get_balance(&tx, &input.vendor_id)?;
            tx.execute(
                "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
                 VALUES (?1, ?2, 'purchase_edit', 0, ?3, ?4, ?5, ?6)",
                params![Ulid::new().to_string(), input.vendor_id, new_total_paisa, new_bal + new_total_paisa, doc_no, now_str],
            )?;
        }

        // 7. Audit & Sync outbox
        AuditRepo::write(
            &tx,
            Some(&actor_id),
            "purchase_edited",
            "purchase",
            Some(&input.purchase_id),
            None,
            Some(&json!({
                "doc_no": doc_no,
                "old_total": old_total,
                "new_total": new_total_paisa,
                "revision": new_revision,
            }).to_string()),
        )?;

        let outbox_payload = json!({
            "purchase_id": input.purchase_id,
            "doc_no": doc_no,
            "old_total_paisa": old_total,
            "new_total_paisa": new_total_paisa,
            "revision": new_revision,
            "edited_by": actor_id,
            "edited_at": now_str,
        }).to_string();

        let _ = tx.execute(
            "INSERT INTO sync_outbox (event_id, event_type, payload_json, occurred_at) VALUES (?1, 'purchase_edited', ?2, ?3)",
            params![Ulid::new().to_string(), outbox_payload, now_str],
        );

        tx.commit().map_err(|e| PosError::Db(format!("Failed to commit purchase edit: {}", e)))?;
        (doc_no, created_at, new_total_paisa, new_revision, new_lines)
        };

        let vendor_name: String = self.conn()?.query_row(
            "SELECT name FROM parties WHERE id = ?1",
            params![input.vendor_id],
            |r| r.get(0),
        )?;

        Ok(PurchaseInvoice {
            id: input.purchase_id,
            doc_no,
            vendor_id: input.vendor_id,
            vendor_name,
            vendor_invoice_no: input.vendor_invoice_no,
            status: "received".to_string(),
            freight_paisa: input.freight_paisa,
            total_paisa: new_total_paisa,
            lines: new_lines,
            created_at,
            revision: new_revision,
        })
    }

    /// Dev bridge dispatch router for history commands.
    pub(crate) fn dispatch_history(&mut self, cmd: &str, a: &serde_json::Value) -> Option<Result<serde_json::Value>> {
        use super::{arg, json};
        let r = match cmd {
            "list_sales" => (|| json(self.list_sales(arg(a, "query")?)?))(),
            "sale_detail" => (|| json(self.sale_detail(&arg::<String>(a, "sale_id")?)?))(),
            "sale_revision" => (|| json(self.sale_revision(&arg::<String>(a, "sale_id")?, arg(a, "revision")?)?))(),
            "quote_sale_edit" => (|| json(self.quote_sale_edit(&arg(a, "input")?)?))(),
            "edit_sale" => (|| json(self.edit_sale(arg(a, "input")?)?))(),
            "list_purchases_filtered" => (|| json(self.list_purchases_filtered(arg(a, "query")?)?))(),
            "purchase_detail" => (|| json(self.purchase_detail(&arg::<String>(a, "purchase_id")?)?))(),
            "purchase_revision" => (|| json(self.purchase_revision(&arg::<String>(a, "purchase_id")?, arg(a, "revision")?)?))(),
            "quote_purchase_edit" => (|| json(self.quote_purchase_edit(&arg(a, "input")?)?))(),
            "edit_purchase" => (|| json(self.edit_purchase(arg(a, "input")?)?))(),
            _ => return None,
        };
        Some(r)
    }
}
