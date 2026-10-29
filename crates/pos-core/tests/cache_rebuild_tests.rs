use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::reconcile::ReconcileEngine;
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [11u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_cache_rebuild_restores_identical_ledger_balances() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    let p1 = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "ITEM-A".to_string(),
            name: "Item A".to_string(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("11111111".to_string()),
            retail_price_paisa: 10000,
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    )
    .expect("Create p1");

    let var_id = &p1.variant_id;

    // Movement 1: Inbound 10 units @ Rs 80 (8,000 Paisa)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: var_id.clone(),
            qty_signed_milli: 10_000,
            movement_type: "purchase".to_string(),
            source_doc: "PUR-01".to_string(),
            source_line: None,
            unit_cost_paisa: 8000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Movement 1");

    // Movement 2: Inbound 10 units @ Rs 100 (10,000 Paisa) -> New WAC = Rs 90 (9,000 Paisa)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: var_id.clone(),
            qty_signed_milli: 10_000,
            movement_type: "purchase".to_string(),
            source_doc: "PUR-02".to_string(),
            source_line: None,
            unit_cost_paisa: 10000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Movement 2");
    InventoryRepo::update_avg_cost(&conn, var_id, 9000).expect("Update avg cost");

    // Movement 3: Sale 5 units
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: var_id.clone(),
            qty_signed_milli: -5_000,
            movement_type: "sale".to_string(),
            source_doc: "INV-01".to_string(),
            source_line: None,
            unit_cost_paisa: 9000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Movement 3");

    // Initial state: On hand = 15,000 milli, avg cost = 9,000 Paisa
    let bal_before = InventoryRepo::get_balance(&conn, var_id).unwrap().unwrap();
    assert_eq!(bal_before.on_hand_milli, 15_000);
    assert_eq!(bal_before.avg_cost_paisa, 9000);

    // Intentionally corrupt cache to simulate cache drift or unscheduled crash
    conn.execute(
        "UPDATE inventory_balances SET on_hand_milli = 99999, avg_cost_paisa = 1111 WHERE variant_id = ?1",
        rusqlite::params![var_id],
    )
    .expect("Corrupt cache");

    // Run rebuild engine
    let summary = ReconcileEngine::rebuild_inventory_cache(&mut conn).expect("Rebuild cache");
    assert_eq!(summary.variants_processed, 1);
    assert_eq!(summary.total_movements_replayed, 3);
    assert_eq!(summary.discrepancies_corrected, 1);

    // Verify cache restored to perfect mathematical parity
    let bal_after = InventoryRepo::get_balance(&conn, var_id).unwrap().unwrap();
    assert_eq!(bal_after.on_hand_milli, 15_000);
    assert_eq!(bal_after.avg_cost_paisa, 9000);
}
