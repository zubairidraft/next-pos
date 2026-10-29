use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::cart::{Cart, CartLine, CartRepo};
use pos_core::money::{Paisa, Qty};
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [13u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_cart_calculations() {
    let mut cart = Cart::new();

    // Line 1: 2 units @ Rs 100.00 (10,000 Paisa), 10% discount (1,000 bp), 0 tax
    // Subtotal: 2 * 10,000 = 20,000 Paisa
    // Discount: 10% of 20,000 = 2,000 Paisa
    // Line Total: 18,000 Paisa
    cart.add_or_increment(CartLine {
        id: "l1".to_string(),
        variant_id: "var-1".to_string(),
        sku: "SKU-1".to_string(),
        name: "Item 1".to_string(),
        name_ur: None,
        unit_id: "u1".to_string(),
        unit_code: "PCS".to_string(),
        barcode: Some("1111".to_string()),
        qty: Qty(2000), // 2.000 units
        unit_price: Paisa(10000),
        discount_basis_points: 1000,
        tax_rate_basis_points: 0,
    });

    // Line 2: 1 unit @ Rs 200.00 (20,000 Paisa), 0 discount, 18% tax (1,800 bp)
    // Subtotal: 20,000 Paisa
    // Tax: 18% of 20,000 = 3,600 Paisa
    // Line Total: 23,600 Paisa
    cart.add_or_increment(CartLine {
        id: "l2".to_string(),
        variant_id: "var-2".to_string(),
        sku: "SKU-2".to_string(),
        name: "Item 2".to_string(),
        name_ur: None,
        unit_id: "u1".to_string(),
        unit_code: "PCS".to_string(),
        barcode: Some("2222".to_string()),
        qty: Qty(1000),
        unit_price: Paisa(20000),
        discount_basis_points: 0,
        tax_rate_basis_points: 1800,
    });

    assert_eq!(cart.subtotal(), Paisa(40000));
    assert_eq!(cart.total_discount(), Paisa(2000));
    assert_eq!(cart.tax(), Paisa(3600));
    // Grand total: 40,000 - 2,000 + 3,600 = 41,600 Paisa (PKR 416.00)
    assert_eq!(cart.grand_total(), Paisa(41600));
}

#[test]
fn test_park_and_recall_cart_persistence() {
    let (mut conn, _file) = setup_test_db();
    let mut cart = Cart::new();

    cart.add_or_increment(CartLine {
        id: "line-park".to_string(),
        variant_id: "var-park".to_string(),
        sku: "SKU-PARK".to_string(),
        name: "Parked Item".to_string(),
        name_ur: Some("پارک آئٹم".to_string()),
        unit_id: "u1".to_string(),
        unit_code: "PCS".to_string(),
        barcode: Some("99991111".to_string()),
        qty: Qty(3000), // 3 units
        unit_price: Paisa(15000), // Rs 150
        discount_basis_points: 0,
        tax_rate_basis_points: 0,
    });

    assert_eq!(cart.grand_total(), Paisa(45000)); // Rs 450.00

    // 1. Park cart
    let parked_id = CartRepo::park_cart(&conn, &cart, "Counter 1 - Hold Cart").expect("Park cart");

    // 2. List parked carts
    let list = CartRepo::list_parked_carts(&conn).expect("List parked carts");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, parked_id);
    assert_eq!(list[0].cart_name, "Counter 1 - Hold Cart");
    assert_eq!(list[0].total_paisa, 45000);
    assert_eq!(list[0].item_count, 1);

    // 3. Recall cart
    let recalled = CartRepo::recall_cart(&mut conn, &parked_id).expect("Recall cart");
    assert_eq!(recalled.lines.len(), 1);
    assert_eq!(recalled.lines[0].sku, "SKU-PARK");
    assert_eq!(recalled.grand_total(), Paisa(45000));

    // 4. Verify removed from parked_carts table
    let remaining = CartRepo::list_parked_carts(&conn).expect("List parked carts");
    assert_eq!(remaining.len(), 0);
}
