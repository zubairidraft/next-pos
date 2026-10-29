# Phase 8 Research: Khata (Customer & Vendor Credit Ledgers) & WhatsApp Sharing

## Objectives & Technical Specifications
Phase 8 delivers local Pakistani credit book (کھاتہ) capabilities:
1. **Customer & Vendor Khata Ledgers**:
   - Every credit sale adds an entry to customer ledger: Debit (increases receivable / واجب الادا رقم).
   - Customer payment receipts record Credit (decreases receivable).
   - Vendor credit purchases record Credit (increases payable).
   - Vendor payments record Debit (decreases payable).
   - Running balance calculation in pure integer `Paisa(i64)` strictly maintaining debit/credit equilibrium.
2. **Credit Limit & Aging Controls**:
   - Per-customer `credit_limit` in Paisa. If a sale exceeds credit limit, the POS blocks finalization unless authorized by an `admin`/`manager` PIN override.
   - Credit aging calculation (0-30 days, 31-60 days, 61-90 days, 90+ days) for risk monitoring.
3. **Automated FIFO Invoice Allocation**:
   - When a customer makes a partial payment, the payment automatically allocates against the oldest unpaid or partially-paid invoices in FIFO sequence.
4. **Statement Generator & WhatsApp Sharing**:
   - Generate bilingual (English + Urdu Nastaliq) Khata account statements summarizing total debit, total credit, and closing balance.
   - Generate standard WhatsApp deep links (`https://wa.me/<phone>?text=<encoded_msg>`) formatting the balance and payment reminder in conversational Urdu and English, runnable completely offline without third-party API keys or cloud services.
