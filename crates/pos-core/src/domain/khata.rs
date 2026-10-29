//! Khata (Customer & Vendor Credit Ledger), FIFO payment allocation, credit limits, and WhatsApp sharing.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::PosError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: String,
    pub party_id: String,
    pub entry_type: String,
    pub debit_paisa: i64,
    pub credit_paisa: i64,
    pub balance_paisa: i64,
    pub source_doc: String,
    pub occurred_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KhataStatement {
    pub party_id: String,
    pub party_name: String,
    pub party_name_ur: Option<String>,
    pub phone: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub opening_balance_paisa: i64,
    pub entries: Vec<LedgerEntry>,
    pub total_debit_paisa: i64,
    pub total_credit_paisa: i64,
    pub closing_balance_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditCheckResult {
    pub allowed: bool,
    pub current_balance_paisa: i64,
    pub credit_limit_paisa: i64,
    pub resulting_balance_paisa: i64,
    pub manager_override_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceAllocation {
    pub sale_id: String,
    pub doc_no: String,
    pub total_paisa: i64,
    pub previously_paid_paisa: i64,
    pub allocated_paisa: i64,
    pub remaining_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentAllocationResult {
    pub payment_id: String,
    pub party_id: String,
    pub total_payment_paisa: i64,
    pub allocations: Vec<InvoiceAllocation>,
    pub unallocated_credit_paisa: i64,
    pub new_party_balance_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgingReportBucket {
    pub bucket_name: String,
    pub amount_paisa: i64,
    pub invoice_count: usize,
}

pub struct KhataRepo;

impl KhataRepo {
    /// Retrieve the current running balance for a party in Paisa
    pub fn get_balance(conn: &Connection, party_id: &str) -> Result<i64, PosError> {
        let last_balance_opt: Option<i64> = conn
            .query_row(
                "SELECT balance_paisa FROM party_ledger
                 WHERE party_id = ?1
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT 1",
                params![party_id],
                |r| r.get(0),
            )
            .ok();

        if let Some(b) = last_balance_opt {
            Ok(b)
        } else {
            // Default to party opening balance
            let opening_bal: i64 = conn
                .query_row(
                    "SELECT opening_balance_paisa FROM parties WHERE id = ?1",
                    params![party_id],
                    |r| r.get(0),
                )
                .map_err(|e| PosError::NotFound(format!("Party {} not found: {}", party_id, e)))?;
            Ok(opening_bal)
        }
    }

    /// Record a debit/credit ledger entry for a party, maintaining immutable running balance
    pub fn record_entry(
        conn: &mut Connection,
        party_id: &str,
        entry_type: &str,
        debit_paisa: i64,
        credit_paisa: i64,
        source_doc: &str,
        occurred_at: Option<&str>,
    ) -> Result<LedgerEntry, PosError> {
        let party_type: String = conn
            .query_row(
                "SELECT party_type FROM parties WHERE id = ?1",
                params![party_id],
                |r| r.get(0),
            )
            .map_err(|e| PosError::NotFound(format!("Party {} not found: {}", party_id, e)))?;

        let prev_balance = Self::get_balance(conn, party_id)?;

        // Customer: Debit increases receivable (customer owes us more)
        // Vendor: Credit increases payable (we owe vendor more)
        let new_balance = if party_type == "vendor" {
            prev_balance + credit_paisa - debit_paisa
        } else {
            prev_balance + debit_paisa - credit_paisa
        };

        let entry_id = Ulid::new().to_string();
        let timestamp = occurred_at
            .map(String::from)
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        conn.execute(
            "INSERT INTO party_ledger (
                id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry_id,
                party_id,
                entry_type,
                debit_paisa,
                credit_paisa,
                new_balance,
                source_doc,
                timestamp,
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert party ledger entry: {}", e)))?;

        Ok(LedgerEntry {
            id: entry_id,
            party_id: party_id.to_string(),
            entry_type: entry_type.to_string(),
            debit_paisa,
            credit_paisa,
            balance_paisa: new_balance,
            source_doc: source_doc.to_string(),
            occurred_at: timestamp,
        })
    }

    /// Validate whether adding additional credit will exceed the customer's credit limit
    pub fn check_credit_limit(
        conn: &Connection,
        customer_id: &str,
        additional_debit_paisa: i64,
    ) -> Result<CreditCheckResult, PosError> {
        let credit_limit: i64 = conn
            .query_row(
                "SELECT credit_limit_paisa FROM parties WHERE id = ?1",
                params![customer_id],
                |r| r.get(0),
            )
            .map_err(|e| PosError::NotFound(format!("Customer {} not found: {}", customer_id, e)))?;

        let current_balance = Self::get_balance(conn, customer_id)?;
        let resulting_balance = current_balance + additional_debit_paisa;

        // If credit_limit is 0, credit is unlimited or disabled unless configured
        let allowed = credit_limit == 0 || resulting_balance <= credit_limit;

        Ok(CreditCheckResult {
            allowed,
            current_balance_paisa: current_balance,
            credit_limit_paisa: credit_limit,
            resulting_balance_paisa: resulting_balance,
            manager_override_required: !allowed,
        })
    }

    /// Query ledger statement for a party over a specified date range
    pub fn get_statement(
        conn: &Connection,
        party_id: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<KhataStatement, PosError> {
        let (name, name_ur, phone): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT name, name_ur, phone FROM parties WHERE id = ?1",
                params![party_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| PosError::NotFound(format!("Party {} not found: {}", party_id, e)))?;

        // Calculate opening balance prior to start_date
        let opening_bal_opt: Option<i64> = conn
            .query_row(
                "SELECT balance_paisa FROM party_ledger
                 WHERE party_id = ?1 AND occurred_at < ?2
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT 1",
                params![party_id, start_date],
                |r| r.get(0),
            )
            .ok();

        let opening_balance = opening_bal_opt.unwrap_or_else(|| {
            conn.query_row(
                "SELECT opening_balance_paisa FROM parties WHERE id = ?1",
                params![party_id],
                |r| r.get(0),
            )
            .unwrap_or(0)
        });

        // Query entries within range
        let mut stmt = conn
            .prepare(
                "SELECT id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at
                 FROM party_ledger
                 WHERE party_id = ?1 AND occurred_at >= ?2 AND occurred_at <= ?3
                 ORDER BY occurred_at ASC, id ASC",
            )
            .map_err(|e| PosError::Db(format!("Failed to prepare statement query: {}", e)))?;

        let rows = stmt
            .query_map(params![party_id, start_date, end_date], |r| {
                Ok(LedgerEntry {
                    id: r.get(0)?,
                    party_id: party_id.to_string(),
                    entry_type: r.get(1)?,
                    debit_paisa: r.get(2)?,
                    credit_paisa: r.get(3)?,
                    balance_paisa: r.get(4)?,
                    source_doc: r.get(5)?,
                    occurred_at: r.get(6)?,
                })
            })
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut entries = Vec::new();
        let mut total_debit = 0;
        let mut total_credit = 0;

        for r in rows {
            let entry = r.map_err(|e| PosError::Db(e.to_string()))?;
            total_debit += entry.debit_paisa;
            total_credit += entry.credit_paisa;
            entries.push(entry);
        }

        let closing_balance = if let Some(last) = entries.last() {
            last.balance_paisa
        } else {
            opening_balance
        };

        Ok(KhataStatement {
            party_id: party_id.to_string(),
            party_name: name,
            party_name_ur: name_ur,
            phone,
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
            opening_balance_paisa: opening_balance,
            entries,
            total_debit_paisa: total_debit,
            total_credit_paisa: total_credit,
            closing_balance_paisa: closing_balance,
        })
    }

    /// Automated FIFO invoice allocation when customer makes a partial or full payment
    pub fn allocate_payment_fifo(
        conn: &mut Connection,
        party_id: &str,
        payment_amount_paisa: i64,
        payment_method: &str,
        reference: Option<&str>,
        cash_session_id: Option<&str>,
    ) -> Result<PaymentAllocationResult, PosError> {
        if payment_amount_paisa <= 0 {
            return Err(PosError::Validation(
                "Payment amount must be greater than zero.".to_string(),
            ));
        }

        let now = chrono::Utc::now().to_rfc3339();
        let payment_id = Ulid::new().to_string();

        let tx = conn
            .transaction()
            .map_err(|e| PosError::Db(format!("Failed to start allocation transaction: {}", e)))?;

        // 1. Record parent payment in payments table first
        tx.execute(
            "INSERT INTO payments (
                id, party_id, direction, method, amount_paisa, reference, cash_session_id, occurred_at
            ) VALUES (?1, ?2, 'inbound', ?3, ?4, ?5, ?6, ?7)",
            params![
                payment_id,
                party_id,
                payment_method,
                payment_amount_paisa,
                reference,
                cash_session_id,
                now
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert payment record: {}", e)))?;

        // 2. Query all posted sales for this party ordered by created_at (FIFO)
        let mut stmt = tx
            .prepare(
                "SELECT id, doc_no, total_paisa
                 FROM sales
                 WHERE party_id = ?1 AND status = 'posted'
                 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| PosError::Db(format!("Failed to query unpaid sales: {}", e)))?;

        let sale_rows: Vec<(String, String, i64)> = stmt
            .query_map(params![party_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(|e| PosError::Db(e.to_string()))?
            .filter_map(std::result::Result::ok)
            .collect();

        drop(stmt);

        let mut remaining_payment = payment_amount_paisa;
        let mut allocations = Vec::new();

        for (sale_id, doc_no, total_paisa) in sale_rows {
            if remaining_payment <= 0 {
                break;
            }

            // Check how much has already been allocated to this sale
            let already_allocated: i64 = tx
                .query_row(
                    "SELECT COALESCE(SUM(allocated_paisa), 0) FROM invoice_allocations WHERE sale_id = ?1",
                    params![sale_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let pending_paisa = total_paisa - already_allocated;
            if pending_paisa > 0 {
                let to_allocate = std::cmp::min(remaining_payment, pending_paisa);
                let alloc_id = Ulid::new().to_string();

                tx.execute(
                    "INSERT INTO invoice_allocations (
                        id, payment_id, sale_id, allocated_paisa, created_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![alloc_id, payment_id, sale_id, to_allocate, now],
                )
                .map_err(|e| PosError::Db(format!("Failed to record invoice allocation: {}", e)))?;

                allocations.push(InvoiceAllocation {
                    sale_id,
                    doc_no,
                    total_paisa,
                    previously_paid_paisa: already_allocated,
                    allocated_paisa: to_allocate,
                    remaining_paisa: pending_paisa - to_allocate,
                });

                remaining_payment -= to_allocate;
            }
        }

        // 3. Record credit entry in party_ledger
        let prev_balance: i64 = tx
            .query_row(
                "SELECT balance_paisa FROM party_ledger
                 WHERE party_id = ?1
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT 1",
                params![party_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        let new_balance = prev_balance - payment_amount_paisa;
        let ledger_id = Ulid::new().to_string();

        tx.execute(
            "INSERT INTO party_ledger (
                id, party_id, entry_type, debit_paisa, credit_paisa, balance_paisa, source_doc, occurred_at
            ) VALUES (?1, ?2, 'payment', 0, ?3, ?4, ?5, ?6)",
            params![
                ledger_id,
                party_id,
                payment_amount_paisa,
                new_balance,
                reference.unwrap_or(&payment_id),
                now
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert party ledger payment: {}", e)))?;

        tx.commit()
            .map_err(|e| PosError::Db(format!("Failed to commit payment allocation: {}", e)))?;

        Ok(PaymentAllocationResult {
            payment_id,
            party_id: party_id.to_string(),
            total_payment_paisa: payment_amount_paisa,
            allocations,
            unallocated_credit_paisa: remaining_payment,
            new_party_balance_paisa: new_balance,
        })
    }

    /// Construct a WhatsApp deep-link payment reminder URL
    pub fn build_whatsapp_url(
        party_name: &str,
        phone: &str,
        balance_paisa: i64,
        store_name: &str,
    ) -> String {
        // Normalize Pakistani phone number: e.g. "0300-1234567" -> "923001234567"
        let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
        let clean_phone = if digits.starts_with("92") {
            digits
        } else if digits.starts_with('0') {
            format!("92{}", &digits[1..])
        } else {
            format!("92{}", digits)
        };

        let rupees = format!("{:.2}", balance_paisa as f64 / 100.0);

        // Friendly bilingual reminder message
        let msg = format!(
            "محترم {} صاحب،\n{} کی طرف سے آپ کے کھاتے کا بقایا بیلنس PKR {} ہے۔ برائے مہربانی ادائیگی یقینی بنائیں۔ شکریہ!\n\nDear {},\nyour outstanding balance with {} is PKR {}. Kindly arrange payment. Thank you!",
            party_name, store_name, rupees, party_name, store_name, rupees
        );

        let encoded_text = Self::percent_encode(&msg);
        format!("https://wa.me/{}?text={}", clean_phone, encoded_text)
    }

    /// Internal helper to percent-encode strings for URL parameters without external dependencies
    fn percent_encode(s: &str) -> String {
        let mut out = String::with_capacity(s.len() * 3);
        for b in s.as_bytes() {
            match *b {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    out.push(*b as char);
                }
                b' ' => out.push_str("%20"),
                _ => out.push_str(&format!("%{:02X}", b)),
            }
        }
        out
    }

    /// Calculate aging report buckets for a given party type (customer receivables or vendor payables)
    pub fn get_aging_buckets(
        conn: &Connection,
        party_type: &str,
    ) -> Result<Vec<AgingReportBucket>, PosError> {
        let mut b_0_30: i64 = 0;
        let mut c_0_30: usize = 0;
        let mut b_31_60: i64 = 0;
        let mut c_31_60: usize = 0;
        let mut b_61_90: i64 = 0;
        let mut c_61_90: usize = 0;
        let mut b_90_plus: i64 = 0;
        let mut c_90_plus: usize = 0;

        let now = chrono::Utc::now();

        if party_type == "customer" {
            let mut stmt = conn
                .prepare(
                    "SELECT s.id, s.total_paisa, s.created_at,
                            COALESCE((SELECT SUM(allocated_paisa) FROM invoice_allocations WHERE sale_id = s.id), 0) as paid
                     FROM sales s
                     JOIN parties p ON s.party_id = p.id
                     WHERE p.party_type IN ('customer', 'both') AND s.status = 'posted'",
                )
                .map_err(|e| PosError::Db(format!("Failed to prepare aging query: {}", e)))?;

            let rows = stmt
                .query_map([], |r| {
                    let total: i64 = r.get(1)?;
                    let paid: i64 = r.get(3)?;
                    let created: String = r.get(2)?;
                    Ok((total - paid, created))
                })
                .map_err(|e| PosError::Db(e.to_string()))?;

            for r in rows.flatten() {
                let (pending, created_str) = r;
                if pending > 0 {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&created_str) {
                        let days = (now - dt.with_timezone(&chrono::Utc)).num_days();
                        if days <= 30 {
                            b_0_30 += pending;
                            c_0_30 += 1;
                        } else if days <= 60 {
                            b_31_60 += pending;
                            c_31_60 += 1;
                        } else if days <= 90 {
                            b_61_90 += pending;
                            c_61_90 += 1;
                        } else {
                            b_90_plus += pending;
                            c_90_plus += 1;
                        }
                    }
                }
            }
        }

        Ok(vec![
            AgingReportBucket {
                bucket_name: "0-30 Days".to_string(),
                amount_paisa: b_0_30,
                invoice_count: c_0_30,
            },
            AgingReportBucket {
                bucket_name: "31-60 Days".to_string(),
                amount_paisa: b_31_60,
                invoice_count: c_31_60,
            },
            AgingReportBucket {
                bucket_name: "61-90 Days".to_string(),
                amount_paisa: b_61_90,
                invoice_count: c_61_90,
            },
            AgingReportBucket {
                bucket_name: "90+ Days".to_string(),
                amount_paisa: b_90_plus,
                invoice_count: c_90_plus,
            },
        ])
    }
}
