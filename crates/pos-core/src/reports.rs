//! Shop reports, each for a date range (from – to), as plain tables the
//! screen shows and the PDF / Excel export writes.
//!
//! Money is in paisa, quantities in milli-units, percentages as numbers
//! (23.5 = 23.5 %), dates as RFC 3339 text. The screen formats them.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Duration, Utc};
use rusqlite::params;
use serde::Serialize;
use serde_json::{json, Value};

use super::{now, PosApp};
use crate::auth::Permission;
use crate::domain::catalog::CatalogRepo;
use crate::domain::inventory::InventoryRepo;
use crate::error::{PosError, Result};

#[derive(Debug, Clone, Serialize)]
pub struct ReportColumn {
    pub key: String,
    pub label: String,
    /// text | money | qty | int | date | datetime | percent
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SummaryItem {
    pub label: String,
    pub value: Value,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportTable {
    pub kind: String,
    pub title: String,
    pub from: String,
    pub to: String,
    /// False for lists that show "now" (products, customers, vendors).
    pub dated: bool,
    pub columns: Vec<ReportColumn>,
    pub rows: Vec<Vec<Value>>,
    /// Same length as columns; Null where nothing is added up.
    pub totals: Vec<Value>,
    pub summary: Vec<SummaryItem>,
    pub note: Option<String>,
}

/// The reports the screen offers, in menu order: (kind, title, options).
pub const REPORTS: &[(&str, &str)] = &[
    ("stock", "Stock report"),
    ("purchases", "Purchase report"),
    ("purchase_returns", "Purchase return report"),
    ("sales", "Sales report"),
    ("sale_returns", "Sale return report"),
    ("services", "Services report"),
    ("daily", "Daily summary"),
    ("recovery", "Recovery report"),
    ("salesman", "Salesman report"),
    ("claims", "Claim report"),
    ("profit", "Profit report"),
    ("activity", "Activity report"),
    ("analysis_trend", "Analysis: sales trend"),
    ("analysis_movers", "Analysis: fast and slow items"),
    ("analysis_margin", "Analysis: product margin"),
    ("list_products", "List: products"),
    ("list_customers", "List: customers"),
    ("list_vendors", "List: vendors"),
];

struct Builder {
    columns: Vec<ReportColumn>,
    rows: Vec<Vec<Value>>,
    summary: Vec<SummaryItem>,
    note: Option<String>,
    sum_cols: Vec<usize>,
}

impl Builder {
    fn new(cols: &[(&str, &str, &str)]) -> Self {
        Builder {
            columns: cols.iter().map(|(k, l, t)| ReportColumn { key: k.to_string(), label: l.to_string(), kind: t.to_string() }).collect(),
            rows: vec![],
            summary: vec![],
            note: None,
            sum_cols: vec![],
        }
    }
    /// Add up these columns in the totals row.
    fn sum(mut self, keys: &[&str]) -> Self {
        self.sum_cols = keys.iter().filter_map(|k| self.columns.iter().position(|c| c.key == *k)).collect();
        self
    }
    fn row(&mut self, r: Vec<Value>) {
        self.rows.push(r);
    }
    fn stat(&mut self, label: &str, value: Value, kind: &str) {
        self.summary.push(SummaryItem { label: label.into(), value, kind: kind.into() });
    }
    fn finish(self, kind: &str, from: &str, to: &str, dated: bool) -> ReportTable {
        let title = REPORTS.iter().find(|(k, _)| *k == kind).map(|(_, t)| t.to_string()).unwrap_or_else(|| kind.to_string());
        let mut totals = vec![Value::Null; self.columns.len()];
        if !self.sum_cols.is_empty() && !self.rows.is_empty() {
            for &c in &self.sum_cols {
                let s: i64 = self.rows.iter().map(|r| r.get(c).and_then(Value::as_i64).unwrap_or(0)).sum();
                totals[c] = json!(s);
            }
            if let Some(first_text) = self.columns.iter().position(|c| c.kind == "text" || c.kind == "date" || c.kind == "datetime") {
                if totals[first_text].is_null() {
                    totals[first_text] = json!("Total");
                }
            }
        } else {
            totals.clear();
        }
        ReportTable { kind: kind.into(), title, from: from.into(), to: to.into(), dated, columns: self.columns, rows: self.rows, totals, summary: self.summary, note: self.note }
    }
}

fn pct(part: i64, whole: i64) -> Value {
    if whole == 0 {
        Value::Null
    } else {
        json!(((part as f64 / whole as f64) * 1000.0).round() / 10.0)
    }
}

fn parse_instant(s: &str, what: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s.trim())
        .map(|d| d.with_timezone(&Utc))
        .map_err(|_| PosError::Validation(format!("Choose a valid {what} date")))
}

/// SQL for the local calendar day of a stored UTC time.
fn day_sql(col: &str, offset_min: i64) -> String {
    format!("date(datetime({col}, '{offset_min:+} minutes'))")
}

impl PosApp {
    fn username_map(&self) -> Result<HashMap<String, String>> {
        let conn = self.conn()?;
        let mut st = conn.prepare("SELECT id, username FROM users")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?.collect::<std::result::Result<HashMap<_, _>, _>>()?;
        Ok(rows)
    }

    /// One report for the period. `offset_min` is the shop's time zone (Pakistan = 300).
    pub fn report(&self, kind: &str, from: &str, to: &str, offset_min: Option<i64>) -> Result<ReportTable> {
        if kind == "activity" {
            self.require(Permission::SettingsManage)?;
        } else {
            self.require(Permission::ReportsView)?;
        }
        if !REPORTS.iter().any(|(k, _)| *k == kind) {
            return Err(PosError::NotFound(format!("Unknown report '{kind}'")));
        }
        let f = parse_instant(from, "from")?;
        let t = parse_instant(to, "to")?;
        if t < f {
            return Err(PosError::Validation("The 'to' date is before the 'from' date".into()));
        }
        if t - f > Duration::days(3700) {
            return Err(PosError::Validation("Choose a period of at most 10 years".into()));
        }
        let off = offset_min.unwrap_or(300).clamp(-720, 840);
        let (fs, ts) = (f.to_rfc3339(), t.to_rfc3339());
        let conn = self.conn()?;
        match kind {
            "stock" => self.r_stock(conn, &fs, &ts, t),
            "purchases" => r_purchases(conn, &fs, &ts),
            "purchase_returns" => r_purchase_returns(conn, &fs, &ts),
            "sales" => self.r_sales(conn, &fs, &ts),
            "sale_returns" => r_sale_returns(conn, &fs, &ts),
            "services" => r_services(conn, &fs, &ts),
            "daily" => r_daily(conn, &fs, &ts, off),
            "recovery" => r_recovery(conn, &fs, &ts),
            "salesman" => self.r_salesman(conn, &fs, &ts),
            "claims" => r_claims(conn, &fs, &ts),
            "profit" => r_profit(conn, &fs, &ts),
            "activity" => self.r_activity(conn, &fs, &ts),
            "analysis_trend" => r_trend(conn, f, t, off),
            "analysis_movers" => r_movers(conn, &fs, &ts, f, t),
            "analysis_margin" => r_margin(conn, &fs, &ts),
            "list_products" => r_list_products(conn),
            "list_customers" => r_list_parties(conn, "list_customers"),
            "list_vendors" => r_list_parties(conn, "list_vendors"),
            _ => unreachable!(),
        }
    }

    fn r_stock(&self, conn: &rusqlite::Connection, fs: &str, ts: &str, t: DateTime<Utc>) -> Result<ReportTable> {
        let mut b = Builder::new(&[
            ("name", "Product", "text"),
            ("sku", "SKU", "text"),
            ("unit", "Unit", "text"),
            ("opening", "Opening", "qty"),
            ("in", "In", "qty"),
            ("out", "Out", "qty"),
            ("closing", "Closing", "qty"),
            ("cost", "Avg cost", "money"),
            ("value", "Value", "money"),
            ("status", "Status", "text"),
        ])
        .sum(&["value"]);
        // Up to now: the closing stock is the stock on hand.
        let to_now = t >= now() - Duration::minutes(5);
        let mut st = conn.prepare(
            "SELECT p.name, p.sku, u.code,
                    COALESCE(SUM(CASE WHEN sm.occurred_at < ?1 THEN sm.qty_signed_milli END), 0),
                    COALESCE(SUM(CASE WHEN sm.occurred_at >= ?1 AND sm.qty_signed_milli > 0 THEN sm.qty_signed_milli END), 0),
                    COALESCE(SUM(CASE WHEN sm.occurred_at >= ?1 AND sm.qty_signed_milli < 0 THEN -sm.qty_signed_milli END), 0),
                    COALESCE(ib.on_hand_milli, 0), COALESCE(ib.avg_cost_paisa, 0), p.reorder_level_milli
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             JOIN units u ON u.id = p.base_unit_id
             LEFT JOIN stock_movements sm ON sm.variant_id = pv.id AND sm.occurred_at <= ?2
             LEFT JOIN inventory_balances ib ON ib.variant_id = pv.id
             WHERE p.is_service = 0 AND p.active = 1
             GROUP BY pv.id ORDER BY p.name COLLATE NOCASE",
        )?;
        let rows = st.query_map(params![fs, ts], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
            ))
        })?;
        let (mut items, mut low, mut out) = (0, 0, 0);
        for row in rows {
            let (name, sku, unit, mut opening, qin, qout, on_hand, cost, reorder) = row?;
            let closing = if to_now {
                opening = on_hand - qin + qout;
                on_hand
            } else {
                opening + qin - qout
            };
            let status = if closing <= 0 {
                out += 1;
                "Out of stock"
            } else if reorder > 0 && closing <= reorder {
                low += 1;
                "Low"
            } else {
                ""
            };
            items += 1;
            b.row(vec![json!(name), json!(sku), json!(unit), json!(opening), json!(qin), json!(qout), json!(closing), json!(cost), json!(closing.max(0) * cost / 1000), json!(status)]);
        }
        b.stat("Products", json!(items), "int");
        b.stat("Low stock", json!(low), "int");
        b.stat("Out of stock", json!(out), "int");
        let value: i64 = b.rows.iter().map(|r| r[8].as_i64().unwrap_or(0)).sum();
        b.stat("Stock value (at cost)", json!(value), "money");
        Ok(b.finish("stock", fs, ts, true))
    }

    fn r_sales(&self, conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
        let mut b = Builder::new(&[
            ("date", "Date", "datetime"),
            ("doc", "Invoice", "text"),
            ("customer", "Customer", "text"),
            ("salesman", "Salesman", "text"),
            ("items", "Items", "int"),
            ("subtotal", "Subtotal", "money"),
            ("discount", "Discount", "money"),
            ("tax", "Tax", "money"),
            ("total", "Total", "money"),
            ("khata", "On khata", "money"),
            ("paid", "Paid", "money"),
        ])
        .sum(&["items", "subtotal", "discount", "tax", "total", "khata", "paid"]);
        let mut st = conn.prepare(
            "SELECT s.created_at, s.doc_no, COALESCE(pa.name, 'Walk-in'), COALESCE(u1.username, u2.username, ''),
                    (SELECT COUNT(*) FROM sale_lines sl WHERE sl.sale_id = s.id),
                    s.subtotal_paisa, s.discount_paisa, s.tax_paisa, s.total_paisa,
                    COALESCE((SELECT SUM(debit_paisa) FROM party_ledger pl WHERE pl.source_doc = s.doc_no AND pl.entry_type = 'sale'), 0)
             FROM sales s
             LEFT JOIN parties pa ON pa.id = s.party_id
             LEFT JOIN users u1 ON u1.id = s.user_id
             LEFT JOIN cash_sessions cs ON cs.id = s.cash_session_id
             LEFT JOIN users u2 ON u2.id = cs.user_id
             WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
             ORDER BY s.created_at",
        )?;
        let rows = st.query_map(params![fs, ts], |r| {
            let total: i64 = r.get(8)?;
            let khata: i64 = r.get(9)?;
            Ok(vec![
                json!(r.get::<_, String>(0)?),
                json!(r.get::<_, String>(1)?),
                json!(r.get::<_, String>(2)?),
                json!(r.get::<_, String>(3)?),
                json!(r.get::<_, i64>(4)?),
                json!(r.get::<_, i64>(5)?),
                json!(r.get::<_, i64>(6)?),
                json!(r.get::<_, i64>(7)?),
                json!(total),
                json!(khata),
                json!(total - khata),
            ])
        })?;
        for r in rows {
            b.row(r?);
        }
        let total: i64 = b.rows.iter().map(|r| r[8].as_i64().unwrap_or(0)).sum();
        let returns: i64 = conn.query_row(
            "SELECT COALESCE(SUM(refund_paisa), 0) FROM sale_returns WHERE created_at >= ?1 AND created_at <= ?2",
            params![fs, ts],
            |r| r.get(0),
        )?;
        b.stat("Bills", json!(b.rows.len()), "int");
        b.stat("Sales", json!(total), "money");
        b.stat("Returns", json!(returns), "money");
        b.stat("Net sales", json!(total - returns), "money");
        if !b.rows.is_empty() {
            b.stat("Average bill", json!(total / b.rows.len() as i64), "money");
        }
        Ok(b.finish("sales", fs, ts, true))
    }

    fn r_salesman(&self, conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
        let mut b = Builder::new(&[
            ("salesman", "Salesman", "text"),
            ("bills", "Bills", "int"),
            ("sales", "Sales", "money"),
            ("discount", "Discount given", "money"),
            ("profit", "Profit", "money"),
            ("avg", "Average bill", "money"),
            ("price_changes", "Price changes", "int"),
        ])
        .sum(&["bills", "sales", "discount", "profit", "price_changes"]);
        let names = self.username_map()?;
        let mut st = conn.prepare(
            "SELECT COALESCE(s.user_id, cs.user_id, ''), COUNT(*), SUM(s.total_paisa), SUM(s.discount_paisa),
                    SUM(s.total_paisa - s.tax_paisa - (SELECT COALESCE(SUM(cogs_paisa), 0) FROM sale_lines sl WHERE sl.sale_id = s.id))
             FROM sales s LEFT JOIN cash_sessions cs ON cs.id = s.cash_session_id
             WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
             GROUP BY 1 ORDER BY 3 DESC",
        )?;
        let mut changes: HashMap<String, i64> = HashMap::new();
        let mut ch = conn.prepare("SELECT actor, COUNT(*) FROM audit_log WHERE action = 'price_override' AND occurred_at >= ?1 AND occurred_at <= ?2 GROUP BY actor")?;
        for r in ch.query_map(params![fs, ts], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
            let (a, n) = r?;
            changes.insert(a, n);
        }
        let rows = st.query_map(params![fs, ts], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?)))?;
        for r in rows {
            let (uid, bills, sales, disc, profit) = r?;
            let name = names.get(&uid).cloned().unwrap_or_else(|| "(unknown)".into());
            b.row(vec![json!(name), json!(bills), json!(sales), json!(disc), json!(profit), json!(if bills > 0 { sales / bills } else { 0 }), json!(changes.get(&uid).copied().unwrap_or(0))]);
        }
        b.note = Some("Price changes = items sold at a price other than the set sale price.".into());
        Ok(b.finish("salesman", fs, ts, true))
    }

    fn r_activity(&self, conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
        let mut b = Builder::new(&[("time", "Time", "datetime"), ("user", "User", "text"), ("action", "What happened", "text"), ("details", "Details", "text")]);
        let names = self.username_map()?;
        let mut st = conn.prepare(
            "SELECT occurred_at, actor, action, entity, COALESCE(reason, ''), COALESCE(details_json, '')
             FROM audit_log WHERE occurred_at >= ?1 AND occurred_at <= ?2 ORDER BY occurred_at DESC LIMIT 5000",
        )?;
        let rows = st.query_map(params![fs, ts], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?, r.get::<_, String>(5)?))
        })?;
        for r in rows {
            let (at, actor, action, entity, reason, details) = r?;
            let user = names.get(&actor).cloned().unwrap_or_else(|| if actor.is_empty() || actor == "system" { "System".into() } else { actor.clone() });
            let mut d = String::new();
            if let Ok(Value::Object(m)) = serde_json::from_str::<Value>(&details) {
                for (k, v) in m.iter().take(4) {
                    let v = match (k.ends_with("_paisa"), v.as_i64()) {
                        (true, Some(p)) => format!("Rs {:.2}", p as f64 / 100.0),
                        _ => v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string()),
                    };
                    if !d.is_empty() {
                        d.push_str(", ");
                    }
                    d.push_str(&format!("{}: {}", k.trim_end_matches("_paisa").replace('_', " "), v));
                }
            }
            if !reason.is_empty() {
                if !d.is_empty() {
                    d.push_str(" · ");
                }
                d.push_str(&reason);
            }
            b.row(vec![json!(at), json!(user), json!(friendly_action(&action, &entity)), json!(d)]);
        }
        if b.rows.len() >= 5000 {
            b.note = Some("Showing the latest 5000 entries. Choose a shorter period to see all.".into());
        }
        Ok(b.finish("activity", fs, ts, true))
    }

    pub(crate) fn dispatch_reports(&mut self, cmd: &str, a: &Value) -> Option<Result<Value>> {
        use super::{arg, json as to_json};
        let r = match cmd {
            "report" => (|| to_json(self.report(&arg::<String>(a, "kind")?, &arg::<String>(a, "from")?, &arg::<String>(a, "to")?, arg(a, "offset_min")?)?))(),
            "report_list" => to_json(REPORTS.iter().map(|(k, t)| json!({ "kind": k, "title": t })).collect::<Vec<_>>()),
            _ => return None,
        };
        Some(r)
    }
}

fn friendly_action(action: &str, entity: &str) -> String {
    let s = match action {
        "login" | "login_success" => "Logged in",
        "logout" => "Logged out",
        "login_failed" => "Wrong password / PIN",
        "sale_posted" => "Sale",
        "price_override" => "Price changed at the counter",
        "return_posted" => "Sale return",
        "purchase_posted" => "Purchase",
        "purchase_returned" => "Purchase return",
        "product_created" => "Product added",
        "price_changed" => "Price changed",
        "catalog_imported" => "Products imported",
        "claim_created" => "Claim made",
        "claim_updated" => "Claim updated",
        "shift_opened" => "Shift started",
        "shift_closed" => "Shift closed",
        "cash_drop" => "Cash drop",
        "user_created" => "User added",
        "pin_changed" => "PIN changed",
        "settings_changed" => "Settings changed",
        "backup_created" => "Backup made",
        "backup_restored" => "Backup restored",
        "phone_paired" => "Phone connected",
        "phone_removed" => "Phone removed",
        "stock_count_finalized" => "Stock count applied",
        "barcode_assigned" => "Barcode made",
        "payment_received" => "Khata payment received",
        _ => "",
    };
    if s.is_empty() {
        format!("{} ({})", action.replace('_', " "), entity.replace('_', " "))
    } else {
        s.to_string()
    }
}

fn r_purchases(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("date", "Date", "datetime"),
        ("doc", "Purchase no.", "text"),
        ("vendor", "Vendor", "text"),
        ("bill", "Vendor bill", "text"),
        ("items", "Items", "int"),
        ("freight", "Freight", "money"),
        ("total", "Total", "money"),
    ])
    .sum(&["items", "freight", "total"]);
    let mut st = conn.prepare(
        "SELECT pu.created_at, pu.doc_no, pa.name, COALESCE(pu.vendor_invoice_no, ''),
                (SELECT COUNT(*) FROM purchase_lines pl WHERE pl.purchase_id = pu.id), pu.freight_paisa, pu.total_paisa
         FROM purchases pu JOIN parties pa ON pa.id = pu.vendor_id
         WHERE pu.status = 'received' AND pu.created_at >= ?1 AND pu.created_at <= ?2 ORDER BY pu.created_at",
    )?;
    let rows = st.query_map(params![fs, ts], |r| {
        Ok(vec![json!(r.get::<_, String>(0)?), json!(r.get::<_, String>(1)?), json!(r.get::<_, String>(2)?), json!(r.get::<_, String>(3)?), json!(r.get::<_, i64>(4)?), json!(r.get::<_, i64>(5)?), json!(r.get::<_, i64>(6)?)])
    })?;
    for r in rows {
        b.row(r?);
    }
    let total: i64 = b.rows.iter().map(|r| r[6].as_i64().unwrap_or(0)).sum();
    let returns: i64 = conn.query_row("SELECT COALESCE(SUM(total_paisa), 0) FROM purchase_returns WHERE created_at >= ?1 AND created_at <= ?2", params![fs, ts], |r| r.get(0))?;
    b.stat("Purchases", json!(b.rows.len()), "int");
    b.stat("Total bought", json!(total), "money");
    b.stat("Returned to vendors", json!(returns), "money");
    b.stat("Net purchases", json!(total - returns), "money");
    Ok(b.finish("purchases", fs, ts, true))
}

fn r_purchase_returns(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("date", "Date", "datetime"),
        ("doc", "Return no.", "text"),
        ("vendor", "Vendor", "text"),
        ("products", "Products", "text"),
        ("reason", "Reason", "text"),
        ("total", "Amount", "money"),
    ])
    .sum(&["total"]);
    let mut st = conn.prepare(
        "SELECT r.created_at, r.doc_no, pa.name,
                (SELECT GROUP_CONCAT(p.name || ' × ' || (l.qty_milli / 1000.0), ', ') FROM purchase_return_lines l
                   JOIN product_variants pv ON pv.id = l.variant_id JOIN products p ON p.id = pv.product_id WHERE l.return_id = r.id),
                COALESCE(r.reason, ''), r.total_paisa
         FROM purchase_returns r JOIN parties pa ON pa.id = r.vendor_id
         WHERE r.created_at >= ?1 AND r.created_at <= ?2 ORDER BY r.created_at",
    )?;
    let rows = st.query_map(params![fs, ts], |r| {
        Ok(vec![json!(r.get::<_, String>(0)?), json!(r.get::<_, String>(1)?), json!(r.get::<_, String>(2)?), json!(r.get::<_, Option<String>>(3)?.unwrap_or_default()), json!(r.get::<_, String>(4)?), json!(r.get::<_, i64>(5)?)])
    })?;
    for r in rows {
        b.row(r?);
    }
    b.stat("Returns", json!(b.rows.len()), "int");
    let total: i64 = b.rows.iter().map(|r| r[5].as_i64().unwrap_or(0)).sum();
    b.stat("Total returned", json!(total), "money");
    Ok(b.finish("purchase_returns", fs, ts, true))
}

fn r_sale_returns(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("date", "Date", "datetime"),
        ("doc", "Return no.", "text"),
        ("invoice", "Invoice", "text"),
        ("customer", "Customer", "text"),
        ("products", "Products", "text"),
        ("reason", "Reason", "text"),
        ("refund", "Refund", "money"),
    ])
    .sum(&["refund"]);
    let mut st = conn.prepare(
        "SELECT r.created_at, r.doc_no, COALESCE(s.doc_no, ''), COALESCE(pa.name, 'Walk-in'),
                (SELECT GROUP_CONCAT(p.name || ' × ' || (l.qty_milli / 1000.0), ', ') FROM sale_return_lines l
                   JOIN sale_lines sl ON sl.id = l.original_sale_line_id JOIN product_variants pv ON pv.id = sl.variant_id
                   JOIN products p ON p.id = pv.product_id WHERE l.return_id = r.id),
                COALESCE(r.reason, ''), r.refund_paisa
         FROM sale_returns r LEFT JOIN sales s ON s.id = r.original_sale_id LEFT JOIN parties pa ON pa.id = s.party_id
         WHERE r.created_at >= ?1 AND r.created_at <= ?2 ORDER BY r.created_at",
    )?;
    let rows = st.query_map(params![fs, ts], |r| {
        Ok(vec![
            json!(r.get::<_, String>(0)?),
            json!(r.get::<_, String>(1)?),
            json!(r.get::<_, String>(2)?),
            json!(r.get::<_, String>(3)?),
            json!(r.get::<_, Option<String>>(4)?.unwrap_or_default()),
            json!(r.get::<_, String>(5)?),
            json!(r.get::<_, i64>(6)?),
        ])
    })?;
    for r in rows {
        b.row(r?);
    }
    b.stat("Returns", json!(b.rows.len()), "int");
    let total: i64 = b.rows.iter().map(|r| r[6].as_i64().unwrap_or(0)).sum();
    b.stat("Total refunded", json!(total), "money");
    Ok(b.finish("sale_returns", fs, ts, true))
}

fn r_services(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[("name", "Service", "text"), ("bills", "Bills", "int"), ("qty", "Qty", "qty"), ("amount", "Amount", "money")]).sum(&["bills", "amount"]);
    let mut st = conn.prepare(
        "SELECT p.name, COUNT(DISTINCT s.id), SUM(sl.qty_milli), SUM(sl.total_paisa)
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
         JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id
         WHERE p.is_service = 1 AND s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY p.id ORDER BY 4 DESC",
    )?;
    let rows = st.query_map(params![fs, ts], |r| Ok(vec![json!(r.get::<_, String>(0)?), json!(r.get::<_, i64>(1)?), json!(r.get::<_, i64>(2)?), json!(r.get::<_, i64>(3)?)]))?;
    for r in rows {
        b.row(r?);
    }
    let total: i64 = b.rows.iter().map(|r| r[3].as_i64().unwrap_or(0)).sum();
    b.stat("Service income", json!(total), "money");
    if b.rows.is_empty() {
        b.note = Some("No services sold in this period. Add services in Catalog → Add product → Type: Service.".into());
    }
    Ok(b.finish("services", fs, ts, true))
}

/// Adds up one figure per local day into the map.
fn per_day(conn: &rusqlite::Connection, sql: &str, fs: &str, ts: &str, days: &mut BTreeMap<String, [i64; 10]>, slots: &[usize]) -> Result<()> {
    let mut st = conn.prepare(sql)?;
    let rows = st.query_map(params![fs, ts], |r| {
        let d: String = r.get(0)?;
        let mut v = Vec::new();
        for i in 0..slots.len() {
            v.push(r.get::<_, i64>(i + 1)?);
        }
        Ok((d, v))
    })?;
    for r in rows {
        let (d, v) = r?;
        let e = days.entry(d).or_insert([0; 10]);
        for (i, s) in slots.iter().enumerate() {
            e[*s] += v[i];
        }
    }
    Ok(())
}

fn r_daily(conn: &rusqlite::Connection, fs: &str, ts: &str, off: i64) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("day", "Date", "date"),
        ("bills", "Bills", "int"),
        ("sales", "Sales", "money"),
        ("returns", "Returns", "money"),
        ("net", "Net sales", "money"),
        ("profit", "Profit", "money"),
        ("khata", "Sold on khata", "money"),
        ("recovered", "Recovered", "money"),
        ("purchases", "Purchases", "money"),
        ("purchase_returns", "Purchase returns", "money"),
    ])
    .sum(&["bills", "sales", "returns", "net", "profit", "khata", "recovered", "purchases", "purchase_returns"]);
    // slots: 0 bills, 1 sales, 2 returns, 3 profit, 4 khata, 5 recovered, 6 purchases, 7 purchase returns, 8 returned cost
    let mut days: BTreeMap<String, [i64; 10]> = BTreeMap::new();
    let d = |c: &str| day_sql(c, off);
    per_day(
        conn,
        &format!(
            "SELECT {}, COUNT(*), SUM(s.total_paisa), SUM(s.total_paisa - s.tax_paisa - (SELECT COALESCE(SUM(cogs_paisa),0) FROM sale_lines sl WHERE sl.sale_id = s.id))
             FROM sales s WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2 GROUP BY 1",
            d("s.created_at")
        ),
        fs,
        ts,
        &mut days,
        &[0, 1, 3],
    )?;
    per_day(
        conn,
        &format!(
            "SELECT {}, SUM(r.refund_paisa),
                    SUM((SELECT COALESCE(SUM(sl.cogs_paisa * l.qty_milli / MAX(sl.qty_milli, 1)), 0) FROM sale_return_lines l JOIN sale_lines sl ON sl.id = l.original_sale_line_id WHERE l.return_id = r.id))
             FROM sale_returns r WHERE r.created_at >= ?1 AND r.created_at <= ?2 GROUP BY 1",
            d("r.created_at")
        ),
        fs,
        ts,
        &mut days,
        &[2, 8],
    )?;
    per_day(
        conn,
        &format!(
            "SELECT {}, SUM(CASE WHEN pl.entry_type = 'sale' THEN pl.debit_paisa ELSE 0 END), SUM(CASE WHEN pl.entry_type = 'payment' THEN pl.credit_paisa ELSE 0 END)
             FROM party_ledger pl JOIN parties pa ON pa.id = pl.party_id
             WHERE pa.party_type IN ('customer','both') AND pl.occurred_at >= ?1 AND pl.occurred_at <= ?2 GROUP BY 1",
            d("pl.occurred_at")
        ),
        fs,
        ts,
        &mut days,
        &[4, 5],
    )?;
    per_day(conn, &format!("SELECT {}, SUM(total_paisa) FROM purchases WHERE status = 'received' AND created_at >= ?1 AND created_at <= ?2 GROUP BY 1", d("created_at")), fs, ts, &mut days, &[6])?;
    per_day(conn, &format!("SELECT {}, SUM(total_paisa) FROM purchase_returns WHERE created_at >= ?1 AND created_at <= ?2 GROUP BY 1", d("created_at")), fs, ts, &mut days, &[7])?;
    for (day, v) in days {
        let net = v[1] - v[2];
        let profit = v[3] - (v[2] - v[8]);
        b.row(vec![json!(day), json!(v[0]), json!(v[1]), json!(v[2]), json!(net), json!(profit), json!(v[4]), json!(v[5]), json!(v[6]), json!(v[7])]);
    }
    b.note = Some("Profit = sales without tax − cost of goods, less returns.".into());
    Ok(b.finish("daily", fs, ts, true))
}

fn r_recovery(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[("date", "Date", "datetime"), ("customer", "Customer", "text"), ("phone", "Phone", "text"), ("method", "Paid by", "text"), ("doc", "Reference", "text"), ("amount", "Amount", "money")]).sum(&["amount"]);
    let mut st = conn.prepare(
        "SELECT pl.occurred_at, pa.name, COALESCE(pa.phone, ''),
                COALESCE((SELECT py.method FROM payments py WHERE py.party_id = pl.party_id AND py.occurred_at = pl.occurred_at AND py.direction = 'inbound' LIMIT 1), 'cash'),
                pl.source_doc, pl.credit_paisa
         FROM party_ledger pl JOIN parties pa ON pa.id = pl.party_id
         WHERE pl.entry_type = 'payment' AND pa.party_type IN ('customer','both') AND pl.occurred_at >= ?1 AND pl.occurred_at <= ?2
         ORDER BY pl.occurred_at",
    )?;
    let rows = st.query_map(params![fs, ts], |r| {
        Ok(vec![json!(r.get::<_, String>(0)?), json!(r.get::<_, String>(1)?), json!(r.get::<_, String>(2)?), json!(r.get::<_, String>(3)?), json!(r.get::<_, String>(4)?), json!(r.get::<_, i64>(5)?)])
    })?;
    for r in rows {
        b.row(r?);
    }
    let recovered: i64 = b.rows.iter().map(|r| r[5].as_i64().unwrap_or(0)).sum();
    let given: i64 = conn.query_row(
        "SELECT COALESCE(SUM(pl.debit_paisa), 0) FROM party_ledger pl JOIN parties pa ON pa.id = pl.party_id
         WHERE pl.entry_type = 'sale' AND pa.party_type IN ('customer','both') AND pl.occurred_at >= ?1 AND pl.occurred_at <= ?2",
        params![fs, ts],
        |r| r.get(0),
    )?;
    let due: i64 = conn.query_row(
        "SELECT COALESCE(SUM(bal), 0) FROM (
            SELECT COALESCE((SELECT balance_paisa FROM party_ledger pl WHERE pl.party_id = pa.id ORDER BY occurred_at DESC, id DESC LIMIT 1), pa.opening_balance_paisa) AS bal
            FROM parties pa WHERE pa.party_type IN ('customer','both') AND pa.active = 1) WHERE bal > 0",
        [],
        |r| r.get(0),
    )?;
    b.stat("Recovered", json!(recovered), "money");
    b.stat("Sold on khata", json!(given), "money");
    b.stat("Recovery rate", pct(recovered, given), "percent");
    b.stat("Total due from customers (now)", json!(due), "money");
    Ok(b.finish("recovery", fs, ts, true))
}

fn r_claims(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("date", "Date", "datetime"),
        ("doc", "Claim no.", "text"),
        ("type", "Type", "text"),
        ("product", "Product", "text"),
        ("qty", "Qty", "qty"),
        ("customer", "Customer", "text"),
        ("vendor", "Company / vendor", "text"),
        ("status", "Status", "text"),
        ("value", "Value", "money"),
        ("credit", "Credit received", "money"),
    ])
    .sum(&["value", "credit"]);
    let mut st = conn.prepare(
        "SELECT c.created_at, c.doc_no, c.kind, p.name, c.qty_milli, COALESCE(cu.name, ''), COALESCE(ve.name, ''), c.status, c.value_paisa, c.credit_paisa
         FROM claims c JOIN product_variants pv ON pv.id = c.variant_id JOIN products p ON p.id = pv.product_id
         LEFT JOIN parties cu ON cu.id = c.customer_id LEFT JOIN parties ve ON ve.id = c.vendor_id
         WHERE c.created_at >= ?1 AND c.created_at <= ?2 ORDER BY c.created_at",
    )?;
    let rows = st.query_map(params![fs, ts], |r| {
        let kind: String = r.get(2)?;
        let status: String = r.get(7)?;
        Ok(vec![
            json!(r.get::<_, String>(0)?),
            json!(r.get::<_, String>(1)?),
            json!(match kind.as_str() { "warranty" => "Warranty", "damaged" => "Damaged", _ => "Expired" }),
            json!(r.get::<_, String>(3)?),
            json!(r.get::<_, i64>(4)?),
            json!(r.get::<_, String>(5)?),
            json!(r.get::<_, String>(6)?),
            json!(claim_status_label(&status)),
            json!(r.get::<_, i64>(8)?),
            json!(r.get::<_, i64>(9)?),
        ])
    })?;
    for r in rows {
        b.row(r?);
    }
    let open = b.rows.iter().filter(|r| matches!(r[7].as_str(), Some("Open") | Some("Sent to company"))).count();
    b.stat("Claims", json!(b.rows.len()), "int");
    b.stat("Still open", json!(open), "int");
    let lost: i64 = b.rows.iter().filter(|r| r[7].as_str() == Some("Rejected") && r[2].as_str() != Some("Warranty")).map(|r| r[8].as_i64().unwrap_or(0)).sum();
    b.stat("Loss on rejected claims", json!(lost), "money");
    Ok(b.finish("claims", fs, ts, true))
}

pub fn claim_status_label(s: &str) -> &'static str {
    match s {
        "open" => "Open",
        "sent" => "Sent to company",
        "replaced" => "Replaced",
        "credited" => "Credit received",
        "rejected" => "Rejected",
        _ => "Closed",
    }
}

/// Per product: sold qty, sales (without tax), cost, returns, profit.
fn product_profit(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<Vec<(String, String, String, i64, i64, i64, i64, i64)>> {
    let mut st = conn.prepare(
        "SELECT pv.id, p.name, u.code, SUM(sl.qty_milli), SUM(sl.total_paisa - sl.tax_paisa), SUM(sl.cogs_paisa)
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
         JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id JOIN units u ON u.id = sl.unit_id
         WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2
         GROUP BY pv.id",
    )?;
    let mut out: Vec<(String, String, String, i64, i64, i64, i64, i64)> = st
        .query_map(params![fs, ts], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, 0, 0)))?
        .collect::<std::result::Result<_, _>>()?;
    let mut rt = conn.prepare(
        "SELECT sl.variant_id, SUM(l.refund_paisa), SUM(sl.cogs_paisa * l.qty_milli / MAX(sl.qty_milli, 1))
         FROM sale_return_lines l JOIN sale_returns r ON r.id = l.return_id JOIN sale_lines sl ON sl.id = l.original_sale_line_id
         WHERE r.created_at >= ?1 AND r.created_at <= ?2 GROUP BY sl.variant_id",
    )?;
    let rets: HashMap<String, (i64, i64)> = rt
        .query_map(params![fs, ts], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))))?
        .collect::<std::result::Result<_, _>>()?;
    for o in out.iter_mut() {
        if let Some((refund, cost)) = rets.get(&o.0) {
            o.6 = *refund;
            o.7 = *cost;
        }
    }
    Ok(out)
}

fn r_profit(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("name", "Product", "text"),
        ("qty", "Qty sold", "qty"),
        ("sales", "Sales", "money"),
        ("cost", "Cost", "money"),
        ("returns", "Returns", "money"),
        ("profit", "Profit", "money"),
        ("margin", "Margin %", "percent"),
    ])
    .sum(&["sales", "cost", "returns", "profit"]);
    let mut rows = product_profit(conn, fs, ts)?;
    rows.sort_by(|a, b| (b.4 - b.5 - (b.6 - b.7)).cmp(&(a.4 - a.5 - (a.6 - a.7))));
    for (_, name, _unit, qty, sales, cost, refund, rcost) in &rows {
        let profit = sales - cost - (refund - rcost);
        b.row(vec![json!(name), json!(qty), json!(sales), json!(cost), json!(refund), json!(profit), pct(profit, sales - refund)]);
    }
    let line_profit: i64 = b.rows.iter().map(|r| r[5].as_i64().unwrap_or(0)).sum();
    let sales: i64 = b.rows.iter().map(|r| r[2].as_i64().unwrap_or(0)).sum();
    let returns: i64 = b.rows.iter().map(|r| r[4].as_i64().unwrap_or(0)).sum();
    let bill_disc: i64 = conn.query_row(
        "SELECT COALESCE(SUM(s.discount_paisa - (SELECT COALESCE(SUM(discount_paisa),0) FROM sale_lines sl WHERE sl.sale_id = s.id)), 0)
         FROM sales s WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2",
        params![fs, ts],
        |r| r.get(0),
    )?;
    b.stat("Sales (without tax)", json!(sales), "money");
    b.stat("Returns", json!(returns), "money");
    b.stat("Discounts on whole bills", json!(bill_disc), "money");
    b.stat("Net profit", json!(line_profit - bill_disc), "money");
    b.stat("Margin", pct(line_profit - bill_disc, sales - returns - bill_disc), "percent");
    b.note = Some("Cost is the average purchase cost at the time of each sale.".into());
    Ok(b.finish("profit", fs, ts, true))
}

fn r_trend(conn: &rusqlite::Connection, f: DateTime<Utc>, t: DateTime<Utc>, off: i64) -> Result<ReportTable> {
    let (fs, ts) = (f.to_rfc3339(), t.to_rfc3339());
    let monthly = t - f > Duration::days(62);
    let mut b = Builder::new(&[
        ("period", if monthly { "Month" } else { "Date" }, if monthly { "text" } else { "date" }),
        ("bills", "Bills", "int"),
        ("sales", "Sales", "money"),
        ("profit", "Profit", "money"),
        ("avg", "Average bill", "money"),
    ])
    .sum(&["bills", "sales", "profit"]);
    let period = if monthly { format!("strftime('%Y-%m', datetime(s.created_at, '{off:+} minutes'))") } else { day_sql("s.created_at", off) };
    let sql = format!(
        "SELECT {period}, COUNT(*), SUM(s.total_paisa), SUM(s.total_paisa - s.tax_paisa - (SELECT COALESCE(SUM(cogs_paisa),0) FROM sale_lines sl WHERE sl.sale_id = s.id))
         FROM sales s WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2 GROUP BY 1 ORDER BY 1"
    );
    let totals = |a: &str, z: &str| -> Result<(i64, i64, i64)> {
        Ok(conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(s.total_paisa),0), COALESCE(SUM(s.total_paisa - s.tax_paisa - (SELECT COALESCE(SUM(cogs_paisa),0) FROM sale_lines sl WHERE sl.sale_id = s.id)),0)
             FROM sales s WHERE s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2",
            params![a, z],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?)
    };
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params![fs, ts], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?)))?;
    for r in rows {
        let (p, bills, sales, profit) = r?;
        b.row(vec![json!(p), json!(bills), json!(sales), json!(profit), json!(if bills > 0 { sales / bills } else { 0 })]);
    }
    let len = t - f;
    let (pf, pt) = ((f - len - Duration::milliseconds(1)).to_rfc3339(), (f - Duration::milliseconds(1)).to_rfc3339());
    let (cb, cs, cp) = totals(&fs, &ts)?;
    let (pb, ps, pp) = totals(&pf, &pt)?;
    let change = |now: i64, before: i64| if before == 0 { Value::Null } else { json!((((now - before) as f64 / before as f64) * 1000.0).round() / 10.0) };
    b.stat("Sales this period", json!(cs), "money");
    b.stat("Sales previous period", json!(ps), "money");
    b.stat("Sales change", change(cs, ps), "percent");
    b.stat("Profit change", change(cp, pp), "percent");
    b.stat("Bills change", change(cb, pb), "percent");
    b.note = Some("Previous period = the same number of days just before the chosen dates.".into());
    Ok(b.finish("analysis_trend", &fs, &ts, true))
}

fn r_movers(conn: &rusqlite::Connection, fs: &str, ts: &str, f: DateTime<Utc>, t: DateTime<Utc>) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("name", "Product", "text"),
        ("unit", "Unit", "text"),
        ("sold", "Sold", "qty"),
        ("sales", "Sales", "money"),
        ("stock", "Stock now", "qty"),
        ("per_day", "Sold per day", "qty"),
        ("days_left", "Days of stock", "int"),
        ("last_sold", "Last sold", "date"),
        ("status", "Status", "text"),
    ]);
    let days = ((t - f).num_hours() as f64 / 24.0).max(1.0);
    let mut st = conn.prepare(
        "SELECT p.name, u.code,
                COALESCE((SELECT SUM(-sm.qty_signed_milli) FROM stock_movements sm WHERE sm.variant_id = pv.id AND sm.movement_type = 'sale' AND sm.occurred_at >= ?1 AND sm.occurred_at <= ?2), 0),
                COALESCE((SELECT SUM(sl.total_paisa) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id WHERE sl.variant_id = pv.id AND s.status = 'posted' AND s.created_at >= ?1 AND s.created_at <= ?2), 0),
                COALESCE(ib.on_hand_milli, 0),
                (SELECT MAX(s.created_at) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id WHERE sl.variant_id = pv.id AND s.status = 'posted')
         FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN units u ON u.id = p.base_unit_id
         LEFT JOIN inventory_balances ib ON ib.variant_id = pv.id
         WHERE p.is_service = 0 AND p.active = 1",
    )?;
    let mut items: Vec<(String, String, i64, i64, i64, Option<String>)> = st
        .query_map(params![fs, ts], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))?
        .collect::<std::result::Result<_, _>>()?;
    items.sort_by(|a, b| b.2.cmp(&a.2));
    let selling = items.iter().filter(|i| i.2 > 0).count();
    let fast_cut = (selling as f64 * 0.2).ceil() as usize;
    let (mut fast, mut slow, mut dead) = (0, 0, 0);
    for (idx, (name, unit, sold, sales, stock, last)) in items.into_iter().enumerate() {
        let per_day = (sold as f64 / days).round() as i64;
        let days_left = if sold > 0 { Some(((stock.max(0) as f64) / (sold as f64 / days)).round() as i64) } else { None };
        let status = if sold == 0 && stock > 0 {
            dead += 1;
            "Not selling"
        } else if sold == 0 {
            ""
        } else if idx < fast_cut {
            fast += 1;
            "Fast"
        } else if days_left.map(|d| d > 90).unwrap_or(false) {
            slow += 1;
            "Slow"
        } else {
            "Normal"
        };
        b.row(vec![json!(name), json!(unit), json!(sold), json!(sales), json!(stock), json!(per_day), days_left.map(|d| json!(d)).unwrap_or(Value::Null), last.map(|l| json!(l)).unwrap_or(Value::Null), json!(status)]);
    }
    b.stat("Fast items", json!(fast), "int");
    b.stat("Slow items (more than 90 days of stock)", json!(slow), "int");
    b.stat("Not selling (stock but no sale)", json!(dead), "int");
    b.note = Some("Fast = top 20% by quantity sold. Days of stock = stock now ÷ sold per day.".into());
    Ok(b.finish("analysis_movers", fs, ts, true))
}

fn r_margin(conn: &rusqlite::Connection, fs: &str, ts: &str) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("name", "Product", "text"),
        ("qty", "Qty sold", "qty"),
        ("sales", "Sales", "money"),
        ("cost", "Cost", "money"),
        ("profit", "Profit", "money"),
        ("margin", "Margin %", "percent"),
        ("flag", "Note", "text"),
    ])
    .sum(&["sales", "cost", "profit"]);
    let mut rows = product_profit(conn, fs, ts)?;
    rows.sort_by(|a, b| {
        let ma = if a.4 > 0 { (a.4 - a.5) as f64 / a.4 as f64 } else { 0.0 };
        let mb = if b.4 > 0 { (b.4 - b.5) as f64 / b.4 as f64 } else { 0.0 };
        mb.partial_cmp(&ma).unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut below = 0;
    for (_, name, _u, qty, sales, cost, _, _) in &rows {
        let profit = sales - cost;
        let flag = if profit < 0 {
            below += 1;
            "Sold below cost"
        } else if *sales > 0 && profit * 100 < sales * 5 {
            "Under 5% margin"
        } else {
            ""
        };
        b.row(vec![json!(name), json!(qty), json!(sales), json!(cost), json!(profit), pct(profit, *sales), json!(flag)]);
    }
    if let Some(best) = b.rows.first() {
        b.stat("Best margin", json!(best[0].as_str().unwrap_or("")), "text");
    }
    b.stat("Products sold below cost", json!(below), "int");
    Ok(b.finish("analysis_margin", fs, ts, true))
}

fn r_list_products(conn: &rusqlite::Connection) -> Result<ReportTable> {
    let mut b = Builder::new(&[
        ("sku", "SKU", "text"),
        ("name", "Name", "text"),
        ("type", "Type", "text"),
        ("category", "Category", "text"),
        ("brand", "Company", "text"),
        ("unit", "Unit", "text"),
        ("barcode", "Barcode", "text"),
        ("price", "Sale price", "money"),
        ("wholesale", "Wholesale", "money"),
        ("cost", "Avg cost", "money"),
        ("stock", "Stock", "qty"),
        ("alert", "Low stock alert", "qty"),
    ]);
    let services: std::collections::HashSet<String> = conn
        .prepare("SELECT id FROM products WHERE is_service = 1")?
        .query_map([], |r| r.get(0))?
        .collect::<std::result::Result<_, _>>()?;
    let reorder: HashMap<String, i64> = conn
        .prepare("SELECT id, reorder_level_milli FROM products")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<std::result::Result<_, _>>()?;
    for p in CatalogRepo::search(conn, "", 100_000)? {
        let bal = InventoryRepo::get_balance(conn, &p.variant_id)?;
        let svc = services.contains(&p.product_id);
        b.row(vec![
            json!(p.sku),
            json!(p.name),
            json!(if svc { "Service" } else { "Product" }),
            json!(p.category_name.unwrap_or_default()),
            json!(p.brand_name.unwrap_or_default()),
            json!(p.base_unit_code),
            json!(p.barcode.unwrap_or_default()),
            json!(p.retail_price_paisa),
            p.wholesale_price_paisa.map(|w| json!(w)).unwrap_or(Value::Null),
            json!(bal.as_ref().map(|b| b.avg_cost_paisa).unwrap_or(0)),
            if svc { Value::Null } else { json!(bal.as_ref().map(|b| b.on_hand_milli).unwrap_or(0)) },
            json!(reorder.get(&p.product_id).copied().unwrap_or(0)),
        ]);
    }
    b.stat("Products", json!(b.rows.len()), "int");
    let n = now().to_rfc3339();
    Ok(b.finish("list_products", &n, &n, false))
}

fn r_list_parties(conn: &rusqlite::Connection, kind: &str) -> Result<ReportTable> {
    let customers = kind == "list_customers";
    let mut b = Builder::new(&[
        ("name", "Name", "text"),
        ("phone", "Phone", "text"),
        ("cnic", "CNIC", "text"),
        ("limit", "Credit limit", "money"),
        ("balance", if customers { "Due from them" } else { "We owe them" }, "money"),
    ])
    .sum(&["balance"]);
    let mut st = conn.prepare(
        "SELECT pa.name, COALESCE(pa.phone, ''), COALESCE(pa.cnic, ''), pa.credit_limit_paisa,
                COALESCE((SELECT balance_paisa FROM party_ledger pl WHERE pl.party_id = pa.id ORDER BY occurred_at DESC, id DESC LIMIT 1), pa.opening_balance_paisa)
         FROM parties pa WHERE pa.active = 1 AND pa.party_type IN (?1, 'both') ORDER BY pa.name COLLATE NOCASE",
    )?;
    let rows = st.query_map(params![if customers { "customer" } else { "vendor" }], |r| {
        Ok(vec![json!(r.get::<_, String>(0)?), json!(r.get::<_, String>(1)?), json!(r.get::<_, String>(2)?), json!(r.get::<_, i64>(3)?), json!(r.get::<_, i64>(4)?)])
    })?;
    for r in rows {
        b.row(r?);
    }
    b.stat(if customers { "Customers" } else { "Vendors" }, json!(b.rows.len()), "int");
    let n = now().to_rfc3339();
    Ok(b.finish(kind, &n, &n, false))
}
