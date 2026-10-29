use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::apparel::{ApparelMatrixInput, ApparelMatrixService};
use pos_core::domain::electronics::{ElectronicsRepo, SerialStatus};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [25u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_electronics_imei_lifecycle() {
    let (conn, _file) = setup_test_db();

    // Insert dummy product & variant for foreign key reference
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u1', 'PCS', 'Pieces', 0, '2026-10-29T00:00:00Z')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO products (id, sku, name, base_unit_id, active, created_at, updated_at) 
         VALUES ('p1', 'IPHONE-15', 'iPhone 15 128GB', 'u1', 1, '2026-10-29T00:00:00Z', '2026-10-29T00:00:00Z')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO product_variants (id, product_id, sku, is_default, created_at)
         VALUES ('var-iphone', 'p1', 'IPHONE-15-BLK', 1, '2026-10-29T00:00:00Z')",
        [],
    ).unwrap();

    let imei1 = "356891092837461";

    // 1. Inbound receiving: register serial
    let serial_record = ElectronicsRepo::register_serial(
        &conn,
        "var-iphone",
        imei1,
        Some("PUR-2026-0091"),
        12, // 12 months warranty
    ).expect("register serial");

    assert_eq!(serial_record.status, SerialStatus::InStock);
    assert_eq!(serial_record.warranty_months, 12);

    // 2. Duplicate registration while in_stock must fail
    let duplicate_res = ElectronicsRepo::register_serial(
        &conn,
        "var-iphone",
        imei1,
        Some("PUR-2026-0092"),
        12,
    );
    assert!(duplicate_res.is_err(), "Duplicate active serial must fail");

    // 3. Validate serial availability
    let is_avail = ElectronicsRepo::validate_serial_available(&conn, "var-iphone", imei1)
        .expect("validate");
    assert!(is_avail);

    let is_not_avail = ElectronicsRepo::validate_serial_available(&conn, "var-iphone", "999999999999999")
        .expect("validate non-existent");
    assert!(!is_not_avail);

    // 4. Mark serial as sold on checkout
    ElectronicsRepo::mark_serial_sold(&conn, "var-iphone", imei1, "INV-202610-0088")
        .expect("mark sold");

    // Once sold, it should no longer be in stock
    let in_stock_after = ElectronicsRepo::validate_serial_available(&conn, "var-iphone", imei1)
        .expect("validate after sale");
    assert!(!in_stock_after);

    // Listing in-stock serials should return empty
    let list = ElectronicsRepo::list_in_stock_serials(&conn, "var-iphone").expect("list");
    assert!(list.is_empty());
}

#[test]
fn test_apparel_matrix_variant_generator() {
    let input = ApparelMatrixInput {
        parent_style_name: "Men Cotton Polo Shirt".to_string(),
        parent_style_name_ur: Some("مردانہ کاٹن پولو شرٹ".to_string()),
        base_sku: "POLO-COT".to_string(),
        sizes: vec!["M".to_string(), "L".to_string(), "XL".to_string()],
        colors: vec!["Navy".to_string(), "Black".to_string()],
        cost_price_paisa: 120000,   // PKR 1,200
        retail_price_paisa: 220000, // PKR 2,200
    };

    let variants = ApparelMatrixService::generate_matrix(&input);
    // 3 sizes * 2 colors = 6 variants
    assert_eq!(variants.len(), 6);

    let v0 = &variants[0];
    assert_eq!(v0.sku, "POLO-COT-NAVY-M");
    assert_eq!(v0.name_en, "Men Cotton Polo Shirt (Navy / M)");
    assert_eq!(v0.name_ur, Some("مردانہ کاٹن پولو شرٹ (Navy / M)".to_string()));
    assert!(v0.barcode.starts_with("896"));
    assert_eq!(v0.cost_price_paisa, 120000);
    assert_eq!(v0.retail_price_paisa, 220000);
}
