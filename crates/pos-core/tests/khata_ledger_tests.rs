use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::party::{CreatePartyParams, PartyRepo};
use pos_core::domain::KhataRepo;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [31u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_customer_khata_running_balance_and_statement() {
    let (mut conn, _file) = setup_test_db();

    // 1. Create customer with PKR 1,000 (100,000 Paisa) opening balance
    let customer = PartyRepo::create_party(
        &conn,
        CreatePartyParams {
            party_type: "customer".to_string(),
            name: "Chaudhry Riaz".to_string(),
            name_ur: Some("چوہدری ریاض".to_string()),
            phone: Some("0301-5556677".to_string()),
            cnic: None,
            ntn: None,
            credit_limit_paisa: 5000000, // PKR 50,000 limit
            opening_balance_paisa: 100000, // PKR 1,000
            price_list_id: None,
        },
    )
    .expect("create customer");

    // Initial balance check
    let bal = KhataRepo::get_balance(&conn, &customer.id).expect("get balance");
    assert_eq!(bal, 100000);

    // 2. Record Credit Sale: Debit PKR 2,500 (250,000 Paisa)
    let e1 = KhataRepo::record_entry(
        &mut conn,
        &customer.id,
        "sale",
        250000,
        0,
        "INV-202610-0010",
        Some("2026-10-29T10:00:00Z"),
    )
    .expect("record sale entry");
    assert_eq!(e1.balance_paisa, 350000); // 1,000 + 2,500 = 3,500

    // 3. Record Partial Payment: Credit PKR 1,500 (150,000 Paisa)
    let e2 = KhataRepo::record_entry(
        &mut conn,
        &customer.id,
        "payment",
        0,
        150000,
        "RCPT-001",
        Some("2026-10-29T11:00:00Z"),
    )
    .expect("record payment entry");
    assert_eq!(e2.balance_paisa, 200000); // 3,500 - 1,500 = 2,000

    // 4. Query Statement
    let statement = KhataRepo::get_statement(
        &conn,
        &customer.id,
        "2026-10-29T00:00:00Z",
        "2026-10-29T23:59:59Z",
    )
    .expect("get statement");

    assert_eq!(statement.party_id, customer.id);
    assert_eq!(statement.party_name, "Chaudhry Riaz");
    assert_eq!(statement.opening_balance_paisa, 100000);
    assert_eq!(statement.total_debit_paisa, 250000);
    assert_eq!(statement.total_credit_paisa, 150000);
    assert_eq!(statement.closing_balance_paisa, 200000);
    assert_eq!(statement.entries.len(), 2);
}

#[test]
fn test_vendor_khata_running_balance() {
    let (mut conn, _file) = setup_test_db();

    // 1. Create vendor with 0 opening balance
    let vendor = PartyRepo::create_party(
        &conn,
        CreatePartyParams {
            party_type: "vendor".to_string(),
            name: "Nestle Pakistan Distribution".to_string(),
            name_ur: Some("نیسلے پاکستان".to_string()),
            phone: Some("042-111637853".to_string()),
            cnic: None,
            ntn: Some("0801234-5".to_string()),
            credit_limit_paisa: 0,
            opening_balance_paisa: 0,
            price_list_id: None,
        },
    )
    .expect("create vendor");

    // 2. Receive Goods on Credit: Credit PKR 50,000 (5,000,000 Paisa)
    let e1 = KhataRepo::record_entry(
        &mut conn,
        &vendor.id,
        "purchase",
        0,
        5000000,
        "PUR-202610-001",
        None,
    )
    .expect("record purchase");
    assert_eq!(e1.balance_paisa, 5000000); // We owe 50,000 PKR

    // 3. Pay Vendor via Bank Transfer: Debit PKR 30,000 (3,000,000 Paisa)
    let e2 = KhataRepo::record_entry(
        &mut conn,
        &vendor.id,
        "payment",
        3000000,
        0,
        "PAY-BANK-001",
        None,
    )
    .expect("record payment");
    assert_eq!(e2.balance_paisa, 2000000); // Remaining payable = 20,000 PKR
}
