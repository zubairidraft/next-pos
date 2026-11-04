# Roadmap: Next POS (کاروبار پی او ایس)

## Overview

Next POS is delivered across 12 focused implementation phases (corresponding to the 12 two-week development sprints in the product blueprint) leading up to commercial launch. The development pathway establishes an impregnable local foundation (Rust core + encrypted SQLite + integer money), layers on strict inventory costing and multi-tier master data, executes high-speed cashier checkout and thermal hardware printing, introduces comprehensive customer Khata and automated backups, and concludes with offline licensing, industry packs, and pilot shop validation.

## Phases

- [x] **Phase 1: Foundation, Data Engine & Architecture** - Monorepo setup, Tauri 2 shell, pos-core crate, SQLCipher encrypted database, migrations, and Paisa/Qty precision arithmetic types.
- [x] **Phase 2: Security, Master Data & Urdu Localization** - User accounts, RBAC, cashier PIN quick-switching, system settings, first-run wizard, and complete English/Urdu RTL interface.
- [x] **Phase 3: Catalog & High-Volume Data Import** - Products, variants, unit conversions, multi-tier price lists, barcode management, and high-performance Excel/CSV importer for 50,000+ items.
- [x] **Phase 4: Purchasing, Costing & Stock Ledger** - Immutable stock movement ledger, vendor invoices, landed cost distribution, and weighted-average costing with Block on negative stock.
- [x] **Phase 5: Stock Audits, Discrepancies & Label Designer** - Purchase returns, stock adjustments, physical count sessions, inventory cache rebuild tool, and thermal barcode label designer.
- [ ] **Phase 6: POS Checkout & Transaction Engine** - High-speed keyboard/scanner-first checkout, parked carts (hold/recall), split-tender payments, and atomic `BEGIN IMMEDIATE` sale posting.
- [ ] **Phase 7: Hardware Printing, Receipts & Cash Sessions** - ESC/POS thermal printing with Urdu 1-bit raster graphics, cash drawer triggering, sale returns, cashier cash sessions, and daily Z-reports.
- [ ] **Phase 8: Khata (Customer/Vendor Credit) & WhatsApp Sharing** - Customer and vendor credit ledgers, automated FIFO payment allocation, statement generation in Urdu/English, and WhatsApp sharing.
- [ ] **Phase 9: Analytics, Reporting & Encrypted Backup** - Financial and inventory reports (PDF/CSV/XLSX), executive dashboard, automated 30-minute SQLite snapshots, USB backups, and verified restore wizard.
- [ ] **Phase 10: Licensing, Updates & Industry Packs** - Ed25519 offline license verification, machine fingerprinting, Grocery pack (scale barcodes), and Electronics pack (serial/IMEI tracking).
- [ ] **Phase 11: Resilience Testing, Security Audit & Pilot Deployment** - Power-pull resilience testing, performance benchmarks with 1M rows, Urdu operator training manual, and 5-shop pilot rollout.
- [ ] **Phase 12: Pilot Hardening & General Availability Launch** - Resolution of shop feedback, final hardware compatibility certifications, dealer portal, and production Windows release.
- [x] **Phase 13: Core Data Wiring & SQLite Persistence** - Expose Rust master data and catalog IPC commands, wire Catalog, Master Data, Khata, and Purchasing frontend to real encrypted SQLite database.
- [x] **Phase 14: Hardware Peripherals & ESC/POS Printing** - Native ESC/POS thermal receipt printing, Windows raw print spooler, cash drawer kick pulse, and printer diagnostic manager.
- [x] **Phase 15: Offline Reporting & Analytics Engine** - Connect ReportsView to live SQLite database (Sales & Revenue, Inventory Valuation, Low Stock Alerts, P&L Statement) with CSV export.
- [x] **Phase 16: Cashier Shifts, Petty Cash & Z-Report Auditing** - Cash session tracking, drawer floats, cash drops, Pakistani denomination counting, and thermal Z-Report generation.
- [x] **Phase 17: Encrypted Backups & Offline Licensing** - Non-blocking SQLite VACUUM live snapshots, encrypted .kpos packages with Argon2id, hardware fingerprinting, and Ed25519 offline license verification.

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
- [x] 01-01: Monorepo workspace setup, Rust `crates/pos-core` skeleton, and Tauri 2 desktop shell configuration.
- [x] 01-02: Precise arithmetic engine in `pos-core/src/money.rs` with `Paisa(i64)`, `Qty(i64)`, basis point tax, and property tests.
- [x] 01-03: SQLCipher integration with rusqlite, Windows DPAPI encryption key derivation, and refinery database migration harness.
- [x] 01-04: End-to-end walking skeleton: Tauri command calling `pos-core` database migration and status probe, displaying on React UI.

### Phase 2: Security, Master Data & Urdu Localization
**Goal**: Implement user access controls, cashier PIN login, basic business configuration, and a complete bilingual (English/Urdu) RTL UI.  
**Depends on**: Phase 1  
**Requirements**: AUTH-01, I18N-01  
**Success Criteria**:
  1. Users can authenticate using Argon2id-hashed credentials, and cashiers can instantly switch sessions using a 4-digit PIN.
  2. UI toggles seamlessly between English and Urdu with correct RTL mirroring and bundled Noto Nastaliq Urdu rendering without external font downloads.
  3. Master data tables for categories, brands, and units are fully manageable with dual-language names.
**Plans**: 4 plans (02-01 to 02-04)

Plans:
- [x] 02-01: Authentication & role permissions in pos-core with Argon2id password and PIN hashing.
- [x] 02-02: Bilingual master data repositories (categories, brands, units, settings) with dual-script search.
- [x] 02-03: Client-side i18n framework, locally bundled Urdu typography, and dynamic RTL layout mirroring.
- [x] 02-04: First-run setup wizard, cashier PIN quick-switch modal, and master data management views.

### Phase 3: Catalog & High-Volume Data Import
**Goal**: Build the full product catalog supporting variants, units of measure, price tiers, and high-speed Excel/CSV import for 50,000+ items.  
**Depends on**: Phase 2  
**Requirements**: PROD-01, IMP-01  
**Success Criteria**:
  1. An Excel sheet with 50,000 products imports in under 30 seconds with duplicate validation.
  2. Product searches by barcode, SKU, English name, or Urdu name return in under 100ms.
  3. Products support multiple packaging units (e.g., carton of 24 pieces) with automatic unit conversion factors.
**Plans**: 4 plans (03-01 to 03-04)

Plans:
- [x] 03-01: Core catalog domain models, SQLite index migrations, packaging unit conversions, and sub-100ms multi-script search.
- [x] 03-02: High-speed streaming CSV/Excel catalog importer with batch chunking and 50,000-item benchmark (< 30s).
- [x] 03-03: Desktop catalog management table, scanner-first search, and bilingual product creation modal.
- [x] 03-04: Bulk importer modal with template download, live progress bar, validation error summary, and shell integration.

### Phase 4: Purchasing, Costing & Stock Ledger
**Goal**: Implement the immutable stock movement ledger, purchase invoice entry, landed cost allocation, and weighted-average costing with strict negative stock blocking.  
**Depends on**: Phase 3  
**Requirements**: COST-01, COST-02, LEDG-01  
**Success Criteria**:
  1. Stock movements are recorded immutably in base units for every inbound purchase and opening balance.
  2. Weighted-average cost recalculates accurately upon purchase receipt with allocated freight charges.
  3. Attempts to record inventory deductions that would breach on-hand stock are blocked strictly according to shop policy.
**Plans**: 4 plans (04-01 to 04-04)

Plans:
- [x] 04-01: Immutable stock movement ledger, balance cache updates, and strict negative stock enforcement (`Block`).
- [x] 04-02: Purchase order and receiving entry with multi-tier landed cost distribution in `Paisa(i64)`.
- [x] 04-03: Moving-weighted-average cost recalculation engine with audit trail.
- [x] 04-04: Purchasing desktop UI with supplier selection, batch line entry, landed cost wizard, and stock ledger inspector.

### Phase 5: Stock Audits, Discrepancies & Label Designer
**Goal**: Provide purchase returns, inventory adjustments, stock count sessions with variance approvals, cache rebuilding, and thermal barcode label printing.  
**Depends on**: Phase 4  
**Requirements**: CACHE-01, COUNT-01, LABEL-01  
**Success Criteria**:
  1. Cache rebuild tool reconstructs `inventory_balances` identically from raw `stock_movements` on a 100,000-movement test dataset.
  2. Stock audit workflow tracks physical counts vs expected stock and posts audited adjustment entries.
  3. Thermal label designer produces ready-to-print barcode labels (38x25mm and 50x30mm) with English and Urdu item names.
**Plans**: 4 plans (05-01 to 05-04)

Plans:
- [x] 05-01: Purchase returns to vendors with automated negative stock prevention and cost recovery.
- [x] 05-02: Stock adjustments with reason codes and inventory cache rebuild verification engine.
- [x] 05-03: Physical stock count sessions, blind auditing, and variance approval workflow.
- [x] 05-04: Thermal barcode label designer (38x25mm and 50x30mm) with bilingual typography and batch print queue.

### Phase 6: POS Checkout & Transaction Engine
**Goal**: Build the cashier checkout screen with continuous scanner focus, parked carts, price tiers, split tenders, and atomic `BEGIN IMMEDIATE` sale posting.  
**Depends on**: Phase 5  
**Requirements**: POS-01, POS-02, POS-03, POST-01  
**Success Criteria**:
  1. Barcode scanning adds items in under 100ms with keyboard shortcuts for all operations.
  2. Multiple sales carts can be parked and retrieved, surviving unexpected application restarts.
  3. Every completed checkout posts atomically in a single transaction that updates stock, ledgers, and cash balances without partial records.
**Plans**: 4 plans (06-01 to 06-04)

Plans:
- [x] 06-01: High-speed POS cart state machine with continuous scanner focus, hotkeys, and price tier resolution.
- [x] 06-02: Parked cart (Hold/Recall) manager with persistent disk state across sudden application restarts.
- [x] 06-03: Split-tender payment engine (Cash, Card, Khata Credit, Bank Transfer) with atomic `BEGIN IMMEDIATE` sale posting.
- [x] 06-04: Fullscreen POS cashier interface in React with high-speed keyboard shortcuts and touch-friendly numpad.

### Phase 7: Hardware Printing, Receipts & Cash Sessions
**Goal**: Integrate ESC/POS thermal printers (58mm/80mm) with 1-bit Urdu raster bitmap printing, cash drawer kick, returns, and cashier cash shift management.  
**Depends on**: Phase 6  
**Requirements**: PRINT-01, DRAWER-01, RET-01, SHIFT-01  
**Success Criteria**:
  1. Thermal receipts with Nastaliq Urdu render cleanly via 1-bit raster bitmaps across standard printers.
  2. Cash drawer kicks automatically upon cash tendering.
  3. Cash sessions track opening float, expected tenders, and discrepancies to produce a verified Z-report.
**Plans**: 4 plans (07-01 to 07-04)

Plans:
- [x] 07-01: ESC/POS thermal receipt engine with 1-bit monochrome Urdu Nastaliq raster bitmaps (58mm/80mm).
- [x] 07-02: Hardware kick pulse for cash drawers (RJ11 solenoid pulse) and manual drawer control.
- [x] 07-03: Cashier shift sessions with opening float, cash drops/payouts, and verified daily Z-Report generation.
- [x] 07-04: POS receipt preview, sales returns workflow, and cashier shift reconciliation UI.

### Phase 8: Khata (Customer/Vendor Credit) & WhatsApp Sharing
**Goal**: Deliver native Pakistani Khata ledger management, credit limit validation, payment allocations, and WhatsApp statement distribution.  
**Depends on**: Phase 7  
**Requirements**: KHATA-01, KHATA-02, KHATA-03, KHATA-04  
**Success Criteria**:
  1. Credit sales increase customer balance, with credit limits strictly enforced or manager-overridden.
  2. Payment allocations automatically settle oldest open invoices (FIFO) or allow manual invoice allocation.
  3. Formatted account statements in English or Urdu generate as PDF/images and open directly in WhatsApp with customer phone numbers.
**Plans**: 4 plans (08-01 to 08-04)

Plans:
- [x] 08-01: Customer and vendor Khata ledgers with continuous running balance in `Paisa(i64)`.
- [x] 08-02: Automated FIFO payment allocation across unpaid invoices and customer credit limit enforcement.
- [x] 08-03: Bilingual statement generator and offline WhatsApp deep-link payment reminder builder.
- [x] 08-04: Khata desktop UI with receivables/payables dashboard, payment receipt modal, and WhatsApp share trigger.

### Phase 9: Analytics, Reporting & Encrypted Backup
**Goal**: Provide offline financial and inventory analytics, automated background database snapshots, encrypted USB backups, and a tested restore wizard.  
**Depends on**: Phase 8  
**Requirements**: REP-01, REP-02, REP-03, BAK-01, BAK-02, REST-01  
**Success Criteria**:
  1. Comprehensive offline reports (sales by item/category/cashier, gross profit, stock valuation, khata aging) export to PDF, CSV, and XLSX.
  2. Automatic SQLite snapshots take place every 30 minutes without locking the checkout cashier.
  3. Restore wizard successfully restores an encrypted backup file on a fresh machine with zero data corruption.
**Plans**: 4 plans (09-01 to 09-04)

Plans:
- [x] 09-01: Offline reporting engine: daily/period sales summary, profit & loss, inventory valuation, and cashier performance.
- [x] 09-02: Automated 30-minute non-blocking SQLite WAL background snapshotter and rotation policy.
- [x] 09-03: AES-256-GCM encrypted USB backup bundle (`.kpos`) and verified pre-restore integrity engine.
- [x] 09-04: Reports dashboard with date range filters, export utilities, and backup/restore wizard UI.

### Phase 10: Licensing, Updates & Industry Packs
**Goal**: Implement Ed25519 offline license validation, machine fingerprinting, trial periods, and industry-specific packs for Grocery and Electronics.  
**Depends on**: Phase 9  
**Requirements**: LIC-01, LIC-02, PACK-01, PACK-02  
**Success Criteria**:
  1. App activates completely offline using a signed license code generated from a machine fingerprint.
  2. Grocery pack decodes scale-printed barcodes (prefix 20–29) and supports vegetable quick-keys.
  3. Electronics pack records IMEI/serial numbers on purchase and sale, and prints warranty cards.
**Plans**: 4 plans (10-01 to 10-04)

Plans:
- [x] 10-01: Air-gapped Ed25519 offline license verification and Windows hardware fingerprint generator.
- [x] 10-02: Grocery pack: scale-embedded price/weight barcode parser (prefixes 20-29) and tare deduction.
- [x] 10-03: Electronics pack: IMEI/serial number tracking on purchase and sale, and apparel matrix variants.
- [x] 10-04: License activation interface with machine fingerprint copy, trial indicator, and industry pack switchers.

### Phase 11: Resilience Testing, Security Audit & Pilot Deployment
**Goal**: Execute rigorous resilience testing (power-pull drills, 1M record benchmarks), conduct an ASVS Level 1 security audit, publish the Urdu operator manual, and deploy to 5 pilot shops.  
**Depends on**: Phase 10  
**Requirements**: CRASH-01  
**Success Criteria**:
  1. The system survives 20 consecutive power-pull tests during active posting without corrupted records or lost committed data.
  2. Pilot shops successfully complete at least 2 weeks of live retail operation with zero data-loss incidents.
  3. Average cashier checkout time per 5 items is verified under 30 seconds.
**Plans**: 4 plans (11-01 to 11-04)

Plans:
- [x] 11-01: Power-cut simulation harness and SQLite WAL crash-recovery stress tests.
- [x] 11-02: 1,000,000-row heavy load benchmark, query execution plan verification, and memory profiling.
- [x] 11-03: ASVS Level 1 local app security review: SQLCipher key isolation, command authorization, and log sanitization.
- [x] 11-04: Bilingual cashier training quick reference manual and automated system diagnostics health checker.

### Phase 12: Pilot Hardening & General Availability Launch
**Goal**: Address pilot shop feedback, certify standard market thermal printers and scanners, finalize dealer onboarding material, and release v1.0.  
**Depends on**: Phase 11  
**Requirements**: All v1 requirements verified  
**Success Criteria**:
  1. Zero critical or high severity bugs open.
  2. Signed production Windows installer (.msi / .exe) ready for dealer distribution.
  3. At least 4 out of 5 pilot shop owners express willingness to pay full price for annual renewal.
**Plans**: 4 plans (12-01 to 12-04)

Plans:
- [x] 12-01: Pilot shop ergonomics refinement: high-contrast theme, touch numpad targets, and scanner rapid-fire buffer.
- [x] 12-02: Certified Pakistani hardware compatibility matrix and ESC/POS diagnostic alignment suite.
- [x] 12-03: Standalone offline dealer license provisioning CLI tool (`crates/pos-license-cli`).
- [x] 12-04: Production NSIS Windows bundle, embedded asset packaging, and GA v1.0 release pipeline.

### Phase 13: Core Data Wiring & SQLite Persistence
**Goal**: Connect volatile frontend views (Catalog, Master Data, Khata, Purchasing, and Customer creation) to `pos-core` repositories via Tauri IPC commands, replacing in-memory mock states with persistent SQLite storage.  
**Depends on**: Phase 12  
**Requirements**: PROD-PERSIST-01, MASTER-DATA-01, KHATA-PERSIST-01  
**Success Criteria**:
  1. Products, categories, brands, and units added or edited in the UI persist across application restarts.
  2. New customers created at POS checkout or in Khata view are saved to the SQLite `parties` table and appear immediately in search/picker.
  3. Catalog search, filtering, and pagination query the local encrypted database rather than hardcoded mock arrays.
  4. Vendor purchase invoices and stock adjustments update `inventory_balances` in SQLite.
**Plans**: 4 plans (13-01 to 13-04)

Plans:
- [x] 13-01: Expose Master Data, Catalog, and Party IPC commands in `main.rs` & `api.ts`.
- [x] 13-02: Connect CatalogView and ProductFormModal to SQLite via Tauri IPC.
- [x] 13-03: Connect MasterDataView (Categories, Brands, Units) to SQLite via Tauri IPC.
- [x] 13-04: Connect Customers, KhataView, and Purchasing to SQLite via Tauri IPC.

### Phase 14: Hardware Peripherals & ESC/POS Printing
**Goal**: Connect physical 58mm/80mm thermal receipt printers via Windows raw print spooling (`winspool`) and network sockets (`9100`), trigger RJ11 cash drawers, and provide native 1-click silent receipt printing from POS Checkout.  
**Depends on**: Phase 13  
**Requirements**: HARDWARE-PRINT-01, DRAWER-KICK-01, PRINTER-SETTINGS-01  
**Success Criteria**:
  1. Cashiers can print sales receipts silently to USB/Network thermal printers with zero browser dialogs.
  2. Cash drawer solenoid trigger pulse (`ESC p 0 25 250`) executes upon cash checkout.
  3. `PrinterSettingsModal` lists available Windows printers, tests paper cutting, kicks the drawer, and tests diagnostic print streams.
  4. Both 58mm (32 col) and 80mm (48 col) paper roll profiles format properly with store header, item table, and bilingual footer.
**Plans**: 3 plans (14-01 to 14-03)

Plans:
- [x] 14-01: Implement raw ESC/POS Windows print spooler and network printer service in Rust (`src-tauri`).
- [x] 14-02: Expose printer Tauri commands (`list_printers`, `print_raw_escpos`, `print_sale_receipt`, `kick_cash_drawer`) and wire `api.ts`.
- [x] 14-03: Wire `PrinterSettingsModal`, `ReceiptModal`, and POS `CheckoutView` silent receipt printing & drawer kick.

### Phase 15: Offline Reporting & Analytics Engine
**Goal**: Connect ReportsView to live encrypted SQLite database for Sales & Revenue, Category Performance, Top Products, Inventory Valuation, and Low Stock Alerts with CSV export.  
**Depends on**: Phase 13, 14  
**Plans**: 1 plan (15-01)  
- [x] 15-01: Wire SQLite analytics queries, date range filters, and CSV export in `ReportsView.tsx`.

### Phase 16: Cashier Shifts, Petty Cash & Z-Report Auditing
**Goal**: Track cash sessions, opening floats, cash drops, Pakistani note denomination counter, and print Z-Reports to thermal receipt printers.  
**Depends on**: Phase 14  
**Plans**: 1 plan (16-01)  
- [x] 16-01: Implement cashier shift lifecycle, denomination reconciliation, and hardware Z-Report printing.

### Phase 17: Encrypted Backups & Offline Licensing
**Goal**: Non-blocking SQLite VACUUM live snapshots, encrypted .kpos packages with Argon2id, hardware fingerprinting, and Ed25519 offline license verification.  
**Depends on**: Phase 1, 13  
**Plans**: 1 plan (17-01)  
- [x] 17-01: Connect live snapshots, USB export/restore, machine hardware fingerprint, and offline license activation.

