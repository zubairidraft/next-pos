use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::error::PosError;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [9u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_negative_stock_blocked_policy() {
    let (conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "BLOCK-TEST".to_string(),
            name: "Limited Stock Item".to_string(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("99990001".to_string()),
            retail_price_paisa: 7500,
            wholesale_price_paisa: Some(7000),
            packaging_units: vec![],
        },
    )
    .expect("Create product");

    let variant_id = &product.variant_id;

    // 1. Inbound 5 units = 5,000 milli
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: 5_000,
            movement_type: "opening".to_string(),
            source_doc: "OPEN-01".to_string(),
            source_line: None,
            unit_cost_paisa: 5000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Inbound 5 units");

    // 2. Attempt to deduct 6 units = -6,000 milli (should fail with NegativeStockBlocked)
    let err = InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: -6_000,
            movement_type: "sale".to_string(),
            source_doc: "INV-FAIL".to_string(),
            source_line: None,
            unit_cost_paisa: 5000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect_err("Should fail due to negative stock block policy");

    match err {
        PosError::NegativeStockBlocked {
            variant_id: v_id,
            requested_milli,
            available_milli,
        } => {
            assert_eq!(v_id, *variant_id);
            assert_eq!(requested_milli, 6_000);
            assert_eq!(available_milli, 5_000);
        }
        other => panic!("Expected NegativeStockBlocked error, got: {:?}", other),
    }

    // 3. Deduct 3 units = -3,000 milli (should succeed)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: variant_id.clone(),
            qty_signed_milli: -3_000,
            movement_type: "sale".to_string(),
            source_doc: "INV-SUCCESS".to_string(),
            source_line: None,
            unit_cost_paisa: 5000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Deduct 3 units should succeed");

    let current_qty = InventoryRepo::get_on_hand_qty(&conn, variant_id).expect("Query on hand");
    assert_eq!(current_qty.0, 2_000);
}
