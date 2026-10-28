# Roadmap: Next POS (کاروبار پی او ایس)

## Overview

Next POS is delivered across 12 focused implementation phases (corresponding to the 12 two-week development sprints in the product blueprint) leading up to commercial launch. The development pathway establishes an impregnable local foundation (Rust core + encrypted SQLite + integer money), layers on strict inventory costing and multi-tier master data, executes high-speed cashier checkout and thermal hardware printing, introduces comprehensive customer Khata and automated backups, and concludes with offline licensing, industry packs, and pilot shop validation.

## Phases

- [ ] **Phase 1: Foundation, Data Engine & Architecture** - Monorepo setup, Tauri 2 shell, pos-core crate, SQLCipher encrypted database, migrations, and Paisa/Qty precision arithmetic types.
- [ ] **Phase 2: Security, Master Data & Urdu Localization** - User accounts, RBAC, cashier PIN quick-switching, system settings, first-run wizard, and complete English/Urdu RTL interface.
- [ ] **Phase 3: Catalog & High-Volume Data Import** - Products, variants, unit conversions, multi-tier price lists, barcode management, and high-performance Excel/CSV importer for 50,000+ items.
- [ ] **Phase 4: Purchasing, Costing & Stock Ledger** - Immutable stock movement ledger, vendor invoices, landed cost distribution, and weighted-average costing with Block on negative stock.
- [ ] **Phase 5: Stock Audits, Discrepancies & Label Designer** - Purchase returns, stock adjustments, physical count sessions, inventory cache rebuild tool, and thermal barcode label designer.
- [ ] **Phase 6: POS Checkout & Transaction Engine** - High-speed keyboard/scanner-first checkout, parked carts (hold/recall), split-tender payments, and atomic `BEGIN IMMEDIATE` sale posting.
- [ ] **Phase 7: Hardware Printing, Receipts & Cash Sessions** - ESC/POS thermal printing with Urdu 1-bit raster graphics, cash drawer triggering, sale returns, cashier cash sessions, and daily Z-reports.
- [ ] **Phase 8: Khata (Customer/Vendor Credit) & WhatsApp Sharing** - Customer and vendor credit ledgers, automated FIFO payment allocation, statement generation in Urdu/English, and WhatsApp sharing.
- [ ] **Phase 9: Analytics, Reporting & Encrypted Backup** - Financial and inventory reports (PDF/CSV/XLSX), executive dashboard, automated 30-minute SQLite snapshots, USB backups, and verified restore wizard.
- [ ] **Phase 10: Licensing, Updates & Industry Packs** - Ed25519 offline license verification, machine fingerprinting, Grocery pack (scale barcodes), and Electronics pack (serial/IMEI tracking).
- [ ] **Phase 11: Resilience Testing, Security Audit & Pilot Deployment** - Power-pull resilience testing, performance benchmarks with 1M rows, Urdu operator training manual, and 5-shop pilot rollout.
- [ ] **Phase 12: Pilot Hardening & General Availability Launch** - Resolution of shop feedback, final hardware compatibility certifications, dealer portal, and production Windows release.

---

## Phase Details

### Phase 1: Foundation, Data Engine & Architecture
**Goal**: Establish the core monorepo, pure Rust `pos-core` library crate, Tauri 2 application shell, encrypted SQLite database via SQLCipher, database migration pipeline, and integer precision types for money and quantities.  
**Depends on**: Nothing (first phase)  
**Requirements**: ARCH-01, DB-01, NUM-01  
**Success Criteria**:
  1. The application builds, installs, and launches on a clean 64-bit Windows machine with zero internet connection.
  2. SQLCipher database initializes with WAL mode, foreign keys active, and key management integrated.
  3. All monetary and quantity calculations pass property and unit tests using `Paisa(i64)` and `Qty(i64)` with half-up rounding, with zero `f64` usage in business logic.
  4. Tauri 2 commands invoke pure Rust logic in `pos-core` with typed TS bindings generated automatically.
**Plans**: 4 plans (01-01 to 01-04)

Plans:
- [ ] 01-01: Monorepo workspace setup, Rust `crates/pos-core` skeleton, and Tauri 2 desktop shell configuration.
- [ ] 01-02: Precise arithmetic engine in `pos-core/src/money.rs` with `Paisa(i64)`, `Qty(i64)`, basis point tax, and property tests.
- [ ] 01-03: SQLCipher integration with rusqlite, Windows DPAPI encryption key derivation, and refinery database migration harness.
- [ ] 01-04: End-to-end walking skeleton: Tauri command calling `pos-core` database migration and status probe, displaying on React UI.

### Phase 2: Security, Master Data & Urdu Localization
**Goal**: Implement user access controls, cashier PIN login, basic business configuration, and a complete bilingual (English/Urdu) RTL UI.  
**Depends on**: Phase 1  
**Requirements**: AUTH-01, I18N-01  
**Success Criteria**:
  1. Users can authenticate using Argon2id-hashed credentials, and cashiers can instantly switch sessions using a 4-digit PIN.
  2. UI toggles seamlessly between English and Urdu with correct RTL mirroring and bundled Noto Nastaliq Urdu rendering without external font downloads.
  3. Master data tables for categories, brands, and units are fully manageable with dual-language names.
**Plans**: TBD

### Phase 3: Catalog & High-Volume Data Import
**Goal**: Build the full product catalog supporting variants, units of measure, price tiers, and high-speed Excel/CSV import for 50,000+ items.  
**Depends on**: Phase 2  
**Requirements**: PROD-01, IMP-01  
**Success Criteria**:
  1. An Excel sheet with 50,000 products imports in under 30 seconds with duplicate validation.
  2. Product searches by barcode, SKU, English name, or Urdu name return in under 100ms.
  3. Products support multiple packaging units (e.g., carton of 24 pieces) with automatic unit conversion factors.
**Plans**: TBD

### Phase 4: Purchasing, Costing & Stock Ledger
**Goal**: Implement the immutable stock movement ledger, purchase invoice entry, landed cost allocation, and weighted-average costing with strict negative stock blocking.  
**Depends on**: Phase 3  
**Requirements**: COST-01, COST-02, LEDG-01  
**Success Criteria**:
  1. Stock movements are recorded immutably in base units for every inbound purchase and opening balance.
  2. Weighted-average cost recalculates accurately upon purchase receipt with allocated freight charges.
  3. Attempts to record inventory deductions that would breach on-hand stock are blocked strictly according to shop policy.
**Plans**: TBD

### Phase 5: Stock Audits, Discrepancies & Label Designer
**Goal**: Provide purchase returns, inventory adjustments, stock count sessions with variance approvals, cache rebuilding, and thermal barcode label printing.  
**Depends on**: Phase 4  
**Requirements**: CACHE-01, COUNT-01, LABEL-01  
**Success Criteria**:
  1. Cache rebuild tool reconstructs `inventory_balances` identically from raw `stock_movements` on a 100,000-movement test dataset.
  2. Stock audit workflow tracks physical counts vs expected stock and posts audited adjustment entries.
  3. Thermal label designer produces ready-to-print barcode labels (38x25mm and 50x30mm) with English and Urdu item names.
**Plans**: TBD

### Phase 6: POS Checkout & Transaction Engine
**Goal**: Build the cashier checkout screen with continuous scanner focus, parked carts, price tiers, split tenders, and atomic `BEGIN IMMEDIATE` sale posting.  
**Depends on**: Phase 5  
**Requirements**: POS-01, POS-02, POS-03, POST-01  
**Success Criteria**:
  1. Barcode scanning adds items in under 100ms with keyboard shortcuts for all operations.
  2. Multiple sales carts can be parked and retrieved, surviving unexpected application restarts.
  3. Every completed checkout posts atomically in a single transaction that updates stock, ledgers, and cash balances without partial records.
**Plans**: TBD

### Phase 7: Hardware Printing, Receipts & Cash Sessions
**Goal**: Integrate ESC/POS thermal printers (58mm/80mm) with 1-bit Urdu raster bitmap printing, cash drawer kick, returns, and cashier cash shift management.  
**Depends on**: Phase 6  
**Requirements**: PRINT-01, DRAWER-01, RET-01, SHIFT-01  
**Success Criteria**:
  1. Thermal receipts with Nastaliq Urdu render cleanly via 1-bit raster bitmaps across standard printers.
  2. Cash drawer kicks automatically upon cash tendering.
  3. Cash sessions track opening float, expected tenders, and discrepancies to produce a verified Z-report.
**Plans**: TBD

### Phase 8: Khata (Customer/Vendor Credit) & WhatsApp Sharing
**Goal**: Deliver native Pakistani Khata ledger management, credit limit validation, payment allocations, and WhatsApp statement distribution.  
**Depends on**: Phase 7  
**Requirements**: KHATA-01, KHATA-02, KHATA-03, KHATA-04  
**Success Criteria**:
  1. Credit sales increase customer balance, with credit limits strictly enforced or manager-overridden.
  2. Payment allocations automatically settle oldest open invoices (FIFO) or allow manual invoice allocation.
  3. Formatted account statements in English or Urdu generate as PDF/images and open directly in WhatsApp with customer phone numbers.
**Plans**: TBD

### Phase 9: Analytics, Reporting & Encrypted Backup
**Goal**: Provide offline financial and inventory analytics, automated background database snapshots, encrypted USB backups, and a tested restore wizard.  
**Depends on**: Phase 8  
**Requirements**: REP-01, REP-02, REP-03, BAK-01, BAK-02, REST-01  
**Success Criteria**:
  1. Comprehensive offline reports (sales by item/category/cashier, gross profit, stock valuation, khata aging) export to PDF, CSV, and XLSX.
  2. Automatic SQLite snapshots take place every 30 minutes without locking the checkout cashier.
  3. Restore wizard successfully restores an encrypted backup file on a fresh machine with zero data corruption.
**Plans**: TBD

### Phase 10: Licensing, Updates & Industry Packs
**Goal**: Implement Ed25519 offline license validation, machine fingerprinting, trial periods, and industry-specific packs for Grocery and Electronics.  
**Depends on**: Phase 9  
**Requirements**: LIC-01, LIC-02, PACK-01, PACK-02  
**Success Criteria**:
  1. App activates completely offline using a signed license code generated from a machine fingerprint.
  2. Grocery pack decodes scale-printed barcodes (prefix 20–29) and supports vegetable quick-keys.
  3. Electronics pack records IMEI/serial numbers on purchase and sale, and prints warranty cards.
**Plans**: TBD

### Phase 11: Resilience Testing, Security Audit & Pilot Deployment
**Goal**: Execute rigorous resilience testing (power-pull drills, 1M record benchmarks), conduct an ASVS Level 1 security audit, publish the Urdu operator manual, and deploy to 5 pilot shops.  
**Depends on**: Phase 10  
**Requirements**: CRASH-01  
**Success Criteria**:
  1. The system survives 20 consecutive power-pull tests during active posting without corrupted records or lost committed data.
  2. Pilot shops successfully complete at least 2 weeks of live retail operation with zero data-loss incidents.
  3. Average cashier checkout time per 5 items is verified under 30 seconds.
**Plans**: TBD

### Phase 12: Pilot Hardening & General Availability Launch
**Goal**: Address pilot shop feedback, certify standard market thermal printers and scanners, finalize dealer onboarding material, and release v1.0.  
**Depends on**: Phase 11  
**Requirements**: All v1 requirements verified  
**Success Criteria**:
  1. Zero critical or high severity bugs open.
  2. Signed production Windows installer (.msi / .exe) ready for dealer distribution.
  3. At least 4 out of 5 pilot shop owners express willingness to pay full price for annual renewal.
**Plans**: TBD
