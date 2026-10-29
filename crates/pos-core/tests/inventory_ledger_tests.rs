use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [8u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_inventory_ledger_and_balance_cache() {
    let (conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "kg", "Kilogram", 3).expect("Unit create failed");

    // 1. Create a product
    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "TEST-ITEM-01".to_string(),
            name: "Test Rice 1kg".to_string(),
            name_ur: Some("ٹیسٹ چاول".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("89610001".to_string()),
            retail_price_paisa: 20000, // Rs. 200.00
            wholesale_price_paisa: Some(18000),
            packaging_units: vec![],
        },
    )
    .expect("Failed to create product");

    let variant_id = &product.variant_id;

    // 2. Initial balance should be 0
    let initial_qty = InventoryRepo::get_on_hand_qty(&conn, variant_id).expect("Query on hand");
    assert_eq!(initial_qty.0, 0);

    // 3. Record positive movement (e.g. opening balance +10,000 milli = 10 units)
    let m1 = InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: 10_000,
            movement_type: "opening".to_string(),
            source_doc: "OPEN-01".to_string(),
            source_line: None,
            unit_cost_paisa: 15000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Record positive movement");

    assert_eq!(m1.qty_signed_milli, 10_000);
    assert_eq!(m1.value_delta_paisa, 150000); // 10 * 15000 = 150,000 Paisa

    let bal1 = InventoryRepo::get_on_hand_qty(&conn, variant_id).expect("Query on hand");
    assert_eq!(bal1.0, 10_000);

    // 4. Record inbound purchase movement (+15,000 milli = 15 units)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: 15_000,
            movement_type: "purchase".to_string(),
            source_doc: "PUR-000001".to_string(),
            source_line: None,
            unit_cost_paisa: 16000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Record purchase movement");

    let bal2 = InventoryRepo::get_on_hand_qty(&conn, variant_id).expect("Query on hand");
    assert_eq!(bal2.0, 25_000);

    // 5. Record outbound sales deduction (-5,000 milli = 5 units)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: -5_000,
            movement_type: "sale".to_string(),
            source_doc: "INV-000001".to_string(),
            source_line: None,
            unit_cost_paisa: 15500,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Record sale movement");

    let bal3 = InventoryRepo::get_on_hand_qty(&conn, variant_id).expect("Query on hand");
    assert_eq!(bal3.0, 20_000);

    // 6. Check history
    let history = InventoryRepo::get_history(&conn, variant_id, 10).expect("Query history");
    assert_eq!(history.len(), 3);
    assert_eq!(history[0].movement_type, "sale");
    assert_eq!(history[1].movement_type, "purchase");
    assert_eq!(history[2].movement_type, "opening");

    // 7. Check list balances view
    let balance_views = InventoryRepo::list_balances(&conn).expect("List balance views");
    assert_eq!(balance_views.len(), 1);
    assert_eq!(balance_views[0].sku, "TEST-ITEM-01");
    assert_eq!(balance_views[0].on_hand_milli, 20_000);
}
