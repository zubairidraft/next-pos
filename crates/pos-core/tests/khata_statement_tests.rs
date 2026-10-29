use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::KhataRepo;
use tempfile::NamedTempFile;

fn setup_test_db() -> (rusqlite::Connection, NamedTempFile) {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [33u8; 32];
    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");
    (conn, temp_file)
}

#[test]
fn test_whatsapp_url_builder_formats_pakistani_numbers() {
    // 1. Test standard local number: 0300-1234567
    let url1 = KhataRepo::build_whatsapp_url(
        "Tariq Mahmood",
        "0300-1234567",
        155000, // PKR 1,550.00
        "Al-Madina Superstore",
    );
    assert!(url1.starts_with("https://wa.me/923001234567?text="));
    assert!(url1.contains("1550.00"));
    assert!(url1.contains("Tariq"));

    // 2. Test international format: +92 321 9876543
    let url2 = KhataRepo::build_whatsapp_url(
        "Rashid",
        "+92 321 9876543",
        500000,
        "Madina Cash & Carry",
    );
    assert!(url2.starts_with("https://wa.me/923219876543?text="));
    assert!(url2.contains("5000.00"));
}

#[test]
fn test_aging_buckets_query() {
    let (conn, _file) = setup_test_db();
    let buckets = KhataRepo::get_aging_buckets(&conn, "customer").expect("get aging buckets");
    assert_eq!(buckets.len(), 4);
    assert_eq!(buckets[0].bucket_name, "0-30 Days");
    assert_eq!(buckets[1].bucket_name, "31-60 Days");
    assert_eq!(buckets[2].bucket_name, "61-90 Days");
    assert_eq!(buckets[3].bucket_name, "90+ Days");
}
