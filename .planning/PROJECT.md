# Next POS (کاروبار پی او ایس)

## What This Is

Next POS is a commercial, offline-first Point of Sale (POS) and inventory management product designed specifically for Pakistani shops and businesses. It runs completely standalone on a single Windows PC, reliably surviving frequent power cuts and internet outages. It features bilingual English/Urdu UI and receipts, native Khata (udhaar/customer credit) accounting, strict inventory costing, and local hardware integration, with planned Tier-1 FBR integration in v1.5.

## Core Value

Uninterrupted, zero-data-loss local retail operation that runs 100% offline with sub-100ms scan-to-cart performance and immutable, audited transaction posting.

## Business Context

- **Customer**: Non-Tier-1 Pakistani retail shops (kiryana/general stores, mobile/electronics, clothing/shoes, hardware/paint), expanding to Tier-1 retailers in v1.5 and pharmacies in v2.
- **Revenue model**: Yearly license per PC (with dealer channel margins), one-time setup/training fees, and annual add-on modules (FBR e-invoicing, cloud backup). 14-day offline-convertible trial.
- **Success metric**: 0 data loss incidents across power cuts; checkout time under 30s per 5 items; 95%+ daily backup completion; <1 support call/shop/week.
- **Strategy notes**: Go-to-market via regional computer and hardware dealers who issue offline activation codes and provide first-line support.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **ARCH-01**: Monorepo with pure Rust `pos-core` library crate, Tauri 2 shell, and React + TypeScript frontend
- [ ] **SEC-01**: SQLCipher-encrypted SQLite database at rest with Windows DPAPI key management and owner recovery code
- [ ] **DATA-01**: Integer money representation using `Paisa(i64)` and quantities in milli-units `Qty(i64)` with half-up rounding in `money.rs`
- [ ] **POST-01**: Atomic document posting (`BEGIN IMMEDIATE`) for sales, returns, purchases, adjustments, and payments
- [ ] **STOCK-01**: Immutable stock movement ledger with automated inventory balance cache and rebuild/verify tools
- [ ] **COST-01**: Strict weighted-average inventory costing with configurable negative-stock enforcement (set to `Block` by default)
- [ ] **I18N-01**: Complete bilingual UI (English and Urdu) with RTL support and bundled offline Noto Nastaliq Urdu font
- [ ] **HARD-01**: Local hardware integration: USB/Bluetooth barcode scanner HID input, 58mm/80mm ESC/POS thermal printers with Urdu raster bitmap printing, and RJ11 cash drawer kick
- [ ] **KHATA-01**: Customer and vendor Khata ledgers, credit limit checks, payment allocations to oldest invoices, and Urdu/English statements with WhatsApp sharing
- [ ] **GROC-01**: Grocery pack: loose items by weight, price-embedded/weight-embedded scale barcode decoding (prefix 20–29)
- [ ] **ELEC-01**: Electronics pack: serial/IMEI tracking on purchase and sale, warranty card printing, and serial status verification
- [ ] **SAFE-01**: Power cut resilience with WAL mode, crash recovery on startup, held cart disk persistence, and automated/USB encrypted backups with verified restore wizard
- [ ] **LIC-01**: Ed25519-signed offline licensing, machine fingerprinting, 14-day trial, and dealer panel activation support

### Out of Scope (v1)

- Cloud sync / live web dashboard — deferred to v2 cloud add-on
- Mobile companion app — deferred to v2 (Expo/React Native)
- FBR integration & e-invoicing — deferred to v1.5 (`pos-fbr` crate)
- Multi-counter LAN server mode — deferred to v3
- Pharmacy batch/expiry mandatory FEFO and Fashion size/color matrices — deferred to v2

## Context

- Target operating environment: Windows 10/11 (64-bit), 4 GB RAM, Core i3 4th-gen class machines commonly found in Pakistani markets.
- High incidence of power load shedding and erratic internet connectivity requires local SQLite WAL mode and zero runtime internet dependencies for checkout, printing, and khata.
- Localization requires dual-script database schema (`name`, `name_ur`), RTL layout mirroring, and bitmap-based raster printing since ESC/POS printers lack native Nastaliq font tables.

## Constraints

- **Performance**: Sub-100ms scan-to-cart latency with 50,000 product catalog; under 4 GB RAM consumption.
- **Data Integrity**: 100% atomic transactions; no floating point numbers anywhere in posting or costing code (`f64` strictly forbidden).
- **Security**: Local database encrypted at rest via SQLCipher; cashier PINs and passwords hashed with Argon2id; cashier auto-lock timer.
- **Hardware Compatibility**: Standard ESC/POS ESC/POS commands, TSPL/ZPL label printers, and USB HID barcode scanner emulation.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pure Rust `pos-core` crate | Ensures maximum execution speed, zero memory bloat on 4GB PCs, and reusable core logic for multi-counter LAN mode | Good |
| Tauri 2 + React + TypeScript | Tiny binary footprint, native Windows API access, low RAM usage compared to Electron | Good |
| SQLCipher + SQLite WAL | Enterprise-grade encryption at rest with extreme crash resilience during sudden power loss | Good |
| Paisa (`i64`) & Qty (`i64`) | Eliminates floating-point rounding errors across tax, discounts, and currency totals | Good |
| Negative-Stock Policy: Block | Prevents stock corruption, phantom inventory, and cost estimation discrepancies | Good |
| Raster Bitmap Printing for Urdu | Pakistani receipt printers do not bundle Urdu fonts; rendering HTML to 1-bit bitmap guarantees beautiful Nastaliq output | Good |
| Offline Ed25519 Licensing | Allows software activation in shops without active internet through WhatsApp activation codes | Good |

---
*Last updated: 2026-10-28 after project initialization from revised blueprint*
