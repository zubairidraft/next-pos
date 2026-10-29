# Plan 06-02 Summary: Atomic Sale Posting & Split-Tender Settlement

## Accomplishments
- Implemented `crates/pos-core/src/domain/sale.rs` providing:
  - `SaleRepo::post_sale`: Full transactional sale posting wrapped inside an atomic SQLite `conn.transaction()`.
  - Sequential document number generation (`INV-YYYYMM-XXXX`) using `doc_sequences`.
  - Negative Stock Enforcement: Blocks any sale line if available inventory balance cache is insufficient.
  - Immutable stock movements: Appends outbound movements (`sale`) with moving-average cost (COGS) tracking.
  - Inventory cache updates: Automatically updates `inventory_balances` materialized cache.
  - Split tenders & customer Khata receivables:
    - Cash, card, and digital mobile wallet tenders (JazzCash, EasyPaisa, Raast) inserted into `payments`.
    - Customer Khata credit tender directly recorded into `party_ledger` as an account receivable debit against the customer.
- Added integration tests in `crates/pos-core/tests/sale_posting_tests.rs`:
  - `test_atomic_sale_posting_with_split_tenders`: Tests end-to-end checkout with split cash + Khata credit tender, verifying document numbering, stock deduction, and party ledger updates.
- All tests passing cleanly (34 passed, 0 failed in `pos-core`).
