use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::party::{CreatePartyParams, PartyRepo};
use pos_core::domain::{
    CatalogRepo, CreateProductParams, KhataRepo, PaymentTenderInput, PostSaleLineInput,
    PostSaleRequest, SaleRepo, UnitRepo,
};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [32u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_fifo_invoice_payment_allocation_and_credit_limit() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("create unit");

    // 1. Create Customer with PKR 10,000 (1,000,000 Paisa) credit limit
    let customer = PartyRepo::create_party(
        &conn,
        CreatePartyParams {
            party_type: "customer".to_string(),
            name: "Malik Usman".to_string(),
            name_ur: Some("ملک عثمان".to_string()),
            phone: Some("0333-1234567".to_string()),
            cnic: None,
            ntn: None,
            credit_limit_paisa: 1000000, // PKR 10,000
            opening_balance_paisa: 0,
            price_list_id: None,
        },
    )
    .expect("create customer");

    // Create item
    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "ITEM-KHATA-01".to_string(),
            name: "Flour 10kg Bag".to_string(),
            name_ur: Some("آٹا ۱۰ کلو".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8961011007777".to_string()),
            retail_price_paisa: 100000, // PKR 1,000
            wholesale_price_paisa: None,
            packaging_units: vec![],
        },
    )
    .expect("create product");

    // Stock movement
    InventoryRepo::record_movement(
        &conn,
        RecordMovementParams {
            variant_id: product.variant_id.clone(),
            qty_signed_milli: 20000, // 20 bags
            movement_type: "purchase".to_string(),
            source_doc: "PUR-K01".to_string(),
            source_line: None,
            unit_cost_paisa: 80000,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .expect("record stock");

    // 2. Post Sale 1: 3 bags = PKR 3,000 on Credit
    let sale1 = SaleRepo::post_sale(
        &mut conn,
        PostSaleRequest {
            customer_id: Some(customer.id.clone()),
            cash_session_id: None,
            lines: vec![PostSaleLineInput {
                variant_id: product.variant_id.clone(),
                unit_id: base_unit.id.clone(),
                qty_milli: 3000,
                unit_price_paisa: 100000,
                discount_paisa: 0,
                tax_paisa: 0,
                price_override_by: None,
            }],
            global_discount_paisa: 0,
            tenders: vec![PaymentTenderInput {
                method: "credit".to_string(),
                amount_paisa: 300000, // PKR 3,000
                reference: Some("Sale 1 Credit".to_string()),
            }],
            user_id: None,
            credit_override_by: None,
        },
    )
    .expect("post sale 1");

    // 3. Post Sale 2: 4 bags = PKR 4,000 on Credit
    let sale2 = SaleRepo::post_sale(
        &mut conn,
        PostSaleRequest {
            customer_id: Some(customer.id.clone()),
            cash_session_id: None,
            lines: vec![PostSaleLineInput {
                variant_id: product.variant_id.clone(),
                unit_id: base_unit.id.clone(),
                qty_milli: 4000,
                unit_price_paisa: 100000,
                discount_paisa: 0,
                tax_paisa: 0,
                price_override_by: None,
            }],
            global_discount_paisa: 0,
            tenders: vec![PaymentTenderInput {
                method: "credit".to_string(),
                amount_paisa: 400000, // PKR 4,000
                reference: Some("Sale 2 Credit".to_string()),
            }],
            user_id: None,
            credit_override_by: None,
        },
    )
    .expect("post sale 2");

    // Verify current balance: 3,000 + 4,000 = 7,000 PKR (700,000 Paisa)
    let bal = KhataRepo::get_balance(&conn, &customer.id).expect("get balance");
    assert_eq!(bal, 700000);

    // 4. Test Credit Limit Check:
    // Adding 2,000 PKR is allowed (7,000 + 2,000 = 9,000 <= 10,000 limit)
    let check1 = KhataRepo::check_credit_limit(&conn, &customer.id, 200000).expect("check credit");
    assert!(check1.allowed);
    assert!(!check1.manager_override_required);

    // Adding 4,000 PKR exceeds limit (7,000 + 4,000 = 11,000 > 10,000 limit)
    let check2 = KhataRepo::check_credit_limit(&conn, &customer.id, 400000).expect("check credit");
    assert!(!check2.allowed);
    assert!(check2.manager_override_required);

    // 5. Test FIFO Payment Allocation: Customer pays PKR 5,000 (500,000 Paisa) Cash
    let alloc_res = KhataRepo::allocate_payment_fifo(
        &mut conn,
        &customer.id,
        500000, // PKR 5,000
        "cash",
        Some("Customer partial settlement"),
        None,
    )
    .expect("allocate payment");

    assert_eq!(alloc_res.allocations.len(), 2);

    // First invoice (PKR 3,000) should be fully settled:
    assert_eq!(alloc_res.allocations[0].sale_id, sale1.id);
    assert_eq!(alloc_res.allocations[0].allocated_paisa, 300000);
    assert_eq!(alloc_res.allocations[0].remaining_paisa, 0);

    // Second invoice (PKR 4,000) should receive remaining PKR 2,000:
    assert_eq!(alloc_res.allocations[1].sale_id, sale2.id);
    assert_eq!(alloc_res.allocations[1].allocated_paisa, 200000);
    assert_eq!(alloc_res.allocations[1].remaining_paisa, 200000);

    // Remaining customer ledger balance should now be 7,000 - 5,000 = 2,000 PKR (200,000 Paisa)
    assert_eq!(alloc_res.new_party_balance_paisa, 200000);
    let final_bal = KhataRepo::get_balance(&conn, &customer.id).expect("get balance");
    assert_eq!(final_bal, 200000);
}
