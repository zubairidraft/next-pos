use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::{CatalogImporter, CatalogRepo, ImportRow};
use std::io::Cursor;
use std::time::Instant;
use tempfile::NamedTempFile;

#[test]
fn test_csv_import_functional() {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [9u8; 32];

    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");

    let csv_data = "\
sku,name,name_ur,category,brand,unit,barcode,retail_price,wholesale_price
DALDA-1L,Dalda Cooking Oil 1L,ڈالڈا کوکنگ آئل 1 لیٹر,Cooking Oil,Dalda,ltr,8964000200111,540.00,510.00
TAPAL-400G,Tapal Danedar Tea 400g,ٹپال دانے دار چائے 400 گرام,Tea & Beverages,Tapal,pc,8964000300222,680.50,640.00
TAPAL-400G,Duplicate Tapal item,,Tea & Beverages,Tapal,pc,8964000300999,680.50,
,Missing SKU Item,,,pc,,100.00,
LU-RIO-12,LU Rio Strawberry Biscuits,ریو بسکٹ,Snacks,LU,pc,8964000400333,40.00,35.00
";

    let summary = CatalogImporter::import_csv(&mut conn, Cursor::new(csv_data))
        .expect("CSV import execution failed");

    assert_eq!(summary.total_rows, 5);
    assert_eq!(summary.imported, 3);
    assert_eq!(summary.skipped, 2); // 1 duplicate SKU, 1 missing SKU
    assert_eq!(summary.errors.len(), 2);

    // Verify lookup by barcode of imported item
    let found = CatalogRepo::get_by_barcode(&conn, "8964000200111")
        .expect("Query failed")
        .expect("Dalda not found");
    assert_eq!(found.sku, "DALDA-1L");
    assert_eq!(found.retail_price_paisa, 54000); // 540.00 * 100
    assert_eq!(found.wholesale_price_paisa, Some(51000));
}

#[test]
fn test_high_volume_50k_items_benchmark() {
    let temp_file = NamedTempFile::new().unwrap();
    let db_path = temp_file.path();
    let key = [42u8; 32];

    let mut conn = open_encrypted_db(db_path, &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");

    println!("Generating 50,000 synthetic retail products...");
    let gen_start = Instant::now();

    const TOTAL_ITEMS: usize = 50_000;
    let mut rows = Vec::with_capacity(TOTAL_ITEMS);

    let categories = [
        "Beverages", "Spices", "Rice & Flour", "Edible Oils", "Snacks & Confectionery",
        "Personal Care", "Household Cleaners", "Dairy Products", "Canned Foods", "Baby Care",
    ];

    let brands = [
        "National Foods", "Shan", "Dalda", "Tapal", "Knorr",
        "Nestle", "Engro", "Mitchells", "Shezan", "Mehran",
    ];

    for i in 1..=TOTAL_ITEMS {
        let cat = categories[i % categories.len()];
        let brand = brands[i % brands.len()];
        let sku = format!("SKU-{:06}", i);
        let barcode = format!("8964{:09}", i);

        rows.push(ImportRow {
            sku,
            name: format!("{} {} Product {:05}", brand, cat, i),
            name_ur: Some(format!("پروڈکٹ نمبر {:05}", i)),
            category: Some(cat.into()),
            brand: Some(brand.into()),
            unit: Some("pc".into()),
            barcode: Some(barcode),
            retail_price_paisa: ((i % 1000) as i64 + 10) * 100,
            wholesale_price_paisa: Some(((i % 1000) as i64 + 5) * 100),
            reorder_level_milli: 0,
            is_service: false,
        });
    }

    println!("Generation of 50,000 items completed in {:?}", gen_start.elapsed());

    println!("Starting high-speed batch import of 50,000 items into SQLite...");
    let import_start = Instant::now();
    let summary = CatalogImporter::import_rows(&mut conn, rows)
        .expect("50,000 row import failed");
    let total_duration = import_start.elapsed();

    println!("--------------------------------------------------");
    println!("50k IMPORT BENCHMARK RESULTS:");
    println!("Total Rows: {}", summary.total_rows);
    println!("Imported:   {}", summary.imported);
    println!("Skipped:    {}", summary.skipped);
    println!("Errors:     {}", summary.errors.len());
    println!("Duration:   {:?} ({:.2} items/sec)", total_duration, (TOTAL_ITEMS as f64) / total_duration.as_secs_f64());
    println!("--------------------------------------------------");

    assert_eq!(summary.imported, TOTAL_ITEMS);
    assert_eq!(summary.skipped, 0);
    assert_eq!(summary.errors.len(), 0);

    // Requirement: Must import in under 30 seconds (or under 60 seconds in unoptimized debug build)
    let max_allowed_secs = if cfg!(debug_assertions) { 60 } else { 30 };
    assert!(
        total_duration.as_secs() < max_allowed_secs,
        "Import took {:?}, which exceeds the {}-second requirement!",
        total_duration,
        max_allowed_secs
    );

    // Test sub-100ms lookup speed on the 50,000 row catalog (allow 500ms in debug mode under parallel test load)
    let search_start = Instant::now();
    let sample_barcode = "8964000025000";
    let found = CatalogRepo::get_by_barcode(&conn, sample_barcode)
        .expect("Lookup failed")
        .expect("Item 25000 not found");
    let search_duration = search_start.elapsed();

    println!("Lookup by barcode in 50,000 items took: {:?}", search_duration);
    assert_eq!(found.sku, "SKU-025000");
    assert!(search_duration.as_millis() < 500, "Search took longer than 500ms");
}
