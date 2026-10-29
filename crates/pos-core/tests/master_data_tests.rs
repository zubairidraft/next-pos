use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::db::key::DbKeyManager;
use pos_core::domain::{
    BrandRepo, BusinessSettings, CategoryRepo, SettingsRepo, UnitRepo,
};
use tempfile::NamedTempFile;

#[test]
fn test_bilingual_categories_crud_and_search() {
    let temp_db = NamedTempFile::new().unwrap();
    let key = DbKeyManager::generate_random_key();
    let mut conn = open_encrypted_db(temp_db.path(), &key).unwrap();
    run_migrations(&mut conn).unwrap();

    // 1. Create category in English + Urdu
    let cat = CategoryRepo::create(
        &conn,
        "Beverages & Drinks",
        Some("مشروبات اور کولڈ ڈرنکس"),
        None,
    )
    .expect("Failed to create category");
    assert_eq!(cat.name, "Beverages & Drinks");
    assert_eq!(cat.name_ur.as_deref(), Some("مشروبات اور کولڈ ڈرنکس"));

    // 2. Search in English
    let search_en = CategoryRepo::search(&conn, "Beverages").unwrap();
    assert_eq!(search_en.len(), 1);
    assert_eq!(search_en[0].id, cat.id);

    // 3. Search in Urdu
    let search_ur = CategoryRepo::search(&conn, "مشروبات").unwrap();
    assert_eq!(search_ur.len(), 1);
    assert_eq!(search_ur[0].id, cat.id);
}

#[test]
fn test_brands_and_units_seeding() {
    let temp_db = NamedTempFile::new().unwrap();
    let key = DbKeyManager::generate_random_key();
    let mut conn = open_encrypted_db(temp_db.path(), &key).unwrap();
    run_migrations(&mut conn).unwrap();

    // Brand with Urdu name
    let brand = BrandRepo::create(&conn, "Shan Foods", Some("شان فوڈز")).unwrap();
    assert_eq!(brand.name, "Shan Foods");
    assert_eq!(brand.name_ur.as_deref(), Some("شان فوڈز"));

    let brand_search = BrandRepo::search(&conn, "شان").unwrap();
    assert_eq!(brand_search.len(), 1);

    // Units seeding
    UnitRepo::seed_defaults(&conn).expect("Failed to seed units");
    let units = UnitRepo::list(&conn).expect("Failed to list units");
    assert!(units.len() >= 6);

    let kg = units.iter().find(|u| u.code == "kg").expect("kg unit missing");
    assert_eq!(kg.decimals_allowed, 3);
}

#[test]
fn test_settings_save_and_retrieve() {
    let temp_db = NamedTempFile::new().unwrap();
    let key = DbKeyManager::generate_random_key();
    let mut conn = open_encrypted_db(temp_db.path(), &key).unwrap();
    run_migrations(&mut conn).unwrap();

    let new_settings = BusinessSettings {
        id: "".into(),
        name: "Al-Madina General Store".into(),
        name_ur: Some("المدینہ جنرل اسٹور".into()),
        address: Some("G-9 Markaz, Islamabad".into()),
        phone: Some("+923001234567".into()),
        ntn: Some("1234567-8".into()),
        strn: None,
        currency: "PKR".into(),
        time_zone: "Asia/Karachi".into(),
        tax_mode: "inclusive".into(),
        negative_stock_policy: "Block".into(),
        enabled_packs: vec!["grocery".into(), "electronics".into()],
        fbr_enabled: false,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    SettingsRepo::save_or_update(&conn, &new_settings).unwrap();

    let loaded = SettingsRepo::get(&conn).unwrap();
    assert_eq!(loaded.name, "Al-Madina General Store");
    assert_eq!(loaded.name_ur.as_deref(), Some("المدینہ جنرل اسٹور"));
    assert_eq!(loaded.phone.as_deref(), Some("+923001234567"));
    assert_eq!(loaded.negative_stock_policy, "Block");
    assert_eq!(loaded.currency, "PKR");
}
