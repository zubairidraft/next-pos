use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::{
    CatalogRepo, CreateProductParams, PaymentTenderInput, PostSaleLineInput, PostSaleRequest,
    SaleRepo, ShiftRepo, UnitRepo,
};
use rusqlite::params;
use tempfile::NamedTempFile;
use ulid::Ulid;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [21u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_shift_lifecycle_and_z_report() {
    let (mut conn, _file) = setup_test_db();
    let user_id = Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // 1. User
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?1, 'cashier1', 'hash', ?2, ?2)",
        params![user_id, now],
    )
    .unwrap();

    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create");

    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "TEST-SKU-01".to_string(),
            name: "Test Product".to_string(),
            name_ur: Some("ٹیسٹ پروڈکٹ".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8961011001111".to_string()),
            retail_price_paisa: 85000,
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    )
    .expect("Create product");

    let variant_id = product.variant_id;
    let unit_id = base_unit.id;

    // Seed stock: 10 units @ 50,000 Paisa cost
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: 10000,
            movement_type: "purchase".to_string(),
            source_doc: "PUR-SHIFT-01".to_string(),
            source_line: None,
            unit_cost_paisa: 50000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Record movement");

    // 1. Start Shift with 1,000 PKR (100,000 Paisa) opening float
    let session = ShiftRepo::start_shift(&mut conn, &user_id, 100000).expect("failed to start shift");
    assert_eq!(session.status, "open");
    assert_eq!(session.opening_float_paisa, 100000);

    // Verify cannot start a second open shift for same cashier
    let err = ShiftRepo::start_shift(&mut conn, &user_id, 50000);
    assert!(err.is_err(), "Must prevent opening duplicate concurrent shifts");

    // 2. Post a cash sale within this shift
    let sale_req = PostSaleRequest {
        customer_id: None,
        cash_session_id: Some(session.id.clone()),
        lines: vec![PostSaleLineInput {
            variant_id: variant_id.clone(),
            unit_id: unit_id.clone(),
            qty_milli: 2000, // 2 units
            unit_price_paisa: 85000, // 850 PKR
            discount_paisa: 0,
            tax_paisa: 0,
        }],
        global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput {
            method: "cash".to_string(),
            amount_paisa: 170000, // 1,700 PKR
            reference: None,
        }],
        user_id: Some(user_id.clone()),
    };
    let completed_sale = SaleRepo::post_sale(&mut conn, sale_req).expect("failed to post sale");
    assert_eq!(completed_sale.total_paisa, 170000);

    // 3. Record a cash drop (petty cash expense: 200 PKR / 20,000 Paisa for chai/water)
    ShiftRepo::record_cash_drop(&mut conn, &session.id, 20000, "Afternoon Tea for Staff")
        .expect("failed to record cash drop");

    // 4. Query active session expected cash: 1000 + 1700 - 200 = 2500 PKR (250,000 Paisa)
    let active = ShiftRepo::get_active_session(&conn, &user_id)
        .expect("failed to query active session")
        .expect("active session should be present");
    assert_eq!(active.expected_cash_paisa, 250000);

    // 5. Close shift with physical count: 250,000 Paisa (Exact match)
    let z_report = ShiftRepo::close_shift(&mut conn, &session.id, 250000)
        .expect("failed to close shift and generate Z report");

    assert_eq!(z_report.opening_float_paisa, 100000);
    assert_eq!(z_report.gross_sales_paisa, 170000);
    assert_eq!(z_report.net_sales_paisa, 170000);
    assert_eq!(z_report.tender_cash_paisa, 170000);
    assert_eq!(z_report.cash_drops_paisa, 20000);
    assert_eq!(z_report.expected_cash_paisa, 250000);
    assert_eq!(z_report.counted_cash_paisa, 250000);
    assert_eq!(z_report.variance_paisa, 0);
    assert_eq!(z_report.sales_count, 1);
}
