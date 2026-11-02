use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::party::{CreatePartyParams, PartyRepo};
use pos_core::domain::sale::{PaymentTenderInput, PostSaleLineInput, PostSaleRequest, SaleRepo};
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use pos_core::error::PosError;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [14u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_atomic_sale_posting_with_split_tenders() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    // 1. Create registered Customer
    let customer = PartyRepo::create_party(
        &conn,
        CreatePartyParams {
            party_type: "customer".to_string(),
            name: "Haji Abdul Rehman".to_string(),
            name_ur: Some("حاجی عبد الرحمٰن".to_string()),
            phone: Some("03009988776".to_string()),
            cnic: None,
            ntn: None,
            credit_limit_paisa: 5000000, // PKR 50,000 credit limit
            opening_balance_paisa: 0,
            price_list_id: None,
        },
    )
    .expect("Create customer");

    // 2. Create Product
    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "TEA-TAPAL-400".to_string(),
            name: "Tapal Danedar 400g".to_string(),
            name_ur: Some("ٹپال دانے دار".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8961011002231".to_string()),
            retail_price_paisa: 75000, // Rs. 750.00
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    )
    .expect("Create product");

    let var_id = &product.variant_id;

    // 3. Receive stock: 10 units @ Rs 600 (60,000 Paisa)
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: var_id.clone(),
            qty_signed_milli: 10_000,
            movement_type: "purchase".to_string(),
            source_doc: "PUR-01".to_string(),
            source_line: None,
            unit_cost_paisa: 60000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("Inbound purchase");

    // 4. Post Sale: 2 units @ Rs 750 = Rs 1,500 (150,000 Paisa)
    // Split Tenders: Cash Rs 1,000 (100,000 Paisa) + Credit Rs 500 (50,000 Paisa)
    let sale_req = PostSaleRequest {
        customer_id: Some(customer.id.clone()),
        cash_session_id: None,
        lines: vec![PostSaleLineInput {
            variant_id: var_id.clone(),
            unit_id: base_unit.id.clone(),
            qty_milli: 2_000, // 2 units
            unit_price_paisa: 75000,
            discount_paisa: 0,
            tax_paisa: 0,
            price_override_by: None,
        }],
        global_discount_paisa: 0,
        tenders: vec![
            PaymentTenderInput {
                method: "cash".to_string(),
                amount_paisa: 100_000, // Rs 1,000
                reference: None,
            },
            PaymentTenderInput {
                method: "credit".to_string(),
                amount_paisa: 50_000, // Rs 500
                reference: Some("Khata balance sale".to_string()),
            },
        ],
        user_id: None,
        credit_override_by: None,
    };

    let completed = SaleRepo::post_sale(&mut conn, sale_req).expect("Post sale");
    assert_eq!(completed.doc_no, "INV-000001");
    assert_eq!(completed.total_paisa, 150_000);
    assert_eq!(completed.tendered_paisa, 150_000);
    assert_eq!(completed.change_paisa, 0);

    // 5. Verify on-hand stock deducted to 8 units
    let bal = InventoryRepo::get_balance(&conn, var_id).unwrap().unwrap();
    assert_eq!(bal.on_hand_milli, 8_000);

    // 6. Verify Customer Khata ledger has Rs 500 debit
    let (debit, customer_bal): (i64, i64) = conn
        .query_row(
            "SELECT debit_paisa, balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC LIMIT 1",
            rusqlite::params![customer.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("Query customer ledger");
    assert_eq!(debit, 50_000);
    assert_eq!(customer_bal, 50_000);

    // 7. Verify Negative Stock Policy blocks sales when exceeding on-hand stock
    // Current stock is 8 units. Attempt to sell 10 units:
    let over_req = PostSaleRequest {
        customer_id: None,
        cash_session_id: None,
        lines: vec![PostSaleLineInput {
            variant_id: var_id.clone(),
            unit_id: base_unit.id.clone(),
            qty_milli: 10_000, // 10 units requested, only 8 available
            unit_price_paisa: 75000,
            discount_paisa: 0,
            tax_paisa: 0,
            price_override_by: None,
        }],
        global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput {
            method: "cash".to_string(),
            amount_paisa: 750_000,
            reference: None,
        }],
        user_id: None,
        credit_override_by: None,
    };

    let err = SaleRepo::post_sale(&mut conn, over_req).expect_err("Should block negative stock");
    match err {
        PosError::NegativeStockBlocked { requested_milli, available_milli, .. } => {
            assert_eq!(requested_milli, 10_000);
            assert_eq!(available_milli, 8_000);
        }
        other => panic!("Expected NegativeStockBlocked, got: {:?}", other),
    }
}
