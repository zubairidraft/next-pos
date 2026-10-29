use crate::domain::{BrandRepo, CategoryRepo, UnitRepo};
use crate::error::{PosError, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;
use std::time::Instant;
use ulid::Ulid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRow {
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category: Option<String>,
    pub brand: Option<String>,
    pub unit: Option<String>,
    pub barcode: Option<String>,
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRowError {
    pub row: usize,
    pub sku: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub total_rows: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<ImportRowError>,
    pub duration_ms: u128,
}

pub struct CatalogImporter;

impl CatalogImporter {
    /// Imports a batch of pre-parsed `ImportRow` records into SQLite with high-speed chunked transactions
    pub fn import_rows(conn: &mut Connection, rows: Vec<ImportRow>) -> Result<ImportSummary> {
        let start_time = Instant::now();
        let total_rows = rows.len();
        let mut imported = 0;
        let mut skipped = 0;
        let mut errors = Vec::new();

        if rows.is_empty() {
            return Ok(ImportSummary {
                total_rows: 0,
                imported: 0,
                skipped: 0,
                errors: Vec::new(),
                duration_ms: start_time.elapsed().as_millis(),
            });
        }

        // Temporary pragmas for import throughput
        let _ = conn.execute_batch(
            "PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA temp_store = MEMORY;",
        );

        // Pre-load existing SKUs into memory
        let mut existing_skus: HashSet<String> = HashSet::new();
        {
            let mut stmt = conn
                .prepare("SELECT sku FROM products")
                .map_err(|e| PosError::Db(e.to_string()))?;
            let mut sku_rows = stmt.query([]).map_err(|e| PosError::Db(e.to_string()))?;
            while let Some(row) = sku_rows.next().map_err(|e| PosError::Db(e.to_string()))? {
                let s: String = row.get(0).map_err(|e| PosError::Db(e.to_string()))?;
                existing_skus.insert(s.to_uppercase());
            }
        }

        // Pre-load existing Barcodes into memory
        let mut existing_barcodes: HashSet<String> = HashSet::new();
        {
            let mut stmt = conn
                .prepare("SELECT value FROM barcodes")
                .map_err(|e| PosError::Db(e.to_string()))?;
            let mut bc_rows = stmt.query([]).map_err(|e| PosError::Db(e.to_string()))?;
            while let Some(row) = bc_rows.next().map_err(|e| PosError::Db(e.to_string()))? {
                let b: String = row.get(0).map_err(|e| PosError::Db(e.to_string()))?;
                existing_barcodes.insert(b.trim().to_string());
            }
        }

        // In-memory cache for Units (code -> id)
        let mut unit_cache: HashMap<String, String> = HashMap::new();
        {
            let units = UnitRepo::list(conn)?;
            for u in units {
                unit_cache.insert(u.code.to_lowercase(), u.id);
            }
            if !unit_cache.contains_key("pc") {
                let default_unit = UnitRepo::create(conn, "pc", "Piece", 0)?;
                unit_cache.insert("pc".into(), default_unit.id);
            }
        }
        let default_unit_id = unit_cache
            .get("pc")
            .cloned()
            .unwrap_or_else(|| "default_unit".into());

        // In-memory cache for Categories (name -> id)
        let mut category_cache: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT id, name FROM categories")
                .map_err(|e| PosError::Db(e.to_string()))?;
            let mut cat_rows = stmt.query([]).map_err(|e| PosError::Db(e.to_string()))?;
            while let Some(row) = cat_rows.next().map_err(|e| PosError::Db(e.to_string()))? {
                let id: String = row.get(0).map_err(|e| PosError::Db(e.to_string()))?;
                let name: String = row.get(1).map_err(|e| PosError::Db(e.to_string()))?;
                category_cache.insert(name.trim().to_lowercase(), id);
            }
        }

        // In-memory cache for Brands (name -> id)
        let mut brand_cache: HashMap<String, String> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT id, name FROM brands")
                .map_err(|e| PosError::Db(e.to_string()))?;
            let mut b_rows = stmt.query([]).map_err(|e| PosError::Db(e.to_string()))?;
            while let Some(row) = b_rows.next().map_err(|e| PosError::Db(e.to_string()))? {
                let id: String = row.get(0).map_err(|e| PosError::Db(e.to_string()))?;
                let name: String = row.get(1).map_err(|e| PosError::Db(e.to_string()))?;
                brand_cache.insert(name.trim().to_lowercase(), id);
            }
        }

        // Process in chunks of 5,000 items per SQLite transaction
        const CHUNK_SIZE: usize = 5000;
        for chunk in rows.chunks(CHUNK_SIZE) {
            let tx = conn
                .transaction()
                .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

            {
                let mut insert_product = tx
                    .prepare(
                        "INSERT INTO products (
                            id, sku, name, name_ur, category_id, brand_id, base_unit_id,
                            track_mode, has_variants, reorder_level_milli, active, created_at, updated_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'none', 0, 0, 1, ?8, ?8)",
                    )
                    .map_err(|e| PosError::Db(e.to_string()))?;

                let mut insert_variant = tx
                    .prepare(
                        "INSERT INTO product_variants (id, product_id, attributes_json, sku, is_default, created_at)
                         VALUES (?1, ?2, '{}', ?3, 1, ?4)",
                    )
                    .map_err(|e| PosError::Db(e.to_string()))?;

                let mut insert_variant_unit = tx
                    .prepare(
                        "INSERT INTO variant_units (id, variant_id, unit_id, factor_to_base, barcode, is_sale_unit, is_purchase_unit, created_at)
                         VALUES (?1, ?2, ?3, 1000, ?4, 1, 1, ?5)",
                    )
                    .map_err(|e| PosError::Db(e.to_string()))?;

                let mut insert_barcode = tx
                    .prepare(
                        "INSERT INTO barcodes (id, variant_id, value, kind, created_at)
                         VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
                    )
                    .map_err(|e| PosError::Db(e.to_string()))?;

                let mut insert_price = tx
                    .prepare(
                        "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    )
                    .map_err(|e| PosError::Db(e.to_string()))?;

                let now_str = Utc::now().to_rfc3339();

                for (_idx_in_chunk, row) in chunk.iter().enumerate() {
                    let row_idx = imported + skipped + errors.len() + 1;
                    let trimmed_sku = row.sku.trim();
                    let trimmed_name = row.name.trim();

                    if trimmed_sku.is_empty() {
                        errors.push(ImportRowError {
                            row: row_idx,
                            sku: "".into(),
                            message: "SKU cannot be empty".into(),
                        });
                        skipped += 1;
                        continue;
                    }

                    if trimmed_name.is_empty() {
                        errors.push(ImportRowError {
                            row: row_idx,
                            sku: trimmed_sku.into(),
                            message: "Product name cannot be empty".into(),
                        });
                        skipped += 1;
                        continue;
                    }

                    let upper_sku = trimmed_sku.to_uppercase();
                    if existing_skus.contains(&upper_sku) {
                        errors.push(ImportRowError {
                            row: row_idx,
                            sku: trimmed_sku.into(),
                            message: format!("Duplicate SKU '{}'", trimmed_sku),
                        });
                        skipped += 1;
                        continue;
                    }

                    // Barcode duplicate check
                    let trimmed_bc = row.barcode.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
                    if let Some(bc) = trimmed_bc {
                        if existing_barcodes.contains(bc) {
                            errors.push(ImportRowError {
                                row: row_idx,
                                sku: trimmed_sku.into(),
                                message: format!("Duplicate barcode '{}'", bc),
                            });
                            skipped += 1;
                            continue;
                        }
                    }

                    // Resolve category ID
                    let category_id = if let Some(cat_name) = &row.category {
                        let trimmed_cat = cat_name.trim();
                        if trimmed_cat.is_empty() {
                            None
                        } else {
                            let key = trimmed_cat.to_lowercase();
                            if let Some(id) = category_cache.get(&key) {
                                Some(id.clone())
                            } else {
                                let new_cat = CategoryRepo::create(&tx, trimmed_cat, None, None)?;
                                category_cache.insert(key, new_cat.id.clone());
                                Some(new_cat.id)
                            }
                        }
                    } else {
                        None
                    };

                    // Resolve brand ID
                    let brand_id = if let Some(b_name) = &row.brand {
                        let trimmed_b = b_name.trim();
                        if trimmed_b.is_empty() {
                            None
                        } else {
                            let key = trimmed_b.to_lowercase();
                            if let Some(id) = brand_cache.get(&key) {
                                Some(id.clone())
                            } else {
                                let new_b = BrandRepo::create(&tx, trimmed_b, None)?;
                                brand_cache.insert(key, new_b.id.clone());
                                Some(new_b.id)
                            }
                        }
                    } else {
                        None
                    };

                    // Resolve unit ID
                    let unit_id = if let Some(u_name) = &row.unit {
                        let trimmed_u = u_name.trim().to_lowercase();
                        unit_cache.get(&trimmed_u).cloned().unwrap_or_else(|| default_unit_id.clone())
                    } else {
                        default_unit_id.clone()
                    };

                    let product_id = Ulid::new().to_string();
                    let variant_id = Ulid::new().to_string();

                    // 1. Insert product
                    insert_product
                        .execute(params![
                            product_id,
                            trimmed_sku,
                            trimmed_name,
                            row.name_ur.as_deref().map(|s| s.trim()),
                            category_id,
                            brand_id,
                            unit_id,
                            now_str
                        ])
                        .map_err(|e| PosError::Db(format!("Failed to insert product row: {}", e)))?;

                    // 2. Insert variant
                    insert_variant
                        .execute(params![variant_id, product_id, trimmed_sku, now_str])
                        .map_err(|e| PosError::Db(format!("Failed to insert variant row: {}", e)))?;

                    // 3. Insert variant unit
                    insert_variant_unit
                        .execute(params![
                            Ulid::new().to_string(),
                            variant_id,
                            unit_id,
                            trimmed_bc,
                            now_str
                        ])
                        .map_err(|e| PosError::Db(format!("Failed to insert variant unit: {}", e)))?;

                    // 4. Insert barcode
                    if let Some(bc) = trimmed_bc {
                        insert_barcode
                            .execute(params![Ulid::new().to_string(), variant_id, bc, now_str])
                            .map_err(|e| PosError::Db(format!("Failed to insert barcode: {}", e)))?;
                        existing_barcodes.insert(bc.to_string());
                    }

                    // 5. Insert retail price
                    insert_price
                        .execute(params![
                            Ulid::new().to_string(),
                            "retail",
                            variant_id,
                            unit_id,
                            row.retail_price_paisa,
                            now_str
                        ])
                        .map_err(|e| PosError::Db(format!("Failed to insert retail price: {}", e)))?;

                    // 6. Insert wholesale price if present
                    if let Some(wp) = row.wholesale_price_paisa {
                        insert_price
                            .execute(params![
                                Ulid::new().to_string(),
                                "wholesale",
                                variant_id,
                                unit_id,
                                wp,
                                now_str
                            ])
                            .map_err(|e| PosError::Db(format!("Failed to insert wholesale price: {}", e)))?;
                    }

                    existing_skus.insert(upper_sku);
                    imported += 1;
                }
            }

            tx.commit()
                .map_err(|e| PosError::Db(format!("Failed to commit batch transaction: {}", e)))?;
        }

        Ok(ImportSummary {
            total_rows,
            imported,
            skipped,
            errors,
            duration_ms: start_time.elapsed().as_millis(),
        })
    }

    /// High-speed streaming CSV importer reading from any `std::io::Read` stream
    pub fn import_csv<R: Read>(conn: &mut Connection, reader: R) -> Result<ImportSummary> {
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(true)
            .flexible(true)
            .trim(csv::Trim::All)
            .from_reader(reader);

        let headers = rdr
            .headers()
            .map_err(|e| PosError::Validation(format!("Invalid CSV headers: {}", e)))?
            .clone();

        // Detect column positions
        let mut col_sku = None;
        let mut col_name = None;
        let mut col_name_ur = None;
        let mut col_cat = None;
        let mut col_brand = None;
        let mut col_unit = None;
        let mut col_barcode = None;
        let mut col_retail = None;
        let mut col_wholesale = None;

        for (idx, header) in headers.iter().enumerate() {
            let h = header.trim().to_lowercase();
            match h.as_str() {
                "sku" | "item_code" | "code" => col_sku = Some(idx),
                "name" | "item_name" | "title" | "description" => col_name = Some(idx),
                "name_ur" | "urdu_name" | "urdu" => col_name_ur = Some(idx),
                "category" | "category_name" => col_cat = Some(idx),
                "brand" | "brand_name" => col_brand = Some(idx),
                "unit" | "uom" => col_unit = Some(idx),
                "barcode" | "upc" | "ean" => col_barcode = Some(idx),
                "retail_price" | "price" | "mrp" | "sale_price" => col_retail = Some(idx),
                "wholesale_price" | "cost" | "trade_price" => col_wholesale = Some(idx),
                _ => {}
            }
        }

        let sku_idx = col_sku.ok_or_else(|| PosError::Validation("CSV must include a 'sku' or 'code' column".into()))?;
        let name_idx = col_name.ok_or_else(|| PosError::Validation("CSV must include a 'name' or 'title' column".into()))?;
        let retail_idx = col_retail.ok_or_else(|| PosError::Validation("CSV must include a 'retail_price' or 'price' column".into()))?;

        let mut rows = Vec::new();
        for record_res in rdr.records() {
            let record = record_res.map_err(|e| PosError::Validation(format!("CSV row parse error: {}", e)))?;
            let sku = record.get(sku_idx).unwrap_or("").trim().to_string();
            let name = record.get(name_idx).unwrap_or("").trim().to_string();
            let name_ur = col_name_ur.and_then(|i| record.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let category = col_cat.and_then(|i| record.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let brand = col_brand.and_then(|i| record.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let unit = col_unit.and_then(|i| record.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let barcode = col_barcode.and_then(|i| record.get(i)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

            let retail_str = record.get(retail_idx).unwrap_or("0").trim();
            let retail_price_paisa = parse_price_to_paisa(retail_str);

            let wholesale_price_paisa = col_wholesale
                .and_then(|i| record.get(i))
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(parse_price_to_paisa);

            rows.push(ImportRow {
                sku,
                name,
                name_ur,
                category,
                brand,
                unit,
                barcode,
                retail_price_paisa,
                wholesale_price_paisa,
            });
        }

        Self::import_rows(conn, rows)
    }

    /// Native pure-Rust Excel (.xlsx, .xls) importer
    pub fn import_excel(conn: &mut Connection, path: &Path) -> Result<ImportSummary> {
        use calamine::{open_workbook_auto, Data, Reader};

        let mut workbook = open_workbook_auto(path)
            .map_err(|e| PosError::Validation(format!("Failed to open Excel workbook: {}", e)))?;

        let sheet_names = workbook.sheet_names();
        if sheet_names.is_empty() {
            return Err(PosError::Validation("Excel file has no sheets".into()));
        }

        let first_sheet = sheet_names[0].clone();
        let range = workbook
            .worksheet_range(&first_sheet)
            .map_err(|e| PosError::Validation(format!("Failed to read Excel worksheet: {}", e)))?;

        let mut rows = Vec::new();
        let mut header_map: HashMap<String, usize> = HashMap::new();

        for (row_idx, row) in range.rows().enumerate() {
            if row_idx == 0 {
                // Parse headers
                for (col_idx, cell) in row.iter().enumerate() {
                    let h = cell.to_string().trim().to_lowercase();
                    header_map.insert(h, col_idx);
                }
                continue;
            }

            let get_cell = |keys: &[&str]| -> Option<String> {
                for key in keys {
                    if let Some(&idx) = header_map.get(*key) {
                        if let Some(cell) = row.get(idx) {
                            let text = match cell {
                                Data::String(s) => s.trim().to_string(),
                                Data::Float(f) => format!("{:.2}", f),
                                Data::Int(i) => i.to_string(),
                                _ => cell.to_string().trim().to_string(),
                            };
                            if !text.is_empty() {
                                return Some(text);
                            }
                        }
                    }
                }
                None
            };

            let sku = match get_cell(&["sku", "item_code", "code"]) {
                Some(s) => s,
                None => continue, // skip empty rows
            };

            let name = match get_cell(&["name", "item_name", "title"]) {
                Some(n) => n,
                None => continue,
            };

            let name_ur = get_cell(&["name_ur", "urdu_name", "urdu"]);
            let category = get_cell(&["category", "category_name"]);
            let brand = get_cell(&["brand", "brand_name"]);
            let unit = get_cell(&["unit", "uom"]);
            let barcode = get_cell(&["barcode", "upc", "ean"]);

            let retail_str = get_cell(&["retail_price", "price", "mrp", "sale_price"]).unwrap_or_else(|| "0".into());
            let retail_price_paisa = parse_price_to_paisa(&retail_str);

            let wholesale_price_paisa = get_cell(&["wholesale_price", "cost", "trade_price"])
                .as_deref()
                .map(parse_price_to_paisa);

            rows.push(ImportRow {
                sku,
                name,
                name_ur,
                category,
                brand,
                unit,
                barcode,
                retail_price_paisa,
                wholesale_price_paisa,
            });
        }

        Self::import_rows(conn, rows)
    }
}

/// Helper to parse price representations (e.g. "140", "140.50", "PKR 140") into Paisa integer
fn parse_price_to_paisa(price_str: &str) -> i64 {
    let cleaned: String = price_str
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();

    if cleaned.is_empty() {
        return 0;
    }

    if let Some((int_part, frac_part)) = cleaned.split_once('.') {
        let whole: i64 = int_part.parse().unwrap_or(0);
        let frac_padded = format!("{:0<2}", frac_part);
        let cents: i64 = frac_padded[..2].parse().unwrap_or(0);
        whole * 100 + cents
    } else {
        let whole: i64 = cleaned.parse().unwrap_or(0);
        whole * 100
    }
}
