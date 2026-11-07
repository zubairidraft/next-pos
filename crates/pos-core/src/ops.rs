//! Service items, purchase returns and claims.
//!
//! * A service (repair, fitting, delivery) is sold like a product but has no
//!   stock and no cost.
//! * A purchase return sends goods back to a vendor: stock goes out and the
//!   amount we owe the vendor goes down.
//! * A claim tracks a customer's item under warranty, or damaged / expired
//!   stock sent to the company or vendor. Damaged / expired stock leaves the
//!   sellable stock when the claim is made; it comes back if the vendor
//!   replaces it, or the vendor's balance goes down if they give credit.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use super::{now, PosApp};
use crate::auth::Permission;
use crate::domain::audit::AuditRepo;
use crate::domain::catalog::{CreateProductParams, ProductSearchResult};
use crate::domain::inventory::{InventoryRepo, RecordMovementParams};
use crate::domain::purchase::PurchaseRepo;
use crate::error::{PosError, Result};
use crate::money::mul_div_half_up;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnLineInput {
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
    /// Cost per unit being returned (what the vendor will credit).
    pub unit_cost_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnInput {
    pub vendor_id: String,
    #[serde(default)]
    pub purchase_id: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    pub lines: Vec<PurchaseReturnLineInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnLine {
    pub variant_id: String,
    pub product_name: String,
    pub unit_code: String,
    pub qty_milli: i64,
    pub unit_cost_paisa: i64,
    pub total_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseReturnDoc {
    pub id: String,
    pub doc_no: String,
    pub vendor_id: String,
    pub vendor_name: String,
    pub reason: Option<String>,
    pub total_paisa: i64,
    pub created_at: String,
    pub lines: Vec<PurchaseReturnLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimInput {
    /// warranty | damaged | expired
    pub kind: String,
    pub variant_id: String,
    pub qty_milli: i64,
    #[serde(default)]
    pub customer_id: Option<String>,
    #[serde(default)]
    pub vendor_id: Option<String>,
    #[serde(default)]
    pub serial: Option<String>,
    #[serde(default)]
    pub sale_doc: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub id: String,
    pub doc_no: String,
    pub kind: String,
    pub status: String,
    pub variant_id: String,
    pub product_name: String,
    pub unit_code: String,
    pub qty_milli: i64,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub vendor_id: Option<String>,
    pub vendor_name: Option<String>,
    pub serial: Option<String>,
    pub sale_doc: Option<String>,
    pub notes: Option<String>,
    pub value_paisa: i64,
    pub credit_paisa: i64,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
}

pub const CLAIM_KINDS: [&str; 3] = ["warranty", "damaged", "expired"];
pub const CLAIM_STATUSES: [&str; 6] = ["open", "sent", "replaced", "credited", "rejected", "closed"];

fn is_service(conn: &rusqlite::Connection, variant_id: &str) -> Result<bool> {
    let v: Option<i64> = conn
        .query_row(
            "SELECT p.is_service FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
            params![variant_id],
            |r| r.get(0),
        )
        .optional()?;
    match v {
        Some(v) => Ok(v != 0),
        None => Err(PosError::NotFound("Product not found".into())),
    }
}

/// Units per base unit, in milli (carton of 24 = 24000). Base unit = 1000.
fn factor_of(conn: &rusqlite::Connection, variant_id: &str, unit_id: &str) -> Result<i64> {
    let f: Option<i64> = conn
        .query_row(
            "SELECT factor_to_base FROM variant_units WHERE variant_id = ?1 AND unit_id = ?2 LIMIT 1",
            params![variant_id, unit_id],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(f) = f {
        return Ok(f);
    }
    let base: Option<String> = conn
        .query_row(
            "SELECT p.base_unit_id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
            params![variant_id],
            |r| r.get(0),
        )
        .optional()?;
    if base.as_deref() == Some(unit_id) {
        Ok(1000)
    } else {
        Err(PosError::Validation("That unit is not used for this product".into()))
    }
}

fn party_name(conn: &rusqlite::Connection, id: &str) -> Result<String> {
    conn.query_row("SELECT name FROM parties WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| PosError::NotFound("Customer / vendor not found".into()))
}

/// Add a khata line for a party, keeping the running balance.
fn ledger_entry(conn: &rusqlite::Connection, party_id: &str, entry_type: &str, debit: i64, credit: i64, doc: &str, at: &str) -> Result<()> {
    let prev: i64 = conn
        .query_row(
            "SELECT balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
            params![party_id],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or_else(|| conn.query_row("SELECT opening_balance_paisa FROM parties WHERE id = ?1", params![party_id], |r| r.get(0)).unwrap_or(0));
    conn.execute(
        "INSERT INTO party_ledger (id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![Ulid::new().to_string(), party_id, entry_type, debit, credit, prev + credit - debit, doc, at],
    )?;
    Ok(())
}

fn avg_cost(conn: &rusqlite::Connection, variant_id: &str) -> Result<i64> {
    Ok(InventoryRepo::get_balance(conn, variant_id)?.map(|b| b.avg_cost_paisa).unwrap_or(0))
}

impl PosApp {
    // ------------------------------------------------------------ services

    /// Create a product, or a service (no stock) when `is_service`.
    pub fn create_item(&self, params: CreateProductParams, is_service: bool) -> Result<ProductSearchResult> {
        let p = self.create_product(params)?;
        if is_service {
            self.conn()?.execute(
                "UPDATE products SET is_service = 1, reorder_level_milli = 0 WHERE id = ?1",
                params![p.product_id],
            )?;
        }
        Ok(p)
    }

    pub(crate) fn variant_is_service(&self, variant_id: &str) -> bool {
        self.conn().ok().and_then(|c| is_service(c, variant_id).ok()).unwrap_or(false)
    }

    // ------------------------------------------------------------ purchase returns

    pub fn post_purchase_return(&mut self, input: PurchaseReturnInput) -> Result<PurchaseReturnDoc> {
        let uid = self.require(Permission::PurchaseEntry)?.user_id.clone();
        if input.lines.is_empty() {
            return Err(PosError::Validation("Add the items you are returning".into()));
        }
        let conn = self.conn_mut()?;
        let vendor_name = party_name(conn, &input.vendor_id)?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let id = Ulid::new().to_string();
        let doc_no = PurchaseRepo::next_doc_no(&tx, "purchase_return")?;
        let at = now().to_rfc3339();
        let reason = input.reason.as_deref().map(str::trim).filter(|r| !r.is_empty()).map(str::to_string);

        // Header first (lines point to it); the total is filled in after the lines.
        tx.execute(
            "INSERT INTO purchase_returns (id, doc_no, vendor_id, purchase_id, reason, total_paisa, user_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)",
            params![id, doc_no, input.vendor_id, input.purchase_id, reason, uid, at],
        )?;
        let mut lines = Vec::new();
        let mut total = 0i64;
        for l in &input.lines {
            if l.qty_milli <= 0 {
                return Err(PosError::Validation("Return quantity must be more than 0".into()));
            }
            if l.unit_cost_paisa < 0 {
                return Err(PosError::Validation("Cost cannot be negative".into()));
            }
            if is_service(&tx, &l.variant_id)? {
                return Err(PosError::Validation("Services have no stock to return".into()));
            }
            let factor = factor_of(&tx, &l.variant_id, &l.unit_id)?;
            let base_qty = mul_div_half_up(l.qty_milli, factor, 1000);
            let line_total = mul_div_half_up(l.qty_milli, l.unit_cost_paisa, 1000);
            total += line_total;
            let line_id = Ulid::new().to_string();
            tx.execute(
                "INSERT INTO purchase_return_lines (id, return_id, variant_id, unit_id, qty_milli, unit_cost_paisa, total_paisa)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![line_id, id, l.variant_id, l.unit_id, l.qty_milli, l.unit_cost_paisa, line_total],
            )?;
            // Stock leaves at the average cost, so the value of what stays is unchanged.
            let cost = avg_cost(&tx, &l.variant_id)?;
            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: l.variant_id.clone(),
                    qty_signed_milli: -base_qty,
                    movement_type: "purchase_return".into(),
                    source_doc: doc_no.clone(),
                    source_line: Some(line_id),
                    unit_cost_paisa: cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: Some(uid.clone()),
                },
            )?;
            let (name, unit_code): (String, String) = tx.query_row(
                "SELECT p.name, u.code FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN units u ON u.id = ?2 WHERE pv.id = ?1",
                params![l.variant_id, l.unit_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            lines.push(PurchaseReturnLine { variant_id: l.variant_id.clone(), product_name: name, unit_code, qty_milli: l.qty_milli, unit_cost_paisa: l.unit_cost_paisa, total_paisa: line_total });
        }
        tx.execute("UPDATE purchase_returns SET total_paisa = ?2 WHERE id = ?1", params![id, total])?;
        // We owe the vendor less.
        ledger_entry(&tx, &input.vendor_id, "purchase_return", total, 0, &doc_no, &at)?;
        AuditRepo::write(&tx, Some(&uid), "purchase_returned", "purchase_return", Some(&id), reason.as_deref(), Some(&format!("{{\"doc_no\":\"{doc_no}\",\"total_paisa\":{total}}}")))?;
        tx.commit()?;
        Ok(PurchaseReturnDoc { id, doc_no, vendor_id: input.vendor_id, vendor_name, reason, total_paisa: total, created_at: at, lines })
    }

    pub fn list_purchase_returns(&self, limit: usize) -> Result<Vec<PurchaseReturnDoc>> {
        self.require(Permission::PurchaseEntry)?;
        let conn = self.conn()?;
        let mut st = conn.prepare(
            "SELECT r.id, r.doc_no, r.vendor_id, p.name, r.reason, r.total_paisa, r.created_at
             FROM purchase_returns r JOIN parties p ON p.id = r.vendor_id ORDER BY r.created_at DESC LIMIT ?1",
        )?;
        let heads = st
            .query_map(params![limit.clamp(1, 500) as i64], |r| {
                Ok(PurchaseReturnDoc { id: r.get(0)?, doc_no: r.get(1)?, vendor_id: r.get(2)?, vendor_name: r.get(3)?, reason: r.get(4)?, total_paisa: r.get(5)?, created_at: r.get(6)?, lines: vec![] })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut out = Vec::with_capacity(heads.len());
        for mut h in heads {
            let mut ls = conn.prepare(
                "SELECT l.variant_id, p.name, u.code, l.qty_milli, l.unit_cost_paisa, l.total_paisa
                 FROM purchase_return_lines l JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id JOIN units u ON u.id = l.unit_id
                 WHERE l.return_id = ?1",
            )?;
            h.lines = ls
                .query_map(params![h.id], |r| Ok(PurchaseReturnLine { variant_id: r.get(0)?, product_name: r.get(1)?, unit_code: r.get(2)?, qty_milli: r.get(3)?, unit_cost_paisa: r.get(4)?, total_paisa: r.get(5)? }))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            out.push(h);
        }
        Ok(out)
    }

    // ------------------------------------------------------------ claims

    pub fn create_claim(&mut self, input: ClaimInput) -> Result<Claim> {
        let kind = input.kind.trim().to_lowercase();
        if !CLAIM_KINDS.contains(&kind.as_str()) {
            return Err(PosError::Validation("Claim type must be warranty, damaged or expired".into()));
        }
        // Taking damaged / expired goods out of stock is a stock change.
        let perm = if kind == "warranty" { Permission::SalesCreate } else { Permission::InventoryAdjust };
        let uid = self.require(perm)?.user_id.clone();
        if input.qty_milli <= 0 {
            return Err(PosError::Validation("Quantity must be more than 0".into()));
        }
        let conn = self.conn_mut()?;
        if is_service(conn, &input.variant_id)? {
            return Err(PosError::Validation("Claims are for products, not services".into()));
        }
        if let Some(c) = &input.customer_id {
            party_name(conn, c)?;
        }
        if let Some(v) = &input.vendor_id {
            party_name(conn, v)?;
        }
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let id = Ulid::new().to_string();
        let doc_no = PurchaseRepo::next_doc_no(&tx, "claim")?;
        let at = now().to_rfc3339();
        let cost = avg_cost(&tx, &input.variant_id)?;
        let value = mul_div_half_up(input.qty_milli, cost, 1000);
        if kind != "warranty" {
            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: input.variant_id.clone(),
                    qty_signed_milli: -input.qty_milli,
                    movement_type: "claim_out".into(),
                    source_doc: doc_no.clone(),
                    source_line: None,
                    unit_cost_paisa: cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: Some(uid.clone()),
                },
            )?;
        }
        let clean = |s: &Option<String>| s.as_deref().map(str::trim).filter(|x| !x.is_empty()).map(str::to_string);
        tx.execute(
            "INSERT INTO claims (id, doc_no, kind, status, variant_id, qty_milli, customer_id, vendor_id, serial, sale_doc, notes, value_paisa, credit_paisa, user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'open', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?13, ?13)",
            params![id, doc_no, kind, input.variant_id, input.qty_milli, input.customer_id, input.vendor_id, clean(&input.serial), clean(&input.sale_doc), clean(&input.notes), value, uid, at],
        )?;
        AuditRepo::write(&tx, Some(&uid), "claim_created", "claim", Some(&id), None, Some(&format!("{{\"doc_no\":\"{doc_no}\",\"kind\":\"{kind}\"}}")))?;
        tx.commit()?;
        self.claim(&id)
    }

    /// Move a claim along: sent → replaced / credited / rejected → closed.
    pub fn update_claim(&mut self, id: &str, status: &str, notes: Option<String>, credit_paisa: Option<i64>) -> Result<Claim> {
        let uid = self.require(Permission::InventoryAdjust)?.user_id.clone();
        let status = status.trim().to_lowercase();
        if !CLAIM_STATUSES.contains(&status.as_str()) || status == "open" {
            return Err(PosError::Validation("Unknown claim status".into()));
        }
        let c = self.claim(id)?;
        let allowed: &[&str] = match c.status.as_str() {
            "open" => &["sent", "replaced", "credited", "rejected", "closed"],
            "sent" => &["replaced", "credited", "rejected", "closed"],
            "replaced" | "credited" | "rejected" => &["closed"],
            _ => &[],
        };
        if !allowed.contains(&status.as_str()) {
            return Err(PosError::BusinessRule(format!("A claim that is {} cannot be marked {}", c.status, status)));
        }
        let stock_claim = c.kind != "warranty";
        if status == "credited" {
            if !stock_claim {
                return Err(PosError::Validation("Credit is for damaged / expired stock claims".into()));
            }
            if c.vendor_id.is_none() {
                return Err(PosError::Validation("Choose the vendor for this claim before marking it credited".into()));
            }
        }
        let credit = if status == "credited" { credit_paisa.unwrap_or(c.value_paisa).max(0) } else { 0 };
        let conn = self.conn_mut()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let at = now().to_rfc3339();
        if stock_claim && status == "replaced" {
            // The vendor sent good stock back.
            let unit_cost = if c.qty_milli > 0 { mul_div_half_up(c.value_paisa, 1000, c.qty_milli) } else { 0 };
            let bal = InventoryRepo::get_balance(&tx, &c.variant_id)?;
            InventoryRepo::record_movement(
                &tx,
                RecordMovementParams {
                    variant_id: c.variant_id.clone(),
                    qty_signed_milli: c.qty_milli,
                    movement_type: "claim_in".into(),
                    source_doc: c.doc_no.clone(),
                    source_line: None,
                    unit_cost_paisa: unit_cost,
                    batch_id: None,
                    serial_id: None,
                    user_id: Some(uid.clone()),
                },
            )?;
            if let Some(b) = bal {
                let new_avg = PurchaseRepo::calculate_new_avg_cost(b.on_hand_milli, b.avg_cost_paisa, c.qty_milli, unit_cost);
                InventoryRepo::update_avg_cost(&tx, &c.variant_id, new_avg)?;
            }
        }
        if credit > 0 {
            ledger_entry(&tx, c.vendor_id.as_deref().unwrap_or_default(), "claim_credit", credit, 0, &c.doc_no, &at)?;
        }
        let notes = notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
        tx.execute(
            "UPDATE claims SET status = ?2, updated_at = ?3,
                    closed_at = CASE WHEN ?2 IN ('replaced','credited','rejected','closed') THEN COALESCE(closed_at, ?3) ELSE closed_at END,
                    credit_paisa = credit_paisa + ?4,
                    notes = CASE WHEN ?5 IS NULL THEN notes WHEN notes IS NULL OR notes = '' THEN ?5 ELSE notes || char(10) || ?5 END
             WHERE id = ?1",
            params![id, status, at, credit, notes],
        )?;
        AuditRepo::write(&tx, Some(&uid), "claim_updated", "claim", Some(id), None, Some(&format!("{{\"status\":\"{status}\"}}")))?;
        tx.commit()?;
        self.claim(id)
    }

    pub fn claim(&self, id: &str) -> Result<Claim> {
        self.list_claims_where("c.id = ?1", params![id])?.into_iter().next().ok_or_else(|| PosError::NotFound("Claim not found".into()))
    }

    /// Claims, newest first. `status`: "open" (not finished), "done", or None for all.
    pub fn list_claims(&self, status: Option<String>) -> Result<Vec<Claim>> {
        self.require_login()?;
        match status.as_deref() {
            Some("open") => self.list_claims_where("c.status IN ('open','sent')", params![]),
            Some("done") => self.list_claims_where("c.status NOT IN ('open','sent')", params![]),
            _ => self.list_claims_where("1 = 1", params![]),
        }
    }

    fn list_claims_where(&self, cond: &str, p: &[&dyn rusqlite::ToSql]) -> Result<Vec<Claim>> {
        let conn = self.conn()?;
        let sql = format!(
            "SELECT c.id, c.doc_no, c.kind, c.status, c.variant_id, pr.name, u.code, c.qty_milli, c.customer_id, cu.name, c.vendor_id, ve.name,
                    c.serial, c.sale_doc, c.notes, c.value_paisa, c.credit_paisa, c.created_at, c.updated_at, c.closed_at
             FROM claims c
             JOIN product_variants pv ON pv.id = c.variant_id JOIN products pr ON pr.id = pv.product_id JOIN units u ON u.id = pr.base_unit_id
             LEFT JOIN parties cu ON cu.id = c.customer_id LEFT JOIN parties ve ON ve.id = c.vendor_id
             WHERE {cond} ORDER BY c.created_at DESC LIMIT 1000"
        );
        let mut st = conn.prepare(&sql)?;
        let rows = st
            .query_map(p, |r| {
                Ok(Claim {
                    id: r.get(0)?,
                    doc_no: r.get(1)?,
                    kind: r.get(2)?,
                    status: r.get(3)?,
                    variant_id: r.get(4)?,
                    product_name: r.get(5)?,
                    unit_code: r.get(6)?,
                    qty_milli: r.get(7)?,
                    customer_id: r.get(8)?,
                    customer_name: r.get(9)?,
                    vendor_id: r.get(10)?,
                    vendor_name: r.get(11)?,
                    serial: r.get(12)?,
                    sale_doc: r.get(13)?,
                    notes: r.get(14)?,
                    value_paisa: r.get(15)?,
                    credit_paisa: r.get(16)?,
                    created_at: r.get(17)?,
                    updated_at: r.get(18)?,
                    closed_at: r.get(19)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ------------------------------------------------------------ product import (Excel / CSV file)

    /// Import products from an Excel (.xlsx / .xls) or CSV file. Existing SKUs are skipped.
    pub fn import_products_file(&mut self, file_name: &str, data_base64: &str) -> Result<crate::domain::importer::ImportSummary> {
        use base64::Engine;
        use crate::domain::importer::CatalogImporter;
        let uid = self.require(Permission::PriceEdit)?.user_id.clone();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64.trim().as_bytes())
            .map_err(|_| PosError::Validation("The file could not be read".into()))?;
        if bytes.len() > 30 * 1024 * 1024 {
            return Err(PosError::Validation("The file is too large (over 30 MB)".into()));
        }
        let ext = file_name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        let summary = match ext.as_str() {
            "csv" | "txt" => CatalogImporter::import_csv(self.conn_mut()?, bytes.as_slice())?,
            "xlsx" | "xls" => {
                let tmp = self.data_dir.join(format!("import-{}.{ext}", Ulid::new()));
                std::fs::write(&tmp, &bytes).map_err(|e| PosError::Validation(format!("Could not read the file: {e}")))?;
                let r = CatalogImporter::import_excel(self.conn_mut()?, &tmp);
                let _ = std::fs::remove_file(&tmp);
                r?
            }
            _ => return Err(PosError::Validation("Choose an Excel (.xlsx) or CSV file".into())),
        };
        AuditRepo::write(self.conn()?, Some(&uid), "catalog_imported", "product", None, None,
            Some(&format!("{{\"imported\":{},\"skipped\":{}}}", summary.imported, summary.skipped)))?;
        Ok(summary)
    }

    /// Commands added here, for `dispatch`.
    pub(crate) fn dispatch_ops(&mut self, cmd: &str, a: &serde_json::Value) -> Option<Result<serde_json::Value>> {
        use super::{arg, json};
        let r = match cmd {
            "create_product" => (|| json(self.create_item(arg(a, "params")?, arg::<Option<bool>>(a, "is_service")?.unwrap_or(false))?))(),
            "post_purchase_return" => (|| json(self.post_purchase_return(arg(a, "input")?)?))(),
            "list_purchase_returns" => (|| json(self.list_purchase_returns(arg::<Option<usize>>(a, "limit")?.unwrap_or(100))?))(),
            "create_claim" => (|| json(self.create_claim(arg(a, "input")?)?))(),
            "update_claim" => (|| json(self.update_claim(&arg::<String>(a, "id")?, &arg::<String>(a, "status")?, arg(a, "notes")?, arg(a, "credit_paisa")?)?))(),
            "list_claims" => (|| json(self.list_claims(arg(a, "status")?)?))(),
            "import_products_file" => (|| json(self.import_products_file(&arg::<String>(a, "file_name")?, &arg::<String>(a, "data_base64")?)?))(),
            _ => return None,
        };
        Some(r)
    }
}
