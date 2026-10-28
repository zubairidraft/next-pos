# Requirements: Next POS (کاروبار پی او ایس)

**Defined:** 2026-10-28  
**Core Value:** Uninterrupted, zero-data-loss local retail operation that runs 100% offline with sub-100ms scan-to-cart performance and immutable, audited transaction posting.

## v1 Requirements

Requirements for initial release, structured across the 12 implementation phases.

### Foundation & Master Data (Phases 1 - 3)
- [ ] **ARCH-01**: Monorepo configured with Cargo workspace for `crates/pos-core`, Tauri 2 shell, and Vite + React frontend.
- [ ] **DB-01**: SQLCipher-encrypted SQLite storage in WAL mode with refinery migrations and foreign key constraints enabled.
- [ ] **NUM-01**: Integer `Paisa(i64)` money representation and `Qty(i64)` milli-unit quantities with half-up rounding in `money.rs`.
- [ ] **AUTH-01**: Multi-user authentication with Argon2id password hashing and quick cashier PIN switching.
- [ ] **I18N-01**: Bilingual English/Urdu interface using i18next, automatic RTL layout direction, and bundled offline Noto Nastaliq Urdu font.
- [ ] **PROD-01**: Product catalog with SKU, bilingual names, categories, brands, units, barcodes, and price list mappings.
- [ ] **IMP-01**: High-speed Excel/CSV catalog importer supporting 50,000 products with duplicate validation and error reporting.

### Inventory & Costing (Phases 4 - 5)
- [ ] **COST-01**: Weighted-average cost calculation on purchase arrival with landed freight/duty allocation.
- [ ] **COST-02**: Enforced negative stock policy set to `Block` by default (prevents negative quantity postings).
- [ ] **LEDG-01**: Immutable stock movement ledger tracking all receipts, issues, returns, and adjustments in base units.
- [ ] **CACHE-01**: Cached `inventory_balances` table with built-in Settings verification and rebuild utility.
- [ ] **COUNT-01**: Stock count/audit sessions recording physical counts, discrepancy variances, and manager approval.
- [ ] **LABEL-01**: Barcode generation (Code 128 / EAN-13 internal) and thermal label designer for standard label sizes (38x25mm, 50x30mm).

### Checkout & Hardware (Phases 6 - 7)
- [ ] **POS-01**: High-performance cashier checkout interface with auto-focused scanner input and sub-100ms scan-to-cart response.
- [ ] **POS-02**: Multiple parked carts (hold and recall) persisted to disk for power-cut resilience.
- [ ] **POS-03**: Multi-tender payment processing (Cash, Card, JazzCash, Easypaisa, Raast, Bank, Khata credit) with change calculation.
- [ ] **POST-01**: Atomic posting (`BEGIN IMMEDIATE`) of sales transactions with simultaneous stock decrement and ledger logging.
- [ ] **PRINT-01**: ESC/POS thermal receipt printing (58mm and 80mm) with Urdu rendered as 1-bit raster graphics.
- [ ] **DRAWER-01**: Cash drawer kick signal via receipt printer RJ11 port on cash payments.
- [ ] **RET-01**: Sales return processing linked to original receipt barcode or manager-approved unlinked return.
- [ ] **SHIFT-01**: Cash sessions tracking opening float, expected cash, counted closing cash, and Z-report generation.

### Khata & Reporting (Phases 8 - 9)
- [ ] **KHATA-01**: Customer and vendor Khata ledgers with debit/credit balance reconciliation.
- [ ] **KHATA-02**: Credit limits with cashier block and manager override capability.
- [ ] **KHATA-03**: Payment allocation engine applying settlements to oldest invoices first or specific documents.
- [ ] **KHATA-04**: Urdu and English account statements exportable as PDF/PNG with direct WhatsApp link generation (`wa.me`).
- [ ] **REP-01**: Daily summary (Z-report), sales performance by item/category/cashier, and gross profit analysis.
- [ ] **REP-02**: Khata aging report categorized by buckets (0–30, 31–60, 61–90, 90+ days).
- [ ] **REP-03**: Offline PDF, CSV, and XLSX export for all financial and inventory reports.

### Administration & Reliability (Phases 9 - 12)
- [ ] **BAK-01**: Automatic background snapshots every 30 minutes and upon day close using SQLite Online Backup API.
- [ ] **BAK-02**: Encrypted USB drive backup routine with missed-backup alerts.
- [ ] **REST-01**: Guided restore wizard with backup verification, safety duplicate creation, and schema checks.
- [ ] **LIC-01**: Ed25519-signed offline license file verification bound to machine hardware fingerprints (board/disk/GUID).
- [ ] **LIC-02**: 14-day fully featured trial with receipt watermark and 7-day post-expiration grace period.
- [ ] **PACK-01**: Grocery pack: loose weighted items and embedded-weight/price scale barcode parsing (prefix 20–29).
- [ ] **PACK-02**: Electronics pack: serial/IMEI tracking for purchases and sales with warranty card generation.
- [ ] **CRASH-01**: Startup crash-recovery verification detecting interrupted writes and restoring held carts.

---

## v1.5 Requirements (FBR Integration)

- **FBR-01**: `pos-fbr` crate supporting offline outbox queue and asynchronous submission to FBR.
- **FBR-02**: Verifiable FBR QR code generation and invoice sequence numbering on printed receipts.
- **FBR-03**: Windows credential store integration for FBR API keys.
- **FBR-04**: 20-hour and 40-hour offline threshold alerts preventing outlet closure penalties under SRO rules.

---

## v2 Requirements (Mobile Companion & Extended Packs)

- **MOB-01**: React Native / Expo companion mobile app for camera-based barcode scanning.
- **MOB-02**: Stock count batches and purchase receiving via mobile app over secure local LAN.
- **MOB-03**: Mobile owner dashboard showing real-time daily sales and khata due over LAN.
- **PHARM-01**: Pharmacy pack: mandatory batch numbers, manufacture & expiry dates, and FEFO inventory dispatch.
- **FASH-01**: Fashion pack: size x color matrix variant generation and size-wise stock grids.
- **HARDW-01**: Hardware pack: custom unit conversions and quotations converted to sales invoices.
- **CLOUD-01**: Encrypted cloud backup and remote owner web dashboard.

---

## Out of Scope (v1)

| Feature | Reason |
|---------|--------|
| Payment Gateway Direct API | Pakistani merchants rely on manual reference verification for JazzCash/Easypaisa/Raast in shop counters; automated POS gateway APIs add unnecessary internet dependency. |
| Cloud Database Synchronization | Unreliable internet makes cloud-first architecture brittle; local SQLite WAL is 100% offline-safe. |
| Multi-counter LAN Sharing | Kept for v3 to ensure v1 single-counter desktop shell is rock-solid and bulletproof first. |
| Direct RS232 Serial Scale Polling | Scale-printed barcodes (prefix 20-29) solve 95% of grocery store needs without fragile COM port drivers in v1. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01, DB-01, NUM-01 | Phase 1 | Pending |
| AUTH-01, I18N-01 | Phase 2 | Pending |
| PROD-01, IMP-01 | Phase 3 | Pending |
| COST-01, COST-02, LEDG-01 | Phase 4 | Pending |
| CACHE-01, COUNT-01, LABEL-01 | Phase 5 | Pending |
| POS-01, POS-02, POS-03, POST-01 | Phase 6 | Pending |
| PRINT-01, DRAWER-01, RET-01, SHIFT-01 | Phase 7 | Pending |
| KHATA-01, KHATA-02, KHATA-03, KHATA-04 | Phase 8 | Pending |
| REP-01, REP-02, REP-03, BAK-01, BAK-02, REST-01 | Phase 9 | Pending |
| LIC-01, LIC-02, PACK-01, PACK-02 | Phase 10 | Pending |
| CRASH-01 | Phase 11 | Pending |
