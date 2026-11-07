use crate::error::{PosError, Result};
use crate::money::Qty;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub base_unit_id: String,
    pub hs_code: Option<String>,
    pub tax_rate_id: Option<String>,
    pub track_mode: String,
    pub has_variants: bool,
    pub reorder_level_milli: i64,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductVariant {
    pub id: String,
    pub product_id: String,
    pub attributes_json: String,
    pub sku: String,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantUnit {
    pub id: String,
    pub variant_id: String,
    pub unit_id: String,
    pub factor_to_base: i64, // in milli-units: 1000 = 1 base, 24000 = carton of 24
    pub barcode: Option<String>,
    pub is_sale_unit: bool,
    pub is_purchase_unit: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Barcode {
    pub id: String,
    pub variant_id: String,
    pub value: String,
    pub kind: String, // 'manufacturer', 'in-store', 'scale-prefix'
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Price {
    pub id: String,
    pub price_list_id: String,
    pub variant_id: String,
    pub unit_id: String,
    pub price_paisa: i64,
    pub valid_from: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceList {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

fn default_active() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductSearchResult {
    pub product_id: String,
    pub variant_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub brand_id: Option<String>,
    pub brand_name: Option<String>,
    pub base_unit_id: String,
    pub base_unit_code: String,
    pub barcode: Option<String>,
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
    pub tax_rate_bp: i32,
    pub tax_inclusive: bool,
    pub stock_on_hand_milli: i64,
    #[serde(default = "default_active")]
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagingUnitDetail {
    pub unit_id: String,
    pub unit_code: String,
    pub unit_name: String,
    pub factor_to_base: i64,
    pub barcode: Option<String>,
    pub retail_price_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductDetail {
    pub product_id: String,
    pub variant_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub brand_id: Option<String>,
    pub brand_name: Option<String>,
    pub base_unit_id: String,
    pub base_unit_code: String,
    pub base_unit_name: String,
    pub barcode: Option<String>,
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
    pub packaging_unit: Option<PackagingUnitDetail>,
    pub tax_rate_id: Option<String>,
    pub reorder_level_milli: i64,
    pub is_service: bool,
    pub track_mode: String,
    pub active: bool,
    pub on_hand_milli: i64,
    pub has_movements: bool,
    pub has_sales: bool,
    pub has_purchases: bool,
    pub serial_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePackagingUnit {
    pub unit_id: String,
    pub factor_to_base: i64,
    pub barcode: Option<String>,
    pub retail_price_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProductInput {
    pub product_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub base_unit_id: String,
    pub barcode: Option<String>,
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
    pub tax_rate_id: Option<String>,
    pub reorder_level_milli: i64,
    pub is_service: bool,
    pub active: bool,
    pub packaging_unit: Option<UpdatePackagingUnit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePackagingUnitParams {
    pub unit_id: String,
    pub factor_to_base: i64, // e.g. 24000 for carton of 24
    pub barcode: Option<String>,
    pub retail_price_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProductParams {
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub base_unit_id: String,
    pub hs_code: Option<String>,
    pub tax_rate_id: Option<String>,
    pub track_mode: Option<String>,
    pub reorder_level_milli: Option<i64>,
    pub barcode: Option<String>,
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
    pub packaging_units: Vec<CreatePackagingUnitParams>,
}

pub struct CatalogRepo;

impl CatalogRepo {
    /// Maps a database query row to a `ProductSearchResult`
    fn map_search_row(row: &Row) -> rusqlite::Result<ProductSearchResult> {
        Ok(ProductSearchResult {
            product_id: row.get(0)?,
            variant_id: row.get(1)?,
            sku: row.get(2)?,
            name: row.get(3)?,
            name_ur: row.get(4)?,
            category_id: row.get(5)?,
            category_name: row.get(6)?,
            brand_id: row.get(7)?,
            brand_name: row.get(8)?,
            base_unit_id: row.get(9)?,
            base_unit_code: row.get(10)?,
            barcode: row.get(11)?,
            retail_price_paisa: row.get::<_, Option<i64>>(12)?.unwrap_or(0),
            wholesale_price_paisa: row.get(13)?,
            tax_rate_bp: row.get::<_, Option<i32>>(14)?.unwrap_or(0),
            tax_inclusive: row.get::<_, Option<i32>>(15)?.unwrap_or(1) == 1,
            stock_on_hand_milli: row.get::<_, Option<i64>>(16)?.unwrap_or(0),
            active: row.get::<_, Option<i64>>(17)?.unwrap_or(1) == 1,
        })
    }

    const BASE_SEARCH_SELECT: &'static str = "
        SELECT 
            p.id,
            pv.id,
            pv.sku,
            p.name,
            p.name_ur,
            p.category_id,
            c.name as category_name,
            p.brand_id,
            b.name as brand_name,
            p.base_unit_id,
            u.code as base_unit_code,
            (SELECT value FROM barcodes WHERE variant_id = pv.id LIMIT 1) as barcode,
            (SELECT price_paisa FROM prices WHERE variant_id = pv.id AND price_list_id = 'retail' LIMIT 1) as retail_price_paisa,
            (SELECT price_paisa FROM prices WHERE variant_id = pv.id AND price_list_id = 'wholesale' LIMIT 1) as wholesale_price_paisa,
            COALESCE(tr.rate_bp, 0) as tax_rate_bp,
            COALESCE(tr.inclusive, 1) as tax_inclusive,
            COALESCE((SELECT on_hand_milli FROM inventory_balances WHERE variant_id = pv.id LIMIT 1), 0) as stock_on_hand_milli,
            p.active
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = 1
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN units u ON u.id = p.base_unit_id
        LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
    ";

    /// Creates a complete product with default variant, barcodes, prices, and packaging units
    pub fn create_product(conn: &Connection, params: CreateProductParams) -> Result<ProductSearchResult> {
        let trimmed_sku = params.sku.trim();
        let trimmed_name = params.name.trim();

        if trimmed_sku.is_empty() {
            return Err(PosError::Validation("Product SKU cannot be empty".into()));
        }
        if trimmed_name.is_empty() {
            return Err(PosError::Validation("Product name cannot be empty".into()));
        }

        let product_id = Ulid::new().to_string();
        let variant_id = Ulid::new().to_string();
        let now = Utc::now();
        let now_str = now.to_rfc3339();

        let track_mode = params.track_mode.unwrap_or_else(|| "none".into());
        let reorder_level = params.reorder_level_milli.unwrap_or(0);

        // 1. Insert master Product
        conn.execute(
            "INSERT INTO products (
                id, sku, name, name_ur, category_id, brand_id, base_unit_id,
                hs_code, tax_rate_id, track_mode, has_variants, reorder_level_milli,
                active, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, 1, ?12, ?12)",
            params![
                product_id,
                trimmed_sku,
                trimmed_name,
                params.name_ur.as_deref().map(|s| s.trim()),
                params.category_id,
                params.brand_id,
                params.base_unit_id,
                params.hs_code.as_deref().map(|s| s.trim()),
                params.tax_rate_id,
                track_mode,
                reorder_level,
                now_str
            ],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert product: {}", e)))?;

        // 2. Insert Default Variant
        conn.execute(
            "INSERT INTO product_variants (id, product_id, attributes_json, sku, is_default, created_at)
             VALUES (?1, ?2, '{}', ?3, 1, ?4)",
            params![variant_id, product_id, trimmed_sku, now_str],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert default variant: {}", e)))?;

        // 3. Insert Base Unit in variant_units
        conn.execute(
            "INSERT INTO variant_units (id, variant_id, unit_id, factor_to_base, barcode, is_sale_unit, is_purchase_unit, created_at)
             VALUES (?1, ?2, ?3, 1000, ?4, 1, 1, ?5)",
            params![Ulid::new().to_string(), variant_id, params.base_unit_id, params.barcode.as_deref().map(|b| b.trim()), now_str],
        )
        .map_err(|e| PosError::Db(format!("Failed to link base unit to variant: {}", e)))?;

        // 4. Insert Primary Barcode if provided
        if let Some(barcode) = &params.barcode {
            let trimmed_barcode = barcode.trim();
            if !trimmed_barcode.is_empty() {
                conn.execute(
                    "INSERT INTO barcodes (id, variant_id, value, kind, created_at)
                     VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
                    params![Ulid::new().to_string(), variant_id, trimmed_barcode, now_str],
                )
                .map_err(|e| PosError::Db(format!("Failed to insert barcode: {}", e)))?;
            }
        }

        // 5. Insert Retail Price
        conn.execute(
            "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
             VALUES (?1, 'retail', ?2, ?3, ?4, ?5)",
            params![Ulid::new().to_string(), variant_id, params.base_unit_id, params.retail_price_paisa, now_str],
        )
        .map_err(|e| PosError::Db(format!("Failed to insert retail price: {}", e)))?;

        // 6. Insert Wholesale Price if provided
        if let Some(wholesale_price) = params.wholesale_price_paisa {
            conn.execute(
                "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
                 VALUES (?1, 'wholesale', ?2, ?3, ?4, ?5)",
                params![Ulid::new().to_string(), variant_id, params.base_unit_id, wholesale_price, now_str],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert wholesale price: {}", e)))?;
        }

        // 7. Insert Packaging Units
        for pkg in &params.packaging_units {
            let pkg_unit_id = Ulid::new().to_string();
            conn.execute(
                "INSERT INTO variant_units (id, variant_id, unit_id, factor_to_base, barcode, is_sale_unit, is_purchase_unit, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6)",
                params![
                    pkg_unit_id,
                    variant_id,
                    pkg.unit_id,
                    pkg.factor_to_base,
                    pkg.barcode.as_deref().map(|b| b.trim()),
                    now_str
                ],
            )
            .map_err(|e| PosError::Db(format!("Failed to insert packaging unit: {}", e)))?;

            if let Some(pkg_barcode) = &pkg.barcode {
                let trimmed_pkg_bc = pkg_barcode.trim();
                if !trimmed_pkg_bc.is_empty() {
                    conn.execute(
                        "INSERT OR IGNORE INTO barcodes (id, variant_id, value, kind, created_at)
                         VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
                        params![Ulid::new().to_string(), variant_id, trimmed_pkg_bc, now_str],
                    )
                    .map_err(|e| PosError::Db(format!("Failed to insert packaging barcode: {}", e)))?;
                }
            }

            if let Some(pkg_price) = pkg.retail_price_paisa {
                conn.execute(
                    "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
                     VALUES (?1, 'retail', ?2, ?3, ?4, ?5)",
                    params![Ulid::new().to_string(), variant_id, pkg.unit_id, pkg_price, now_str],
                )
                .map_err(|e| PosError::Db(format!("Failed to insert packaging price: {}", e)))?;
            }
        }

        Self::get_by_id(conn, &product_id)?
            .ok_or_else(|| PosError::Db("Product created but could not be re-queried".into()))
    }

    /// Looks up a product by exact internal ID
    pub fn get_by_id(conn: &Connection, id: &str) -> Result<Option<ProductSearchResult>> {
        let sql = format!("{} WHERE p.id = ?1 LIMIT 1", Self::BASE_SEARCH_SELECT);
        let mut stmt = conn.prepare(&sql).map_err(|e| PosError::Db(e.to_string()))?;
        let mut rows = stmt
            .query_map(params![id], Self::map_search_row)
            .map_err(|e| PosError::Db(e.to_string()))?;

        match rows.next() {
            Some(res) => Ok(Some(res.map_err(|e| PosError::Db(e.to_string()))?)),
            None => Ok(None),
        }
    }

    /// Fetches full product details including all editable fields and usage statistics.
    pub fn get_detail(conn: &Connection, product_id: &str) -> Result<Option<ProductDetail>> {
        let sql = "
            SELECT 
                p.id,
                pv.id,
                p.sku,
                p.name,
                p.name_ur,
                p.category_id,
                c.name as category_name,
                p.brand_id,
                b.name as brand_name,
                p.base_unit_id,
                u.code as base_unit_code,
                u.name as base_unit_name,
                (SELECT value FROM barcodes WHERE variant_id = pv.id AND kind = 'manufacturer' LIMIT 1) as barcode,
                COALESCE((SELECT price_paisa FROM prices WHERE variant_id = pv.id AND unit_id = p.base_unit_id AND price_list_id = 'retail' LIMIT 1), 0) as retail_price_paisa,
                (SELECT price_paisa FROM prices WHERE variant_id = pv.id AND unit_id = p.base_unit_id AND price_list_id = 'wholesale' LIMIT 1) as wholesale_price_paisa,
                p.tax_rate_id,
                p.reorder_level_milli,
                p.is_service,
                p.track_mode,
                p.active,
                COALESCE((SELECT on_hand_milli FROM inventory_balances WHERE variant_id = pv.id LIMIT 1), 0) as on_hand_milli,
                COALESCE((SELECT COUNT(*) FROM stock_movements WHERE variant_id = pv.id), 0) as movement_count,
                COALESCE((SELECT COUNT(*) FROM sale_lines WHERE variant_id = pv.id), 0) as sale_count,
                COALESCE((SELECT COUNT(*) FROM purchase_lines WHERE variant_id = pv.id), 0) as purchase_count,
                COALESCE((SELECT COUNT(*) FROM product_serials WHERE variant_id = pv.id), 0) as serial_count
            FROM products p
            JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = 1
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN units u ON u.id = p.base_unit_id
            WHERE p.id = ?1 LIMIT 1
        ";

        let mut stmt = conn.prepare(sql).map_err(|e| PosError::Db(e.to_string()))?;
        let row = stmt
            .query_row(params![product_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, Option<String>>(7)?,
                    r.get::<_, Option<String>>(8)?,
                    r.get::<_, String>(9)?,
                    r.get::<_, String>(10)?,
                    r.get::<_, String>(11)?,
                    r.get::<_, Option<String>>(12)?,
                    r.get::<_, i64>(13)?,
                    r.get::<_, Option<i64>>(14)?,
                    r.get::<_, Option<String>>(15)?,
                    r.get::<_, i64>(16)?,
                    r.get::<_, i64>(17)? != 0,
                    r.get::<_, String>(18)?,
                    r.get::<_, i64>(19)? != 0,
                    r.get::<_, i64>(20)?,
                    r.get::<_, i64>(21)? > 0,
                    r.get::<_, i64>(22)? > 0,
                    r.get::<_, i64>(23)? > 0,
                    r.get::<_, i64>(24)?,
                ))
            })
            .optional()?;

        let (
            product_id,
            variant_id,
            sku,
            name,
            name_ur,
            category_id,
            category_name,
            brand_id,
            brand_name,
            base_unit_id,
            base_unit_code,
            base_unit_name,
            barcode,
            retail_price_paisa,
            wholesale_price_paisa,
            tax_rate_id,
            reorder_level_milli,
            is_service,
            track_mode,
            active,
            on_hand_milli,
            has_movements,
            has_sales,
            has_purchases,
            serial_count,
        ) = match row {
            Some(v) => v,
            None => return Ok(None),
        };

        // Query packaging unit
        let pkg_sql = "
            SELECT vu.unit_id, u.code, u.name, vu.factor_to_base, vu.barcode,
                   (SELECT price_paisa FROM prices WHERE variant_id = vu.variant_id AND unit_id = vu.unit_id AND price_list_id = 'retail' LIMIT 1) as price_paisa
            FROM variant_units vu
            JOIN units u ON u.id = vu.unit_id
            WHERE vu.variant_id = ?1 AND vu.factor_to_base != 1000
            LIMIT 1
        ";
        let mut pkg_stmt = conn.prepare(pkg_sql).map_err(|e| PosError::Db(e.to_string()))?;
        let packaging_unit = pkg_stmt
            .query_row(params![variant_id], |r| {
                Ok(PackagingUnitDetail {
                    unit_id: r.get(0)?,
                    unit_code: r.get(1)?,
                    unit_name: r.get(2)?,
                    factor_to_base: r.get(3)?,
                    barcode: r.get(4)?,
                    retail_price_paisa: r.get(5)?,
                })
            })
            .optional()?;

        let final_barcode = barcode.or_else(|| {
            conn.query_row(
                "SELECT value FROM barcodes WHERE variant_id = ?1 LIMIT 1",
                params![variant_id],
                |r| r.get(0),
            )
            .ok()
        });

        Ok(Some(ProductDetail {
            product_id,
            variant_id,
            sku,
            name,
            name_ur,
            category_id,
            category_name,
            brand_id,
            brand_name,
            base_unit_id,
            base_unit_code,
            base_unit_name,
            barcode: final_barcode,
            retail_price_paisa,
            wholesale_price_paisa,
            packaging_unit,
            tax_rate_id,
            reorder_level_milli,
            is_service,
            track_mode,
            active,
            on_hand_milli,
            has_movements,
            has_sales,
            has_purchases,
            serial_count,
        }))
    }

    /// Fast lookup by exact barcode (sub-5ms)
    pub fn get_by_barcode(conn: &Connection, barcode: &str) -> Result<Option<ProductSearchResult>> {
        let trimmed = barcode.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let sql = format!(
            "{} WHERE pv.id = (SELECT variant_id FROM barcodes WHERE value = ?1 LIMIT 1) LIMIT 1",
            Self::BASE_SEARCH_SELECT
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| PosError::Db(e.to_string()))?;
        let mut rows = stmt
            .query_map(params![trimmed], Self::map_search_row)
            .map_err(|e| PosError::Db(e.to_string()))?;

        match rows.next() {
            Some(res) => Ok(Some(res.map_err(|e| PosError::Db(e.to_string()))?)),
            None => Ok(None),
        }
    }

    /// Fast lookup by exact SKU (sub-5ms)
    pub fn get_by_sku(conn: &Connection, sku: &str) -> Result<Option<ProductSearchResult>> {
        let trimmed = sku.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }

        let sql = format!("{} WHERE p.sku = ?1 LIMIT 1", Self::BASE_SEARCH_SELECT);
        let mut stmt = conn.prepare(&sql).map_err(|e| PosError::Db(e.to_string()))?;
        let mut rows = stmt
            .query_map(params![trimmed], Self::map_search_row)
            .map_err(|e| PosError::Db(e.to_string()))?;

        match rows.next() {
            Some(res) => Ok(Some(res.map_err(|e| PosError::Db(e.to_string()))?)),
            None => Ok(None),
        }
    }

    /// Sub-50ms bilingual search matching barcode, SKU, English name, or Urdu name
    pub fn search(conn: &Connection, query: &str, limit: usize) -> Result<Vec<ProductSearchResult>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Self::list_products(conn, limit, 0);
        }

        // Direct barcode or SKU match shortcut
        if let Some(by_barcode) = Self::get_by_barcode(conn, trimmed)? {
            return Ok(vec![by_barcode]);
        }
        if let Some(by_sku) = Self::get_by_sku(conn, trimmed)? {
            return Ok(vec![by_sku]);
        }

        let pattern = format!("%{}%", trimmed);
        let sql = format!(
            "{} WHERE p.name LIKE ?1 OR p.name_ur LIKE ?1 OR p.sku LIKE ?1 ORDER BY p.name ASC LIMIT ?2",
            Self::BASE_SEARCH_SELECT
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| PosError::Db(e.to_string()))?;
        let rows = stmt
            .query_map(params![pattern, limit as i64], Self::map_search_row)
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(results)
    }

    /// Lists products with pagination
    pub fn list_products(conn: &Connection, limit: usize, offset: usize) -> Result<Vec<ProductSearchResult>> {
        let sql = format!(
            "{} ORDER BY p.created_at DESC LIMIT ?1 OFFSET ?2",
            Self::BASE_SEARCH_SELECT
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| PosError::Db(e.to_string()))?;
        let rows = stmt
            .query_map(params![limit as i64, offset as i64], Self::map_search_row)
            .map_err(|e| PosError::Db(e.to_string()))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| PosError::Db(e.to_string()))?);
        }
        Ok(results)
    }

    /// Converts quantity from a packaging unit to base units using factor_to_base
    /// e.g. 2 Cartons with factor_to_base = 24000 (24 pcs) -> 48 base pieces
    pub fn convert_to_base_qty(packaging_qty: Qty, factor_to_base: i64) -> Qty {
        // factor_to_base is in milli-units (1000 = 1.000)
        let total_milli = (packaging_qty.0 * factor_to_base) / 1000;
        Qty(total_milli)
    }

    /// Converts base quantity into packaging unit quantity
    pub fn convert_from_base_qty(base_qty: Qty, factor_to_base: i64) -> Qty {
        if factor_to_base == 0 {
            return base_qty;
        }
        let total_milli = (base_qty.0 * 1000) / factor_to_base;
        Qty(total_milli)
    }
}
