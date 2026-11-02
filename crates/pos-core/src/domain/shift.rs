//! Cashier shifts, cash drawers, floats, payouts, and Z-report daily balancing.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashSession {
    pub id: String,
    pub user_id: String,
    pub opening_float_paisa: i64,
    pub expected_cash_paisa: i64,
    pub counted_cash_paisa: Option<i64>,
    pub variance_paisa: Option<i64>,
    pub status: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZReportData {
    pub session_id: String,
    pub cashier_id: String,
    pub cashier_name: String,
    pub opened_at: String,
    pub closed_at: String,
    pub opening_float_paisa: i64,
    pub gross_sales_paisa: i64,
    pub discounts_paisa: i64,
    pub net_sales_paisa: i64,
    pub taxes_paisa: i64,
    pub tender_cash_paisa: i64,
    pub tender_card_paisa: i64,
    pub tender_digital_paisa: i64,
    pub tender_khata_paisa: i64,
    pub cash_drops_paisa: i64,
    pub refunds_paisa: i64,
    pub expected_cash_paisa: i64,
    pub counted_cash_paisa: i64,
    pub variance_paisa: i64,
    pub sales_count: i64,
}

pub struct ShiftRepo;

impl ShiftRepo {
    /// Start a new cashier shift session with an opening float
    pub fn start_shift(
        conn: &mut Connection,
        user_id: &str,
        opening_float_paisa: i64,
    ) -> Result<CashSession, PosError> {
        // Check if an active open session already exists
        let active_opt = Self::get_active_session(conn, user_id)?;
        if let Some(active) = active_opt {
            return Err(PosError::Validation(format!(
                "An open shift session already exists (Session ID: {}) for user {}. Please close it first.",
                active.id, user_id
            )));
        }

        let session_id = Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to begin transaction for shift: {}", e)))?;

        tx.execute(
            "INSERT INTO cash_sessions (
                id, user_id, opening_float_paisa, expected_cash_paisa, status, opened_at
            ) VALUES (?1, ?2, ?3, ?3, 'open', ?4)",
            params![session_id, user_id, opening_float_paisa, now],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert cash session: {}", e)))?;

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit shift start: {}", e)))?;

        Ok(CashSession {
            id: session_id,
            user_id: user_id.to_string(),
            opening_float_paisa,
            expected_cash_paisa: opening_float_paisa,
            counted_cash_paisa: None,
            variance_paisa: None,
            status: "open".to_string(),
            opened_at: now,
            closed_at: None,
        })
    }

    /// Retrieve the currently active open shift for a user, if any
    pub fn get_active_session(
        conn: &Connection,
        user_id: &str,
    ) -> Result<Option<CashSession>, PosError> {
        let mut stmt = conn
            .prepare(
                "SELECT id, user_id, opening_float_paisa, expected_cash_paisa,
                        counted_cash_paisa, variance_paisa, status, opened_at, closed_at
                 FROM cash_sessions
                 WHERE user_id = ?1 AND status = 'open'
                 ORDER BY opened_at DESC
                 LIMIT 1",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare active session query: {}", e)))?;

        let mut rows = stmt
            .query(params![user_id])
            .map_err(|e| PosError::Db(format!("Failed to query active session: {}", e)))?;

        if let Some(row) = rows.next().map_err(|e| PosError::Db(e.to_string()))? {
            let session_id: String = row.get(0)?;
            let u_id: String = row.get(1)?;
            let opening_float: i64 = row.get(2)?;
            let counted: Option<i64> = row.get(4)?;
            let variance: Option<i64> = row.get(5)?;
            let status: String = row.get(6)?;
            let opened_at: String = row.get(7)?;
            let closed_at: Option<String> = row.get(8)?;

            drop(rows);
            drop(stmt);

            // Compute current expected cash: Float + Inbound Cash - Outbound Cash
            let inbound_cash: i64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                     WHERE cash_session_id = ?1 AND direction = 'inbound' AND method = 'cash'",
                    params![session_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let outbound_cash: i64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                     WHERE cash_session_id = ?1 AND direction = 'outbound' AND method = 'cash'",
                    params![session_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let expected_cash = opening_float + inbound_cash - outbound_cash;

            Ok(Some(CashSession {
                id: session_id,
                user_id: u_id,
                opening_float_paisa: opening_float,
                expected_cash_paisa: expected_cash,
                counted_cash_paisa: counted,
                variance_paisa: variance,
                status,
                opened_at,
                closed_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Record a cash payout / drop / petty cash expense during an active shift
    pub fn record_cash_drop(
        conn: &mut Connection,
        session_id: &str,
        amount_paisa: i64,
        reason: &str,
    ) -> Result<(), PosError> {
        let payment_id = Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO payments (
                id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at
            ) VALUES (?1, NULL, 'outbound', 'cash', ?2, ?3, ?4, ?5)",
            params![payment_id, amount_paisa, reason, session_id, now],
        )
        .map_err(|e| PosError::Db(format!("Failed to record cash drop: {}", e)))?;

        Ok(())
    }

    /// End a cashier shift, count physical drawer cash, calculate variance, and generate Z-Report
    pub fn close_shift(
        conn: &mut Connection,
        session_id: &str,
        counted_cash_paisa: i64,
    ) -> Result<ZReportData, PosError> {
        let (user_id, opening_float, opened_at): (String, i64, String) = conn
            .query_row(
                "SELECT user_id, opening_float_paisa, opened_at FROM cash_sessions WHERE id = ?1",
                params![session_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| PosError::Db(format!("Session not found: {}", e)))?;

        let status: String = conn
            .query_row("SELECT status FROM cash_sessions WHERE id = ?1", params![session_id], |r| r.get(0))
            .map_err(|e| PosError::Db(format!("Session not found: {}", e)))?;
        if status != "open" {
            return Err(PosError::Validation("This shift is already closed".to_string()));
        }
        if counted_cash_paisa < 0 {
            return Err(PosError::Validation("Counted cash cannot be negative".to_string()));
        }

        let cashier_name: String = conn
            .query_row(
                "SELECT username FROM users WHERE id = ?1",
                params![user_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| user_id.clone());

        // Inbound cash from sales & payments
        let tender_cash_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                 WHERE cash_session_id = ?1 AND direction = 'inbound' AND method = 'cash'",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let tender_card_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                 WHERE cash_session_id = ?1 AND direction = 'inbound' AND method = 'card'",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let tender_digital_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                 WHERE cash_session_id = ?1 AND direction = 'inbound' AND method IN ('jazzcash', 'easypaisa', 'raast', 'bank', 'cheque')",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Cash paid out for returns (reference = RET- document) vs. petty cash / drops
        let refunds_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                 WHERE cash_session_id = ?1 AND direction = 'outbound' AND method = 'cash'
                   AND reference LIKE 'RET-%'",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let cash_drops_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount_paisa), 0) FROM payments
                 WHERE cash_session_id = ?1 AND direction = 'outbound' AND method = 'cash'
                   AND (reference IS NULL OR reference NOT LIKE 'RET-%')",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Sales totals
        let (gross_sales_paisa, discounts_paisa, taxes_paisa, net_sales_paisa, sales_count): (i64, i64, i64, i64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(subtotal_paisa), 0),
                        COALESCE(SUM(discount_paisa), 0),
                        COALESCE(SUM(tax_paisa), 0),
                        COALESCE(SUM(total_paisa), 0),
                        COUNT(*)
                 FROM sales
                 WHERE cash_session_id = ?1 AND status = 'posted'",
                params![session_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap_or((0, 0, 0, 0, 0));

        // Khata credit actually posted for this shift's sales
        let tender_khata_paisa: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(pl.debit_paisa), 0) FROM party_ledger pl
                 JOIN sales s ON s.doc_no = pl.source_doc
                 WHERE s.cash_session_id = ?1 AND pl.entry_type = 'sale'",
                params![session_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // Cash payments are stored net of change, so this is the cash that should be in the drawer.
        let expected_cash_paisa = opening_float + tender_cash_paisa - cash_drops_paisa - refunds_paisa;
        let variance_paisa = counted_cash_paisa - expected_cash_paisa;
        let closed_at = chrono::Utc::now().to_rfc3339();

        // Update session in DB
        conn.execute(
            "UPDATE cash_sessions
             SET status = 'closed',
                 expected_cash_paisa = ?1,
                 counted_cash_paisa = ?2,
                 variance_paisa = ?3,
                 closed_at = ?4
             WHERE id = ?5",
            params![
                expected_cash_paisa,
                counted_cash_paisa,
                variance_paisa,
                closed_at,
                session_id
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to close cash session: {}", e)))?;

        Ok(ZReportData {
            session_id: session_id.to_string(),
            cashier_id: user_id,
            cashier_name,
            opened_at,
            closed_at,
            opening_float_paisa: opening_float,
            gross_sales_paisa,
            discounts_paisa,
            net_sales_paisa,
            taxes_paisa,
            tender_cash_paisa,
            tender_card_paisa,
            tender_digital_paisa,
            tender_khata_paisa,
            cash_drops_paisa,
            refunds_paisa,
            expected_cash_paisa,
            counted_cash_paisa,
            variance_paisa,
            sales_count,
        })
    }
}
