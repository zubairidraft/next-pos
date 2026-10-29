use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::{
    CatalogRepo, CreateProductParams, PaymentTenderInput, PostReturnRequest, PostSaleLineInput,
    PostSaleRequest, ReturnLineRequest, ReturnRepo, SaleRepo, UnitRepo,
};
use rusqlite::params;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [22u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_sale_return_restores_stock_and_prevents_excess_returns() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "RET-SKU-01".to_string(),
            name: "Returnable Item".to_string(),
            name_ur: Some("واپسی آئٹم".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8961011009999".to_string()),
            retail_price_paisa: 100000,
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
            source_doc: "PUR-RET-01".to_string(),
            source_line: None,
            unit_cost_paisa: 50000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Record movement");

    // 1. Post Sale of 4 units @ 1000 PKR each
    let sale_req = PostSaleRequest {
        customer_id: None,
        cash_session_id: None,
        lines: vec![PostSaleLineInput {
            variant_id: variant_id.clone(),
            unit_id: unit_id.clone(),
            qty_milli: 4000, // 4 units
            unit_price_paisa: 100000,
            discount_paisa: 0,
            tax_paisa: 0,
        }],
        global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput {
            method: "cash".to_string(),
            amount_paisa: 400000,
            reference: None,
        }],
        user_id: None,
    };
    let completed_sale = SaleRepo::post_sale(&mut conn, sale_req).expect("sale should succeed");
    assert_eq!(completed_sale.lines.len(), 1);
    let original_line_id = completed_sale.lines[0].id.clone();

    // Verify stock is now 10 - 4 = 6 units (6000 milli)
    let stock_after_sale: i64 = conn
        .query_row(
            "SELECT on_hand_milli FROM inventory_balances WHERE variant_id = ?1",
            params![variant_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stock_after_sale, 6000);

    // 2. Post Return of 1 unit
    let return_req = PostReturnRequest {
        original_sale_id: completed_sale.id.clone(),
        lines: vec![ReturnLineRequest {
            original_sale_line_id: original_line_id.clone(),
            variant_id: variant_id.clone(),
            unit_id: unit_id.clone(),
            qty_milli: 1000, // 1 unit
            refund_paisa: 100000,
            restock_type: "sellable".to_string(),
        }],
        reason: Some("Customer bought wrong size".to_string()),
        refund_method: "cash".to_string(),
        cash_session_id: None,
    };

    let completed_return =
        ReturnRepo::post_return(&mut conn, return_req).expect("return should succeed");
    assert!(completed_return.doc_no.starts_with("RET-"));
    assert_eq!(completed_return.refund_paisa, 100000);
    assert_eq!(completed_return.restocked_items_count, 1);

    // Verify stock is restored from 6 to 7 units (7000 milli)
    let stock_after_return: i64 = conn
        .query_row(
            "SELECT on_hand_milli FROM inventory_balances WHERE variant_id = ?1",
            params![variant_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stock_after_return, 7000);

    // Verify outbound refund payment recorded in payments table
    let refund_payment_amt: i64 = conn
        .query_row(
            "SELECT amount_paisa FROM payments WHERE reference = ?1 AND direction = 'outbound'",
            params![completed_return.doc_no],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(refund_payment_amt, 100000);

    // 3. Attempt to return 4 more units (when only 3 remain eligible)
    let excess_return_req = PostReturnRequest {
        original_sale_id: completed_sale.id.clone(),
        lines: vec![ReturnLineRequest {
            original_sale_line_id: original_line_id.clone(),
            variant_id: variant_id.clone(),
            unit_id: unit_id.clone(),
            qty_milli: 4000, // Exceeds remaining 3 units!
            refund_paisa: 400000,
            restock_type: "sellable".to_string(),
        }],
        reason: None,
        refund_method: "cash".to_string(),
        cash_session_id: None,
    };

    let err = ReturnRepo::post_return(&mut conn, excess_return_req);
    assert!(
        err.is_err(),
        "Must strictly block returning more items than remaining eligible quantity"
    );
}
