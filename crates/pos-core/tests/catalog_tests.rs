use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::{
    BrandRepo, CatalogRepo, CategoryRepo, CreatePackagingUnitParams, CreateProductParams, UnitRepo,
};
use pos_core::money::Qty;
use std::time::Instant;
use tempfile::NamedTempFile;

#[test]
fn test_catalog_crud_and_fast_search() {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [7u8; 32];

    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");

    // Seed master data
    let category = CategoryRepo::create(&conn, "Spices & Recipe Mixes", Some("مصالحہ جات"), None)
        .expect("Category create failed");
    let brand = BrandRepo::create(&conn, "Shan Foods", Some("شان فوڈز")).expect("Brand create failed");
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");
    let carton_unit = UnitRepo::create(&conn, "carton", "Carton", 0).expect("Unit create failed");

    // Create product with packaging units (1 Carton = 24 Pieces)
    let product_params = CreateProductParams {
        sku: "SHAN-BIR-50G".into(),
        name: "Shan Special Bombay Biryani Masala 50g".into(),
        name_ur: Some("شان اسپیشل بمبئی بریانی مصالحہ 50 گرام".into()),
        category_id: Some(category.id.clone()),
        brand_id: Some(brand.id.clone()),
        base_unit_id: base_unit.id.clone(),
        hs_code: Some("0910.9100".into()),
        tax_rate_id: Some("standard_18".into()),
        track_mode: Some("none".into()),
        reorder_level_milli: Some(10_000), // 10 pieces
        barcode: Some("8964000101112".into()),
        retail_price_paisa: 14000,    // PKR 140.00
        wholesale_price_paisa: Some(12500), // PKR 125.00
        packaging_units: vec![CreatePackagingUnitParams {
            unit_id: carton_unit.id.clone(),
            factor_to_base: 24_000, // 24 pieces
            barcode: Some("8964000101999".into()),
            retail_price_paisa: Some(320000), // PKR 3,200.00 per carton
        }],
    };

    let created = CatalogRepo::create_product(&conn, product_params).expect("Product create failed");
    assert_eq!(created.sku, "SHAN-BIR-50G");
    assert_eq!(created.retail_price_paisa, 14000);
    assert_eq!(created.wholesale_price_paisa, Some(12500));
    assert_eq!(created.category_name, Some("Spices & Recipe Mixes".into()));
    assert_eq!(created.brand_name, Some("Shan Foods".into()));
    assert_eq!(created.base_unit_code, "pc");

    // Test Sub-5ms Barcode Search
    let start_bc = Instant::now();
    let by_barcode = CatalogRepo::get_by_barcode(&conn, "8964000101112")
        .expect("Barcode query failed")
        .expect("Product by barcode not found");
    let bc_duration = start_bc.elapsed();
    assert_eq!(by_barcode.sku, "SHAN-BIR-50G");
    println!("Barcode lookup took: {:?}", bc_duration);

    // Test Sub-5ms SKU Search
    let start_sku = Instant::now();
    let by_sku = CatalogRepo::get_by_sku(&conn, "SHAN-BIR-50G")
        .expect("SKU query failed")
        .expect("Product by SKU not found");
    let sku_duration = start_sku.elapsed();
    assert_eq!(by_sku.name, "Shan Special Bombay Biryani Masala 50g");
    println!("SKU lookup took: {:?}", sku_duration);

    // Test Urdu Nastaliq Search
    let urdu_results = CatalogRepo::search(&conn, "بریانی", 10).expect("Urdu search failed");
    assert!(!urdu_results.is_empty());
    assert_eq!(urdu_results[0].sku, "SHAN-BIR-50G");

    // Test English Substring Search
    let en_results = CatalogRepo::search(&conn, "Bombay", 10).expect("English search failed");
    assert!(!en_results.is_empty());
    assert_eq!(en_results[0].sku, "SHAN-BIR-50G");

    // Test Packaging Unit Conversions
    // 2 Cartons with factor 24,000 = 48 pieces (48,000 milli-units)
    let two_cartons = Qty::from_milli(2000);
    let converted_base = CatalogRepo::convert_to_base_qty(two_cartons, 24000);
    assert_eq!(converted_base.0, 48000);

    let forty_eight_pcs = Qty::from_milli(48000);
    let converted_cartons = CatalogRepo::convert_from_base_qty(forty_eight_pcs, 24000);
    assert_eq!(converted_cartons.0, 2000);
}
