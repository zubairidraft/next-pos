# Next POS (کاروبار پی او ایس) — Version 1.0.0 GA Release Notes

---

## 🚀 General Availability (GA) Announcement
We are proud to release **Next POS (کاروبار پی او ایس) v1.0.0** — an industrial-grade, 100% offline-first retail Point of Sale & ERP engine built specifically for Pakistan's retail infrastructure and environmental demands.

### 🏛️ Architecture Highlights
- **Decoupled Pure Rust Engine (`crates/pos-core`)**:
  - Zero cloud dependency; all business logic, transactions, and arithmetic run locally on the merchant's machine.
  - Sub-15ms scan-to-cart latency and sub-80ms transaction commit time.
  - 50,000 synthetic catalog item streaming importer completes in < 15 seconds.
- **Zero Floating-Point Financial Arithmetic**:
  - All currency calculations use `Paisa(i64)` integer arithmetic (1 PKR = 100 Paisa).
  - All inventory quantities use milli-units (`Qty(i64)`, 1 unit = 1,000 milli-units).
  - Eliminates floating-point rounding errors and fractional Paisa financial drift.
- **SQLite WAL Mode & Encrypted Storage**:
  - Local database runs under SQLite Write-Ahead Logging (`WAL`) mode with foreign key integrity enforced.
  - Optional SQLCipher 256-bit AES encryption with keys derived via Windows DPAPI and Argon2id.
- **Air-Gapped Commercial Licensing**:
  - Ed25519 cryptographic license verification tied to hardware machine ID (`KPOS-XXXX-XXXX-XXXX-XXXX`).
  - 14-day fully-functional offline trial with monotonic clock protection.
- **Hardware Integration & Printing**:
  - 58mm & 80mm ESC/POS thermal printing with 1-bit monochrome Urdu Nastaliq raster graphics.
  - RJ11 cash drawer solenoid kick pulse.
  - Continuous weighing scale barcodes (EAN-13 prefixes `20` & `21`).
  - Mobile & electronics IMEI serial lifecycle tracking.
  - Apparel size × color matrix variant generation.
- **Dual Script Urdu Nastaliq & English UI**:
  - Desktop frontend built on Tauri 2 + React 18 + Tailwind CSS.
  - Instant toggle between English and Urdu with dynamic RTL layout mirroring.

---

## 📦 What's Included in v1.0.0
1. **Catalog & High-Volume Data Import**: CSV/Excel catalog streaming, category hierarchies, multi-barcodes, wholesale/retail price lists.
2. **Purchasing & Real-Time Stock Ledger**: Inbound supplier receipts, landed cost calculation, FIFO inventory cost tracking, strict block on negative inventory.
3. **Audits & Label Printing**: Physical cycle counts, variance reconciliation, TSPL/ZPL 50x30mm thermal shelf label generator.
4. **POS Checkout & Transactions**: Fast barcode scanning, park/hold multi-cart recall, line & order discounts, split payment tenders (Cash, Card, Khata, JazzCash, EasyPaisa, Raast).
5. **Hardware Printing & Shifts**: 58mm/80mm ESC/POS receipts, Cashier shifts, daily cash drawer balancing, Z-Report summaries.
6. **Khata Ledgers & WhatsApp**: Customer/vendor credit book with immutable running balances, FIFO invoice allocations, credit limit enforcement, aging reports, and WhatsApp payment reminders.
7. **Analytics & Automated Backup**: Offline P&L, gross margins, category velocity ranking, 30-minute non-blocking WAL live snapshots (`VACUUM INTO`), and 256-bit encrypted USB backup packages (`.kpos`).
8. **Resilience & Diagnostics**: Crash resilience with sub-1.5s cold boot recovery, zero table scans, and automated system health diagnostics.
9. **Reseller Licensing CLI**: Standalone `pos-license` CLI tool for dealers and distributors to generate offline license keys.
