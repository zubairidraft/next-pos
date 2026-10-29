use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::analytics::AnalyticsRepo;
use pos_core::domain::brand::BrandRepo;
use pos_core::domain::catalog::{CatalogRepo, CreateProductParams};
use pos_core::domain::category::CategoryRepo;
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::sale::{PaymentTenderInput, PostSaleLineInput, PostSaleRequest, SaleRepo};
use pos_core::domain::unit::UnitRepo;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [31u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_financial_summary_and_category_performance() {
    let (mut conn, _file) = setup_test_db();

    // Setup master data
    let unit = UnitRepo::create(&conn, "PCS", "Pieces", 0).expect("unit");
    let cat1 = CategoryRepo::create(&conn, "Dairy", Some("ڈیری"), None).expect("cat1");
    let cat2 = CategoryRepo::create(&conn, "Bakery", Some("بیکری"), None).expect("cat2");
    let brand = BrandRepo::create(&conn, "Olpers", Some("اولپرز")).expect("brand");

    // Insert user
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES ('usr-1', 'admin', 'hash', '2026-10-29T00:00:00Z', '2026-10-29T00:00:00Z')",
        [],
    ).unwrap();

    // Create 2 products
    let p1 = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            category_id: Some(cat1.id.clone()),
            brand_id: Some(brand.id.clone()),
            sku: "DAIRY-001".to_string(),
            barcode: Some("111222333".to_string()),
            name: "Olpers Milk 1L".to_string(),
            name_ur: Some("اولپرز دودھ ۱ لٹر".to_string()),
            base_unit_id: unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: Some(5000),
            retail_price_paisa: 30000, // PKR 300
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    ).expect("p1");

    let p2 = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            category_id: Some(cat2.id.clone()),
            brand_id: None,
            sku: "BAKE-001".to_string(),
            barcode: Some("444555666".to_string()),
            name: "Dawn Bread Large".to_string(),
            name_ur: Some("ڈان ڈبل روٹی".to_string()),
            base_unit_id: unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: Some(2000),
            retail_price_paisa: 16000, // PKR 160
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    ).expect("p2");

    // Seed stock movement for initial inventory
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: p1.variant_id.clone(),
            qty_signed_milli: 50_000, // 50 units
            movement_type: "purchase".to_string(),
            source_doc: "INIT-01".to_string(),
            source_line: None,
            unit_cost_paisa: 25000, // PKR 250
            batch_id: None,
            serial_id: None,
            user_id: Some("usr-1".to_string()),
        },
    ).expect("movement p1");

    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: p2.variant_id.clone(),
            qty_signed_milli: 30_000, // 30 units
            movement_type: "purchase".to_string(),
            source_doc: "INIT-02".to_string(),
            source_line: None,
            unit_cost_paisa: 12000, // PKR 120
            batch_id: None,
            serial_id: None,
            user_id: Some("usr-1".to_string()),
        },
    ).expect("movement p2");

    // Post Sale 1: 2x Milk + 1x Bread
    // Milk: 2 * 300 = 600. COGS: 2 * 250 = 500
    // Bread: 1 * 160 = 160. COGS: 1 * 120 = 120
    // Total subtotal: 760 (76,000 Paisa), Discount: 0, Total: 76,000 Paisa. COGS: 620 (62,000 Paisa)
    let s1 = SaleRepo::post_sale(
        &mut conn,
        PostSaleRequest {
            customer_id: None,
            cash_session_id: None,
            lines: vec![
                PostSaleLineInput {
                    variant_id: p1.variant_id.clone(),
                    unit_id: unit.id.clone(),
                    qty_milli: 2000,
                    unit_price_paisa: 30000,
                    discount_paisa: 0,
                    tax_paisa: 0,
                },
                PostSaleLineInput {
                    variant_id: p2.variant_id.clone(),
                    unit_id: unit.id.clone(),
                    qty_milli: 1000,
                    unit_price_paisa: 16000,
                    discount_paisa: 0,
                    tax_paisa: 0,
                },
            ],
            global_discount_paisa: 0,
            tenders: vec![PaymentTenderInput {
                method: "cash".to_string(),
                amount_paisa: 76000,
                reference: None,
            }],
            user_id: Some("usr-1".to_string()),
        },
    ).expect("post sale");
    assert_eq!(s1.total_paisa, 76000);

    // Query Financial Summary
    let summary = AnalyticsRepo::get_financial_summary(&conn, "2026-01-01", "2026-12-31")
        .expect("financial summary");
    assert_eq!(summary.sales_count, 1);
    assert_eq!(summary.gross_sales_paisa, 76000);
    assert_eq!(summary.net_sales_paisa, 76000);
    assert_eq!(summary.cogs_paisa, 62000);
    assert_eq!(summary.gross_profit_paisa, 14000); // 760 - 620 = 140 PKR
    assert_eq!(summary.total_units_sold_milli, 3000);

    // Query Category Performance
    let cat_perf = AnalyticsRepo::get_category_performance(&conn, "2026-01-01", "2026-12-31")
        .expect("category performance");
    assert_eq!(cat_perf.len(), 2);
    let dairy = cat_perf.iter().find(|c| c.category_name == "Dairy").unwrap();
    assert_eq!(dairy.revenue_paisa, 60000);
    assert_eq!(dairy.cogs_paisa, 50000);
    assert_eq!(dairy.gross_profit_paisa, 10000);

    // Query Top Products
    let top = AnalyticsRepo::get_top_products(&conn, "2026-01-01", "2026-12-31", 5)
        .expect("top products");
    assert_eq!(top.len(), 2);
    assert_eq!(top[0].sku, "DAIRY-001");
    assert_eq!(top[0].qty_sold_milli, 2000);

    // Query Inventory Valuation
    let valuation = AnalyticsRepo::get_inventory_valuation(&conn).expect("valuation");
    assert_eq!(valuation.total_variants_count, 2);
    assert_eq!(valuation.total_stock_milli, 77000);
    assert_eq!(valuation.total_cost_valuation_paisa, 1548000);
    assert_eq!(valuation.total_retail_valuation_paisa, 1904000);
    assert_eq!(valuation.potential_profit_paisa, 356000);
}
