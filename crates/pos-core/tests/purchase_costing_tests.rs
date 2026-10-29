use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::{CatalogRepo, CreateProductParams, UnitRepo};
use pos_core::domain::inventory::InventoryRepo;
use pos_core::domain::party::{CreatePartyParams, PartyRepo};
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput, PurchaseRepo};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [6u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_landed_cost_allocation() {
    let lines = vec![
        CreatePurchaseLineInput {
            variant_id: "var-1".to_string(),
            unit_id: "unit-1".to_string(),
            received_qty_milli: 10_000, // 10 units
            unit_cost_paisa: 10_000,    // Rs 100/unit -> Total = Rs 1,000 (100,000 Paisa)
        },
        CreatePurchaseLineInput {
            variant_id: "var-2".to_string(),
            unit_id: "unit-1".to_string(),
            received_qty_milli: 10_000, // 10 units
            unit_cost_paisa: 30_000,    // Rs 300/unit -> Total = Rs 3,000 (300,000 Paisa)
        },
    ];

    // Total goods subtotal = Rs 4,000 (400,000 Paisa)
    // Freight = Rs 400 (40,000 Paisa)
    // Line 1 represents 25% of goods -> receives 25% of freight = 10,000 Paisa
    // Line 2 represents 75% of goods -> receives 75% of freight = 30,000 Paisa
    let freight_paisa = 40_000;
    let allocations = PurchaseRepo::allocate_landed_cost(&lines, freight_paisa)
        .expect("Allocate landed cost");

    assert_eq!(allocations.len(), 2);

    // Line 1: base 100,000 + 10,000 freight = 110,000 Paisa total.
    // Effective unit cost = 110,000 / 10 = 11,000 Paisa (Rs 110.00)
    assert_eq!(allocations[0].0, 110_000);
    assert_eq!(allocations[0].1, 11_000);

    // Line 2: base 300,000 + 30,000 freight = 330,000 Paisa total.
    // Effective unit cost = 330,000 / 10 = 33,000 Paisa (Rs 330.00)
    assert_eq!(allocations[1].0, 330_000);
    assert_eq!(allocations[1].1, 33_000);

    // Total allocated equals subtotal + freight
    let total_allocated: i64 = allocations.iter().map(|(tot, _)| tot).sum();
    assert_eq!(total_allocated, 400_000 + freight_paisa);
}

#[test]
fn test_wac_moving_average_cost_recalculation() {
    // Current stock: 10 units @ Rs 100 (10,000 Paisa) = Rs 1,000 (100,000 Paisa)
    // Inbound: 10 units @ Rs 200 (20,000 Paisa) = Rs 2,000 (200,000 Paisa)
    // Total stock: 20 units. Total value = Rs 3,000 (300,000 Paisa).
    // New average cost = Rs 3,000 / 20 = Rs 150 (15,000 Paisa).
    let new_cost = PurchaseRepo::calculate_new_avg_cost(10_000, 10_000, 10_000, 20_000);
    assert_eq!(new_cost, 15_000);

    // When starting with 0 stock, new cost is exact inbound cost
    let init_cost = PurchaseRepo::calculate_new_avg_cost(0, 0, 5_000, 12_500);
    assert_eq!(init_cost, 12_500);
}

#[test]
fn test_post_purchase_invoice_full_lifecycle() {
    let (mut conn, _file) = setup_test_db();
    let base_unit = UnitRepo::create(&conn, "pc", "Piece", 0).expect("Unit create failed");

    // 1. Create Vendor
    let vendor = PartyRepo::create_party(
        &conn,
        CreatePartyParams {
            party_type: "vendor".to_string(),
            name: "Shan Foods Distributor".to_string(),
            name_ur: Some("شان فوڈز ڈسٹریبیوٹر".to_string()),
            phone: Some("03001234567".to_string()),
            cnic: None,
            ntn: Some("1234567-8".to_string()),
            credit_limit_paisa: 0,
            opening_balance_paisa: 50_000, // Previous credit Rs 500
            price_list_id: None,
        },
    )
    .expect("Create vendor");

    // 2. Create Product
    let product = CatalogRepo::create_product(
        &conn,
        CreateProductParams {
            sku: "SHAN-BIRYANI".to_string(),
            name: "Shan Biryani Masala 50g".to_string(),
            name_ur: Some("شان بریانی مصالحہ".to_string()),
            category_id: None,
            brand_id: None,
            base_unit_id: base_unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("896400010011".to_string()),
            retail_price_paisa: 12000,
            wholesale_price_paisa: Some(10500),
            packaging_units: vec![],
        },
    )
    .expect("Create product");

    let variant_id = &product.variant_id;
    let unit_id = &base_unit.id;

    // 3. Post Purchase Invoice: 100 units @ Rs 95.00 (9,500 Paisa), Freight = Rs 500 (50,000 Paisa)
    // 100 units * 9,500 = 950,000 Paisa + 50,000 freight = 1,000,000 Paisa total invoice
    // Effective unit cost = 1,000,000 / 100 = 10,000 Paisa (Rs 100.00)
    let purchase = PurchaseRepo::post_purchase(
        &mut conn,
        CreatePurchaseInput {
            vendor_id: vendor.id.clone(),
            vendor_invoice_no: Some("SHAN-INV-991".to_string()),
            freight_paisa: 50_000,
            lines: vec![CreatePurchaseLineInput {
                variant_id: variant_id.clone(),
                unit_id: unit_id.clone(),
                received_qty_milli: 100_000, // 100 units
                unit_cost_paisa: 9_500,
            }],
            user_id: None,
        },
    )
    .expect("Post purchase invoice");

    assert_eq!(purchase.doc_no, "PUR-000001");
    assert_eq!(purchase.total_paisa, 1_000_000);
    assert_eq!(purchase.lines.len(), 1);
    assert_eq!(purchase.lines[0].effective_unit_cost_paisa, 10_000);

    // 4. Verify inventory stock balance and new average cost
    let balance = InventoryRepo::get_balance(&conn, variant_id)
        .expect("Query balance")
        .expect("Balance exists");
    assert_eq!(balance.on_hand_milli, 100_000); // 100 units
    assert_eq!(balance.avg_cost_paisa, 10_000);  // Rs 100.00 (95 + 5 freight per unit)

    // 5. Verify vendor Khata party_ledger entry
    let (credit, running_bal): (i64, i64) = conn
        .query_row(
            "SELECT credit_paisa, balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
            rusqlite::params![vendor.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("Query vendor ledger");

    assert_eq!(credit, 1_000_000); // Rs 10,000 credit
    assert_eq!(running_bal, 50_000 + 1_000_000); // Opening balance Rs 500 + Rs 10,000 = Rs 10,500
}
