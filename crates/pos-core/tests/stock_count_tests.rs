use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::stock_count::{RecordCountItemInput, StockCountRepo};
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [12u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_stock_count_audit_and_adjustment() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    let p = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "AUDIT-PROD".to_string(),
            name: "Audit Test Product".to_string(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("22222222".to_string()),
            retail_price_paisa: 5000,
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    )
    .expect("Create product");

    let var_id = &p.variant_id;

    // 1. Initial inbound: 20 units @ Rs 30 (3,000 Paisa)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: var_id.clone(),
            qty_signed_milli: 20_000,
            movement_type: "opening".to_string(),
            source_doc: "OPEN-01".to_string(),
            source_line: None,
            unit_cost_paisa: 3000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Initial movement");

    // 2. Start physical audit session
    let session = StockCountRepo::start_session(&conn, Some("Monthly Shelf Audit".to_string()))
        .expect("Start session");
    assert_eq!(session.status, "in_progress");
    assert_eq!(session.doc_no, "CNT-000001");

    // 3. Physical count found only 18 units (-2 units shortage)
    StockCountRepo::record_counts(
        &mut conn,
        &session.id,
        vec![RecordCountItemInput {
            variant_id: var_id.clone(),
            counted_qty_milli: 18_000,
            notes: Some("2 units damaged in shelf".to_string()),
        }],
    )
    .expect("Record counts");

    // 4. Finalize session with manager approval
    let finalized = StockCountRepo::finalize_and_adjust(&mut conn, &session.id, "admin-user-01")
        .expect("Finalize audit");
    assert_eq!(finalized.status, "completed");
    assert_eq!(finalized.lines.len(), 1);
    assert_eq!(finalized.lines[0].expected_qty_milli, 20_000);
    assert_eq!(finalized.lines[0].counted_qty_milli, 18_000);
    assert_eq!(finalized.lines[0].variance_qty_milli, -2_000);

    // 5. Verify on-hand stock is now 18 units
    let bal = InventoryRepo::get_balance(&conn, var_id).unwrap().unwrap();
    assert_eq!(bal.on_hand_milli, 18_000);

    // 6. Verify adjustment movement logged in history
    let history = InventoryRepo::get_history(&conn, var_id, 5).expect("Get history");
    assert_eq!(history[0].movement_type, "adjustment");
    assert_eq!(history[0].qty_signed_milli, -2_000);
    assert_eq!(history[0].source_doc, "CNT-000001");
}
