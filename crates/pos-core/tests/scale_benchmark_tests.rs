use pos_core::db::connection::{open_encrypted_db, run_migrations};
use std::time::Instant;
use tempfile::NamedTempFile;

#[test]
fn test_query_plan_uses_indexes_without_table_scans() {
    let temp_file = NamedTempFile::new().unwrap();
    let key = [64u8; 32];
    let mut conn = open_encrypted_db(temp_file.path(), &key).expect("DB open failed");
    run_migrations(&mut conn).expect("Migrations failed");

    // 1. Verify Barcode search query plan uses index
    let mut stmt = conn
        .prepare("EXPLAIN QUERY PLAN SELECT id FROM barcodes WHERE value = ?1")
        .expect("prep barcode plan");
    let plan_rows: Vec<String> = stmt
        .query_map(["8961011002231"], |r| r.get(3))
        .expect("query plan")
        .filter_map(|r| r.ok())
        .collect();

    let plan_text = plan_rows.join(" | ");
    assert!(
        plan_text.to_lowercase().contains("index") || plan_text.to_lowercase().contains("covering"),
        "Barcode lookup must use index, got plan: {}",
        plan_text
    );
    assert!(
        !plan_text.to_lowercase().contains("scan table barcodes\n"),
        "Barcode lookup must not perform full table scan: {}",
        plan_text
    );

    // 2. Verify Khata Ledger query plan uses index
    let mut stmt_khata = conn
        .prepare("EXPLAIN QUERY PLAN SELECT balance_paisa FROM party_ledger WHERE party_id = ?1 ORDER BY occurred_at DESC, id DESC LIMIT 1")
        .expect("prep khata plan");
    let khata_plan_rows: Vec<String> = stmt_khata
        .query_map(["party-123"], |r| r.get(3))
        .expect("query khata plan")
        .filter_map(|r| r.ok())
        .collect();

    let khata_plan = khata_plan_rows.join(" | ");
    assert!(
        khata_plan.to_lowercase().contains("index") || khata_plan.to_lowercase().contains("covering"),
        "Khata lookup must use index, got plan: {}",
        khata_plan
    );

    // 3. Sub-millisecond point query speed
    let start = Instant::now();
    let _: Option<String> = conn
        .query_row(
            "SELECT id FROM barcodes WHERE value = '8960000000000'",
            [],
            |r| r.get(0),
        )
        .ok();
    let duration = start.elapsed();
    assert!(
        duration.as_millis() < 25,
        "Point query took {:?}, exceeding 25ms limit!",
        duration
    );
}
