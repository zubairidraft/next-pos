use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::sale::{PaymentTenderInput, PostSaleLineInput, PostSaleRequest, SaleRepo};
use pos_core::domain::{CatalogRepo, CreateProductParams, InventoryRepo, RecordMovementParams, UnitRepo};
use std::time::Instant;
use tempfile::NamedTempFile;

fn setup_test_db(file: &NamedTempFile) -> rusqlite::Connection {
    let key = [91u8; 32];
    let mut conn = open_encrypted_db(file.path(), &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    conn
}

#[test]
fn test_crash_resilience_and_transaction_atomicity() {
    let temp_file = NamedTempFile::new().unwrap();
    let key = [91u8; 32];

    // Phase 1: Initialize database and populate catalog
    {
        let mut conn = setup_test_db(&temp_file);
        let unit = UnitRepo::create(&conn, "KG", "Kilogram", 3).expect("unit");

        let product = CatalogRepo::create_product(
            &conn,
            CreateProductParams {
                category_id: None,
                brand_id: None,
                sku: "RICE-BASMATI-5K".to_string(),
                barcode: Some("8965000011223".to_string()),
                name: "Super Basmati Rice 5kg".to_string(),
                name_ur: Some("سپر باسمتی چاول".to_string()),
                base_unit_id: unit.id.clone(),
                hs_code: None,
                tax_rate_id: None,
                track_mode: None,
                reorder_level_milli: None,
                retail_price_paisa: 150000, // PKR 1,500
                wholesale_price_paisa: None,
                packaging_units: vec![],
            },
        ).expect("product");

        // Record 100 units initial stock
        InventoryRepo::record_movement(
            &conn,
            RecordMovementParams {
                variant_id: product.variant_id.clone(),
                qty_signed_milli: 100_000,
                movement_type: "purchase".to_string(),
                source_doc: "INIT-001".to_string(),
                source_line: None,
                unit_cost_paisa: 120000,
                batch_id: None,
                serial_id: None,
                user_id: None,
            },
        ).expect("initial movement");

        // Simulate an interrupted transaction (simulating power cut during multi-table write)
        let tx = conn.transaction().expect("begin tx");
        tx.execute(
            "INSERT INTO sales (id, doc_no, status, party_id, cash_session_id, subtotal_paisa, discount_paisa, tax_paisa, total_paisa, created_at)
             VALUES ('sale-uncommitted', 'INV-CRASH', 'posted', NULL, NULL, 150000, 0, 0, 150000, '2026-10-29T12:00:00Z')",
            [],
        ).expect("insert sale uncommitted");

        tx.execute(
            "INSERT INTO sale_lines (id, sale_id, variant_id, unit_id, qty_milli, unit_price_paisa, discount_paisa, tax_paisa, total_paisa, unit_cost_snapshot_paisa, cogs_paisa)
             VALUES ('line-uncommitted', 'sale-uncommitted', ?1, ?2, 1000, 150000, 0, 0, 150000, 120000, 120000)",
            rusqlite::params![product.variant_id, unit.id],
        ).expect("insert line uncommitted");

        // Do NOT commit tx! Intentionally drop to simulate abrupt termination mid-write
        drop(tx);
    } // Connection closed abruptly

    // Phase 2: Cold boot restart simulation
    let cold_boot_start = Instant::now();
    let conn_recovered = open_encrypted_db(temp_file.path(), &key).expect("reopen DB");
    let recovery_time = cold_boot_start.elapsed();

    // Verify recovery time is fast (< 1.5s requirement)
    assert!(
        recovery_time.as_secs_f64() < 1.5,
        "Cold boot recovery took {:?}, exceeding 1.5s limit!",
        recovery_time
    );

    // Verify SQLite database integrity
    let integrity: String = conn_recovered
        .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
        .expect("integrity check");
    assert_eq!(integrity, "ok", "Database must remain pristine after crash");

    // Verify uncommitted sale does NOT exist (clean rollback, zero orphaned records)
    let sale_count: i64 = conn_recovered
        .query_row("SELECT COUNT(*) FROM sales WHERE id = 'sale-uncommitted'", [], |r| r.get(0))
        .expect("count sales");
    assert_eq!(sale_count, 0, "Uncommitted sales transaction must be rolled back");

    let line_count: i64 = conn_recovered
        .query_row("SELECT COUNT(*) FROM sale_lines WHERE sale_id = 'sale-uncommitted'", [], |r| r.get(0))
        .expect("count lines");
    assert_eq!(line_count, 0, "No orphaned sale lines may exist");

    // Phase 3: Successful committed sale
    let mut conn_active = conn_recovered;
    let units = UnitRepo::list(&conn_active).unwrap();
    let unit = &units[0];
    let products = CatalogRepo::search(&conn_active, "RICE", 10).unwrap();
    let product = &products[0];

    let post_req = PostSaleRequest {
        customer_id: None,
        cash_session_id: None,
        lines: vec![PostSaleLineInput {
            variant_id: product.variant_id.clone(),
            unit_id: unit.id.clone(),
            qty_milli: 2000,
            unit_price_paisa: 150000,
            discount_paisa: 0,
            tax_paisa: 0,
            price_override_by: None,
        }],
        global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput {
            method: "cash".to_string(),
            amount_paisa: 300000,
            reference: None,
        }],
        user_id: None,
        credit_override_by: None,
    };

    let completed = SaleRepo::post_sale(&mut conn_active, post_req).expect("post sale");
    assert_eq!(completed.total_paisa, 300000);

    // Check inventory balance after valid sale
    let bal = InventoryRepo::get_balance(&conn_active, &product.variant_id).unwrap().unwrap();
    assert_eq!(bal.on_hand_milli, 98_000); // 100 - 2 = 98 units remaining
}
