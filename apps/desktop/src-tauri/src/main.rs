// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use pos_core::auth::{Role, UserRepo, UserSession, UserSummary};
use pos_core::backup::CryptoBackupService;
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::db::key::DbKeyManager;
use pos_core::domain::{
    AnalyticsRepo, CashSession, CatalogRepo, CompletedSale, FinancialSummary,
    KhataRepo, PostSaleRequest, ProductSearchResult,
    ReturnRepo, PostReturnRequest, CompletedReturn, SaleRepo, SettingsRepo, ShiftRepo,
};
use pos_core::error::PosError;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub current_user: Mutex<Option<UserSession>>,
    pub active_shift: Mutex<Option<CashSession>>,
}

#[derive(Serialize)]
pub struct SystemStatus {
    pub pos_core_version: &'static str,
    pub is_first_run: bool,
    pub database_encrypted: bool,
    pub current_user: Option<UserSession>,
    pub active_shift: Option<CashSession>,
    pub license_status: String,
    pub store_name: String,
}

#[derive(Serialize)]
pub struct SaleHistoryRow {
    pub id: String,
    pub doc_no: String,
    pub party_name: String,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub grand_total_paisa: i64,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct KhataPartySummary {
    pub id: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub party_type: String,
    pub phone: Option<String>,
    pub balance_paisa: i64,
    pub credit_limit_paisa: i64,
}

fn seed_master_data_if_empty(conn: &Connection) -> Result<(), PosError> {
    let units_count: i64 = conn.query_row("SELECT count(*) FROM units", [], |r| r.get(0))?;
    if units_count == 0 {
        let now = Utc::now().to_rfc3339();
        conn.execute("INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-pc', 'PC', 'Piece / عدد', 0, ?1)", [&now])?;
        conn.execute("INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-pkt', 'PKT', 'Packet / پیکٹ', 0, ?1)", [&now])?;
        conn.execute("INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-kg', 'KG', 'Kilogram / کلو', 3, ?1)", [&now])?;
        conn.execute("INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-ltr', 'LTR', 'Litre / لٹر', 3, ?1)", [&now])?;
        conn.execute("INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-ctn', 'CTN', 'Carton / کاٹن', 0, ?1)", [&now])?;

        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-bev', 'Beverages', 'مشروبات اور چائے', ?1)", [&now])?;
        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-oil', 'Cooking Oil & Ghee', 'گھی اور تیل', ?1)", [&now])?;
        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-dry', 'Dairy & Breakfast', 'ڈیری اور ناشتہ', ?1)", [&now])?;
        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-rice', 'Grains & Pulses', 'اناج اور دالیں', ?1)", [&now])?;
        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-soap', 'Personal Care', 'صابن اور شیمپو', ?1)", [&now])?;
        conn.execute("INSERT INTO categories (id, name, name_ur, created_at) VALUES ('cat-spc', 'Spices & Recipe Mix', 'مصالحہ جات', ?1)", [&now])?;

        conn.execute("INSERT INTO parties (id, name, name_ur, party_type, phone, credit_limit_paisa, created_at) VALUES ('cust-walkin', 'Walk-in Customer', 'عام گاہک', 'customer', '03000000000', 0, ?1)", [&now])?;
        conn.execute("INSERT INTO parties (id, name, name_ur, party_type, phone, credit_limit_paisa, created_at) VALUES ('cust-001', 'Haji Abdul Rehman (Kiryana)', 'حاجی عبدالرحمان کریانہ', 'customer', '03001234567', 10000000, ?1)", [&now])?;

        // Products with real packaging & barcode
        let seed_products = [
            ("prod-01", "var-001", "Tapal Danedar Tea 450g", "ٹپال دانے دار چائے ۴۵۰ گرام", "BEV-TEA-450", "8961014001018", "u-pkt", "cat-bev", 62000, 50000),
            ("prod-02", "var-002", "Dalda Cooking Oil 1 Litre Pouch", "ڈالڈا کوکنگ آئل ۱ لٹر پاؤچ", "GRO-OIL-1L", "8961014002022", "u-pc", "cat-oil", 54000, 40000),
            ("prod-03", "var-003", "Olper's Milk 1000ml", "اولپرز دودھ ۱۰۰۰ ملی لٹر", "DRY-MLK-1L", "8961014003036", "u-pc", "cat-dry", 29000, 80000),
            ("prod-04", "var-004", "National Basmati Rice 5kg", "نیشنل باسمتی چاول ۵ کلو", "GRN-RCE-5K", "8961014004043", "u-pc", "cat-rice", 175000, 20000),
            ("prod-05", "var-005", "Lux Beauty Soap 150g", "لکس بیوٹی صابن ۱۵۰ گرام", "SOAP-LUX-150", "8961014005050", "u-pc", "cat-soap", 15000, 100000),
            ("prod-06", "var-006", "Shan Bombay Biryani Masala 50g", "شان بمبئی بریانی مصالحہ ۵۰ گرام", "SPC-BRY-50", "8961014006067", "u-pc", "cat-spc", 11000, 60000),
        ];

        for (pid, vid, name, name_ur, sku, barcode, unit_id, cat_id, price, stock) in seed_products {
            conn.execute(
                "INSERT INTO products (id, name, name_ur, category_id, base_unit_id, track_inventory, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
                params![pid, name, name_ur, cat_id, unit_id, now],
            )?;
            conn.execute(
                "INSERT INTO product_variants (id, product_id, sku, barcode, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![vid, pid, sku, barcode, now],
            )?;
            conn.execute(
                "INSERT INTO packaging_units (id, variant_id, unit_id, conversion_factor_milli, is_base_unit, barcode, created_at) VALUES (?1, ?2, ?3, 1000, 1, ?4, ?5)",
                params![format!("pkg-{}", vid), vid, unit_id, barcode, now],
            )?;
            conn.execute(
                "INSERT INTO price_list_items (id, price_list_id, variant_id, packaging_unit_id, unit_price_paisa, created_at) VALUES (?1, 'retail', ?2, ?3, ?4, ?5)",
                params![format!("prc-{}", vid), vid, format!("pkg-{}", vid), price, now],
            )?;
            conn.execute(
                "INSERT INTO inventory_balances (variant_id, quantity_milli, moving_average_cost_paisa, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![vid, stock, (price * 85) / 100, now],
            )?;
        }
    }
    Ok(())
}

fn open_app_database() -> Result<Connection, PosError> {
    let key_dir = DbKeyManager::default_key_dir();
    let key_file = key_dir.join("master.key");
    let (key, _is_new) = DbKeyManager::load_or_create_key(&key_file)?;
    let db_path = key_dir.join("nextpos.db");
    let mut conn = open_encrypted_db(&db_path, &key)?;
    run_migrations(&mut conn)?;
    seed_master_data_if_empty(&conn)?;
    Ok(conn)
}

// ---------------- TAURI IPC COMMANDS ----------------

#[tauri::command]
fn get_system_status(state: State<'_, AppState>) -> Result<SystemStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let is_first_run = UserRepo::needs_first_owner(&conn).map_err(|e| e.to_string())?;
    let cur_user = state.current_user.lock().map_err(|e| e.to_string())?.clone();
    let cur_shift = state.active_shift.lock().map_err(|e| e.to_string())?.clone();

    let settings = SettingsRepo::get(&conn).ok();
    let store_name = settings.map(|s| s.name).unwrap_or_else(|| "Next POS (کاروبار پی او ایس)".into());

    Ok(SystemStatus {
        pos_core_version: pos_core::pos_core_version(),
        is_first_run,
        database_encrypted: true,
        current_user: cur_user,
        active_shift: cur_shift,
        license_status: "Active (Offline Permanent)".into(),
        store_name,
    })
}

#[tauri::command]
fn setup_first_owner(
    state: State<'_, AppState>,
    username: String,
    password: String,
    pin: Option<String>,
) -> Result<UserSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user = UserRepo::create_user(
        &conn,
        &username,
        &password,
        pin.as_deref(),
        Role::Owner,
        None,
    ).map_err(|e| e.to_string())?;

    // Auto login first owner
    let now = Utc::now();
    let sess = UserRepo::login_password(&conn, &username, &password, &now).map_err(|e| e.to_string())?;
    let mut cur = state.current_user.lock().map_err(|e| e.to_string())?;
    *cur = Some(sess);

    Ok(user)
}

#[tauri::command]
fn login_with_password(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<UserSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now();
    let sess = UserRepo::login_password(&conn, &username, &password, &now).map_err(|e| e.to_string())?;
    let mut cur = state.current_user.lock().map_err(|e| e.to_string())?;
    *cur = Some(sess.clone());

    // Restore active shift for user if any
    let shift = ShiftRepo::get_active_session(&conn, &sess.user_id).map_err(|e| e.to_string())?;
    let mut act_shift = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act_shift = shift;

    Ok(sess)
}

#[tauri::command]
fn login_with_pin(
    state: State<'_, AppState>,
    user_id: String,
    pin: String,
) -> Result<UserSession, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = Utc::now();
    let sess = UserRepo::login_pin(&conn, &user_id, &pin, &now).map_err(|e| e.to_string())?;
    let mut cur = state.current_user.lock().map_err(|e| e.to_string())?;
    *cur = Some(sess.clone());

    let shift = ShiftRepo::get_active_session(&conn, &sess.user_id).map_err(|e| e.to_string())?;
    let mut act_shift = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act_shift = shift;

    Ok(sess)
}

#[tauri::command]
fn list_active_users(state: State<'_, AppState>) -> Result<Vec<UserSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    UserRepo::list_users(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn logout_user(state: State<'_, AppState>) -> Result<(), String> {
    let mut cur = state.current_user.lock().map_err(|e| e.to_string())?;
    *cur = None;
    let mut act_shift = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act_shift = None;
    Ok(())
}

#[tauri::command]
fn search_products(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<ProductSearchResult>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if query.trim().is_empty() {
        CatalogRepo::list_products(&conn, 50, 0).map_err(|e| e.to_string())
    } else {
        CatalogRepo::search(&conn, &query, 50).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn post_sale(
    state: State<'_, AppState>,
    mut request: PostSaleRequest,
) -> Result<CompletedSale, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    
    // Auto attach current shift if open
    let cur_shift = state.active_shift.lock().map_err(|e| e.to_string())?.clone();
    if request.cash_session_id.is_none() {
        if let Some(s) = cur_shift {
            request.cash_session_id = Some(s.id);
        }
    }

    SaleRepo::post_sale(&mut conn, request).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recent_sales(
    state: State<'_, AppState>,
    limit: i64,
) -> Result<Vec<SaleHistoryRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT s.id, s.doc_no, coalesce(p.name, 'Walk-in Customer') as party_name,
                s.subtotal_paisa, s.discount_paisa, s.tax_paisa, s.total_paisa, s.created_at
         FROM sales s
         LEFT JOIN parties p ON p.id = s.party_id
         ORDER BY s.created_at DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![limit], |r| {
        Ok(SaleHistoryRow {
            id: r.get(0)?,
            doc_no: r.get(1)?,
            party_name: r.get(2)?,
            subtotal_paisa: r.get(3)?,
            discount_paisa: r.get(4)?,
            tax_paisa: r.get(5)?,
            grand_total_paisa: r.get(6)?,
            created_at: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<std::result::Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
fn post_return(
    state: State<'_, AppState>,
    request: PostReturnRequest,
) -> Result<CompletedReturn, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    ReturnRepo::post_return(&mut conn, request).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_shift(
    state: State<'_, AppState>,
    opening_float_paisa: i64,
) -> Result<CashSession, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let cur_user = state.current_user.lock().map_err(|e| e.to_string())?.clone();
    let user_id = cur_user.map(|u| u.user_id).unwrap_or_else(|| "usr-default".into());

    let session = ShiftRepo::start_shift(&mut conn, &user_id, opening_float_paisa).map_err(|e| e.to_string())?;
    let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act = Some(session.clone());
    Ok(session)
}

#[tauri::command]
fn close_shift(
    state: State<'_, AppState>,
    closing_counted_cash_paisa: i64,
) -> Result<pos_core::domain::ZReportData, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let cur_shift = state.active_shift.lock().map_err(|e| e.to_string())?.clone();
    let shift_id = cur_shift.map(|s| s.id).ok_or_else(|| "No active shift to close".to_string())?;

    let zreport = ShiftRepo::close_shift(&mut conn, &shift_id, closing_counted_cash_paisa).map_err(|e| e.to_string())?;
    let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act = None;
    Ok(zreport)
}

#[tauri::command]
fn list_khata_parties(
    state: State<'_, AppState>,
    party_type: String,
) -> Result<Vec<KhataPartySummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.name_ur, p.party_type, p.phone,
                coalesce(b.balance_paisa, 0) as balance_paisa, p.credit_limit_paisa
         FROM parties p
         LEFT JOIN khata_balances b ON b.party_id = p.id
         WHERE p.party_type = ?1 ORDER BY p.name ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![party_type], |r| {
        Ok(KhataPartySummary {
            id: r.get(0)?,
            name: r.get(1)?,
            name_ur: r.get(2)?,
            party_type: r.get(3)?,
            phone: r.get(4)?,
            balance_paisa: r.get(5)?,
            credit_limit_paisa: r.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<std::result::Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
fn get_khata_statement(
    state: State<'_, AppState>,
    party_id: String,
) -> Result<pos_core::domain::KhataStatement, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    KhataRepo::get_statement(&conn, &party_id, "1970-01-01T00:00:00Z", "2099-12-31T23:59:59Z").map_err(|e| e.to_string())
}

#[tauri::command]
fn get_reports_summary(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<FinancialSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let start = start_date.unwrap_or_else(|| "1970-01-01T00:00:00Z".into());
    let end = end_date.unwrap_or_else(|| "2099-12-31T23:59:59Z".into());
    AnalyticsRepo::get_financial_summary(&conn, &start, &end).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_backup(
    state: State<'_, AppState>,
    password: String,
    destination_file: String,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let manifest = CryptoBackupService::export_backup(
        &conn,
        std::path::Path::new(&destination_file),
        &password,
    ).map_err(|e| e.to_string())?;
    Ok(format!("Backup created: {} bytes, schema V{}", manifest.payload_size_bytes, manifest.schema_version))
}

#[tauri::command]
fn restore_backup(
    _state: State<'_, AppState>,
    password: String,
    backup_file: String,
) -> Result<String, String> {
    let key_dir = DbKeyManager::default_key_dir();
    let key_file = key_dir.join("master.key");
    let (key, _) = DbKeyManager::load_or_create_key(&key_file).map_err(|e| e.to_string())?;
    let db_path = key_dir.join("nextpos.db");

    let report = CryptoBackupService::restore_backup(
        std::path::Path::new(&backup_file),
        &db_path,
        &password,
        &key,
    ).map_err(|e| e.to_string())?;

    Ok(format!("Restored successfully! Safety copy: {:?}", report.safety_copy_path))
}

fn main() {
    println!(
        "Next POS Desktop Shell - initializing with pos-core v{}",
        pos_core::pos_core_version()
    );

    let conn = match open_app_database() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("CRITICAL: Failed to open encrypted database: {}", e);
            panic!("Database initialization failed: {}", e);
        }
    };

    let app_state = AppState {
        db: Mutex::new(conn),
        current_user: Mutex::new(None),
        active_shift: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            setup_first_owner,
            login_with_password,
            login_with_pin,
            list_active_users,
            logout_user,
            search_products,
            post_sale,
            get_recent_sales,
            post_return,
            open_shift,
            close_shift,
            list_khata_parties,
            get_khata_statement,
            get_reports_summary,
            export_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
