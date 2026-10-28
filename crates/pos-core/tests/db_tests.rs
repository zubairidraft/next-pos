use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::db::key::DbKeyManager;
use tempfile::NamedTempFile;

#[test]
fn test_database_connection_and_migrations() {
    let temp_db = NamedTempFile::new().expect("Failed to create temporary file");
    let db_path = temp_db.path();
    let key = DbKeyManager::generate_random_key();

    // 1. Open encrypted database
    let mut conn = open_encrypted_db(db_path, &key).expect("Failed to open encrypted database");

    // 2. Verify WAL mode and foreign keys active
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |row| row.get(0))
        .expect("Failed to read journal_mode");
    assert_eq!(journal_mode.to_uppercase(), "WAL");

    let foreign_keys: i64 = conn
        .query_row("PRAGMA foreign_keys;", [], |row| row.get(0))
        .expect("Failed to read foreign_keys");
    assert_eq!(foreign_keys, 1);

    // 3. Run baseline refinery migrations
    run_migrations(&mut conn).expect("Failed to run baseline migrations");

    // 4. Verify baseline tables exist
    let table_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('business_settings', 'users', 'products', 'sales', 'stock_movements', 'inventory_balances', 'party_ledger');",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query tables");
    assert_eq!(table_count, 7);

    // 5. Verify document sequence seed
    let next_sale_no: i64 = conn
        .query_row(
            "SELECT next_no FROM document_sequences WHERE doc_type = 'sale';",
            [],
            |row| row.get(0),
        )
        .expect("Failed to query document_sequences");
    assert_eq!(next_sale_no, 1);

    // 6. Verify foreign key enforcement
    let invalid_insert = conn.execute(
        "INSERT INTO products (id, sku, name, base_unit_id, created_at, updated_at) VALUES ('01HXYZ', 'SKU-1', 'Test', 'NON_EXISTENT_UNIT', datetime('now'), datetime('now'));",
        [],
    );
    assert!(
        invalid_insert.is_err(),
        "Foreign key constraint violation should be rejected"
    );
}
