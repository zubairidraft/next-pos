# Phase 3 Plan 1 Summary: Core Catalog Models & Sub-100ms Search

**Plan:** `03-01-PLAN.md`  
**Crate:** `crates/pos-core`  
**Status:** Completed & Verified  

## Accomplishments
1. **Migration & Indexes (`V2__catalog_indexes.sql`)**:
   - Added covering indexes: `idx_barcodes_value`, `idx_products_sku`, `idx_products_name`, `idx_products_name_ur`, `idx_product_variants_sku`, `idx_prices_variant_list`, and `idx_variant_units_barcode`.
   - Seeded default price lists (`retail`, `wholesale`) and tax rates (FBR standard 18%, exempt 0%).

2. **Catalog Domain Models & Repository (`crates/pos-core/src/domain/catalog.rs`)**:
   - `Product`: Full product lifecycle with dual-script support (`name`, `name_ur`), category/brand associations, and tracking modes (`none`, `batch`, `serial`).
   - `ProductVariant` & `VariantUnit`: Packaging unit conversions with integer milli-unit factor (`Qty(1000)` = 1 base piece, `Qty(24000)` = carton of 24 pieces).
   - Multi-tier pricing: Integer `Paisa(i64)` pricing for retail and wholesale tiers.
   - Multi-barcode support per item (`manufacturer`, `in-store`, `scale-prefix`).

3. **Sub-100ms Search & Conversion Functions**:
   - `CatalogRepo::get_by_barcode`: Sub-5ms indexed scanner lookup.
   - `CatalogRepo::get_by_sku`: Sub-5ms indexed item code lookup.
   - `CatalogRepo::search`: Dual-script substring and prefix matching in English and Urdu Nastaliq.
   - `convert_to_base_qty` & `convert_from_base_qty`: Zero-float precision integer arithmetic.

4. **Automated Verification**:
   - `tests/catalog_tests.rs`: Verified barcode scanner lookup, SKU resolution, bilingual Nastaliq search, and carton-to-piece conversions.
