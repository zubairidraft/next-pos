# Phase 3 Research: Catalog & High-Volume Data Import

## Phase Scope & Objectives
Phase 3 establishes the product catalog foundation in `crates/pos-core` and the management UI in `apps/desktop`.
1. **Catalog Domain Model & Repositories**:
   - Products with dual-script names (`name`, `name_ur`), SKU, category, brand, base unit, tax rate, and tracking mode (`none`, `batch`, `serial`).
   - Variants and packaging units with conversion factors in integer milli-units `Qty` (e.g. Carton of 24 = `24,000` milli-units).
   - Multi-tier pricing (`prices` table with `Paisa(i64)` mapped to `price_lists`, e.g., "Retail", "Wholesale").
   - Multi-barcode support per item (`manufacturer`, `in-store`, `scale-prefix`).
   - High-performance indexed search (sub-100ms query across barcode, SKU, and dual-script names).
2. **High-Throughput Catalog Importer (50,000+ Items in < 30s)**:
   - Streaming CSV reader (`csv` crate) and Excel reader (`calamine` crate in pure Rust).
   - Chunked batch transactions (2,500–5,000 rows per transaction) with prepared statements.
   - Validation engine: Duplicate SKU/Barcode pre-detection, missing mandatory fields, and detailed error log output.
3. **Frontend Catalog Management & Bulk Importer UI**:
   - High-speed product catalog list with search-as-you-type (barcode scanner immediate match).
   - Bilingual Product creation/editing drawer/modal.
   - Bulk Excel/CSV import modal with sample template download, column auto-mapping, import progress bar, and validation summary.

## Key Technical Decisions & Patterns

### 1. Zero Floating Point in Quantities & Prices
- Unit conversions use `factor_to_base: i64` in milli-units (`1000` = 1.000). For example, 1 Carton = 24 Pieces has `factor_to_base = 24000`.
- All prices stored as integer `price_paisa: i64`.

### 2. High-Speed SQLite Import Strategy
To comfortably exceed the 50,000 items in 30 seconds benchmark:
- SQLite runs in `WAL` mode with `PRAGMA synchronous = NORMAL`.
- Wrap batches in explicit `BEGIN TRANSACTION` ... `COMMIT` (5,000 rows per batch).
- Pre-compile `INSERT OR IGNORE` or `INSERT ... ON CONFLICT` prepared statements.
- Memory lookups for `categories`, `brands`, and `units` IDs cached in `HashMap<String, String>` before streaming rows to avoid N+1 DB lookups.

### 3. Dual-Script Search Optimization
- SQLite indexes on `barcodes(value)`, `products(sku)`, `product_variants(sku)`.
- Query structure:
  ```sql
  SELECT p.id, p.sku, p.name, p.name_ur, b.value as barcode, pr.price_paisa
  FROM products p
  LEFT JOIN product_variants pv ON pv.product_id = p.id
  LEFT JOIN barcodes b ON b.variant_id = pv.id
  LEFT JOIN prices pr ON pr.variant_id = pv.id
  WHERE b.value = ?1 OR p.sku = ?1 OR p.name LIKE ?2 OR p.name_ur LIKE ?2
  LIMIT 50;
  ```

### 4. Excel & CSV Rust Dependencies
- `csv = "1.3"` for streaming CSV parsing.
- `calamine = "0.26"` for native Rust Excel reader (supports `.xlsx`, `.xls`, `.xlsb` without external dependencies).

## Validation & Verification Plan
- Unit tests: Product creation, variant linking, packaging unit conversion math, price list lookups.
- Performance benchmark test: Generate 50,000 sample grocery items in CSV and import via `pos-core` importer, asserting total time < 30 seconds and row count verified.
- Search latency test: Assert barcode and SKU lookups complete in < 5ms.
- Frontend build verification: `npm run build` with type-check.
