// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod printer;

use chrono::Utc;
use pos_core::auth::{Role, UserRepo, UserSession, UserSummary};
use pos_core::backup::{CryptoBackupService, SnapshotInfo, SnapshotManager};
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::db::key::DbKeyManager;
use pos_core::domain::{
    AnalyticsRepo, Brand, BrandRepo, BusinessSettings, CashSession, CatalogRepo, Category,
    CategoryPerformance, CategoryRepo, CompletedReturn, CompletedSale, CreatePartyParams,
    CreateProductParams, CreatePurchaseInput, FinancialSummary, InventoryValuation, KhataRepo,
    Party, PartyRepo, PostReturnRequest, PostSaleRequest, ProductSearchResult, PurchaseInvoice,
    PurchaseRepo, ReturnRepo, SaleRepo, SettingsRepo, ShiftRepo, TopProduct, Unit, UnitRepo,
};
use pos_core::hardware::{ReceiptPayload, ReceiptWidth};
use pos_core::licensing::fingerprint::HardwareFingerprint;
use pos_core::licensing::license::{LicenseStatus, LicenseStore};
use pos_core::error::PosError;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
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

#[derive(Serialize)]
pub struct LowStockReportRow {
    pub sku: String,
    pub name: String,
    pub on_hand: f64,
    pub reorder_point: f64,
    pub unit: String,
    pub supplier: String,
    pub suggested_order: f64,
}

#[derive(Serialize)]
pub struct LicenseInfoResponse {
    pub machine_id: String,
    pub status: String,
    pub tier: String,
    pub days_left: Option<i64>,
    pub can_post_sales: bool,
    pub store_name: String,
}

fn seed_master_data_if_empty(conn: &Connection) -> Result<(), PosError> {
    let units_count: i64 = conn.query_row("SELECT count(*) FROM units", [], |r| r.get(0))?;
    if units_count == 0 {
        let now = Utc::now().to_rfc3339();
        conn.execute("INSERT OR IGNORE INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-pc', 'PC', 'Piece / عدد', 0, ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-pkt', 'PKT', 'Packet / پیکٹ', 0, ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-kg', 'KG', 'Kilogram / کلو', 3, ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-ltr', 'LTR', 'Litre / لٹر', 3, ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-ctn', 'CTN', 'Carton / کاٹن', 0, ?1)", [&now])?;

        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-bev', 'Beverages', 'مشروبات اور چائے', ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-oil', 'Cooking Oil & Ghee', 'گھی اور تیل', ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-dry', 'Dairy & Breakfast', 'ڈیری اور ناشتہ', ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-rice', 'Grains & Pulses', 'اناج اور دالیں', ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-soap', 'Personal Care', 'صابن اور شیمپو', ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO categories (id, name, name_ur, created_at) VALUES ('cat-spc', 'Spices & Recipe Mix', 'مصالحہ جات', ?1)", [&now])?;

        conn.execute("INSERT OR IGNORE INTO parties (id, name, name_ur, party_type, phone, credit_limit_paisa, created_at) VALUES ('cust-walkin', 'Walk-in Customer', 'عام گاہک', 'customer', '03000000000', 0, ?1)", [&now])?;
        conn.execute("INSERT OR IGNORE INTO price_lists (id, name, created_at) VALUES ('retail', 'Retail Price List', ?1)", [&now])?;
    }
    Ok(())
}

fn seed_demo_catalog(conn: &Connection) -> Result<(), PosError> {
    let now = Utc::now().to_rfc3339();
    conn.execute("INSERT OR IGNORE INTO price_lists (id, name, created_at) VALUES ('retail', 'Retail Price List', ?1)", [&now])?;

    let seed_products = [
        ("prod-01", "var-001", "Tapal Danedar Tea 450g", "ٹپال دانے دار چائے ۴۵۰ گرام", "BEV-TEA-450", "8961014001018", "u-pkt", "cat-bev", 62000, 45000),
        ("prod-02", "var-002", "Dalda Cooking Oil 1 Litre Pouch", "ڈالڈا کوکنگ آئل ۱ لٹر پاؤچ", "GRO-OIL-1L", "8961014002022", "u-pc", "cat-oil", 54000, 35000),
        ("prod-03", "var-003", "Olper's Milk 1000ml", "اولپرز دودھ ۱۰۰۰ ملی لٹر", "DRY-MLK-1L", "8961014003036", "u-pc", "cat-dry", 29000, 80000),
        ("prod-04", "var-004", "National Basmati Rice 5kg", "نیشنل باسمتی چاول ۵ کلو", "GRN-RCE-5K", "8961014004043", "u-pc", "cat-rice", 175000, 25000),
        ("prod-05", "var-005", "Lux Beauty Soap 150g", "لکس بیوٹی صابن ۱۵۰ گرام", "SOAP-LUX-150", "8961014005050", "u-pc", "cat-soap", 15000, 100000),
        ("prod-06", "var-006", "Shan Bombay Biryani Masala 50g", "شان بمبئی بریانی مصالحہ ۵۰ گرام", "SPC-BRY-50", "8961014006067", "u-pc", "cat-spc", 11000, 60000),
    ];

    for (pid, vid, name, name_ur, sku, barcode, unit_id, cat_id, price, stock) in seed_products {
        conn.execute(
            "INSERT OR REPLACE INTO products (id, sku, name, name_ur, category_id, base_unit_id, track_mode, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'batch', 1, ?7, ?7)",
            params![pid, sku, name, name_ur, cat_id, unit_id, now],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO product_variants (id, product_id, sku, is_default, attributes_json, created_at) VALUES (?1, ?2, ?3, 1, '{}', ?4)",
            params![vid, pid, sku, now],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO variant_units (id, variant_id, unit_id, factor_to_base, barcode, is_sale_unit, is_purchase_unit, created_at) VALUES (?1, ?2, ?3, 1000, ?4, 1, 1, ?5)",
            params![format!("vu-{}", vid), vid, unit_id, barcode, now],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO barcodes (id, variant_id, value, kind, created_at) VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
            params![format!("bc-{}", vid), vid, barcode, now],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from) VALUES (?1, 'retail', ?2, ?3, ?4, ?5)",
            params![format!("prc-{}", vid), vid, unit_id, price, now],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO inventory_balances (variant_id, on_hand_milli, avg_cost_paisa, last_rebuilt_at) VALUES (?1, ?2, ?3, ?4)",
            params![vid, stock, (price * 85) / 100, now],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO parties (id, name, name_ur, party_type, phone, credit_limit_paisa, created_at) VALUES ('cust-001', 'Haji Abdul Rehman (Kiryana)', 'حاجی عبدالرحمان کریانہ', 'customer', '03001234567', 10000000, ?1)",
        [&now],
    )?;

    Ok(())
}

fn clear_to_fresh_account(conn: &Connection) -> Result<(), PosError> {
    conn.execute("DELETE FROM sale_tenders", [])?;
    conn.execute("DELETE FROM sale_lines", [])?;
    conn.execute("DELETE FROM sales", [])?;
    conn.execute("DELETE FROM return_lines", [])?;
    conn.execute("DELETE FROM returns", [])?;
    conn.execute("DELETE FROM cash_sessions", [])?;
    conn.execute("DELETE FROM party_ledger", [])?;
    conn.execute("DELETE FROM inventory_ledger", [])?;
    conn.execute("DELETE FROM inventory_balances", [])?;
    conn.execute("DELETE FROM sync_outbox", [])?;
    conn.execute("DELETE FROM prices", [])?;
    conn.execute("DELETE FROM barcodes", [])?;
    conn.execute("DELETE FROM variant_units", [])?;
    conn.execute("DELETE FROM product_variants", [])?;
    conn.execute("DELETE FROM products", [])?;
    conn.execute("DELETE FROM parties WHERE id != 'cust-walkin'", [])?;
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

#[derive(Deserialize)]
pub struct FirstOwnerPayload {
    pub username: String,
    pub password: String,
    pub pin: Option<String>,
    pub shop_name: Option<String>,
    pub shop_name_ur: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub account_type: Option<String>, // "demo" or "fresh"
}

#[tauri::command]
fn setup_first_owner(
    state: State<'_, AppState>,
    payload: FirstOwnerPayload,
) -> Result<UserSummary, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let user = UserRepo::create_user(
        &conn,
        &payload.username,
        &payload.password,
        payload.pin.as_deref(),
        Role::Owner,
        None,
    ).map_err(|e| e.to_string())?;

    let now = Utc::now();
    let shop_name = payload.shop_name.unwrap_or_else(|| "Next POS Store".into());
    let settings = BusinessSettings {
        id: "default".into(),
        name: shop_name,
        name_ur: payload.shop_name_ur,
        address: payload.address,
        phone: payload.phone,
        ntn: None,
        strn: None,
        currency: "PKR".into(),
        time_zone: "Asia/Karachi".into(),
        tax_mode: "inclusive".into(),
        negative_stock_policy: "Block".into(),
        enabled_packs: vec!["grocery".into()],
        fbr_enabled: false,
        created_at: now,
        updated_at: now,
    };
    let _ = SettingsRepo::save_or_update(&conn, &settings);

    let is_demo = payload.account_type.as_deref() == Some("demo");
    if is_demo {
        let _ = seed_demo_catalog(&conn);
    } else {
        let _ = clear_to_fresh_account(&conn);
    }

    // Auto login first owner
    let sess = UserRepo::login_password(&conn, &payload.username, &payload.password, &now).map_err(|e| e.to_string())?;
    let mut cur = state.current_user.lock().map_err(|e| e.to_string())?;
    *cur = Some(sess);

    Ok(user)
}

#[tauri::command]
fn reset_store_account(
    state: State<'_, AppState>,
    account_type: String, // "demo" or "fresh"
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if account_type == "demo" {
        seed_demo_catalog(&conn).map_err(|e| e.to_string())?;
    } else {
        clear_to_fresh_account(&conn).map_err(|e| e.to_string())?;
    }
    Ok(())
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
fn list_products_catalog(
    state: State<'_, AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<ProductSearchResult>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    CatalogRepo::list_products(&conn, limit.unwrap_or(100), offset.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_product(
    state: State<'_, AppState>,
    params: CreateProductParams,
) -> Result<ProductSearchResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    CatalogRepo::create_product(&conn, params).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    CategoryRepo::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_category(
    state: State<'_, AppState>,
    name: String,
    name_ur: Option<String>,
    parent_id: Option<String>,
) -> Result<Category, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    CategoryRepo::create(&conn, &name, name_ur.as_deref(), parent_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_brands(state: State<'_, AppState>) -> Result<Vec<Brand>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    BrandRepo::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_brand(
    state: State<'_, AppState>,
    name: String,
    name_ur: Option<String>,
) -> Result<Brand, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    BrandRepo::create(&conn, &name, name_ur.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_units(state: State<'_, AppState>) -> Result<Vec<Unit>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    UnitRepo::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_unit(
    state: State<'_, AppState>,
    code: String,
    name: String,
    decimals_allowed: u8,
) -> Result<Unit, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    UnitRepo::create(&conn, &code, &name, decimals_allowed).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_party(
    state: State<'_, AppState>,
    params: CreatePartyParams,
) -> Result<Party, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    PartyRepo::create_party(&conn, params).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_vendors(state: State<'_, AppState>) -> Result<Vec<Party>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    PartyRepo::list_vendors(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_purchase_invoice(
    state: State<'_, AppState>,
    input: CreatePurchaseInput,
) -> Result<PurchaseInvoice, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    PurchaseRepo::post_purchase(&mut conn, input).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_purchases(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<PurchaseInvoice>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    PurchaseRepo::list_purchases(&conn, limit.unwrap_or(50)).map_err(|e| e.to_string())
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

    if let Ok(Some(existing)) = ShiftRepo::get_active_session(&conn, &user_id) {
        let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
        *act = Some(existing.clone());
        return Ok(existing);
    }

    let session = ShiftRepo::start_shift(&mut conn, &user_id, opening_float_paisa).map_err(|e| e.to_string())?;
    let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act = Some(session.clone());
    Ok(session)
}

#[tauri::command]
fn get_active_shift(
    state: State<'_, AppState>,
) -> Result<Option<CashSession>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let cur_user = state.current_user.lock().map_err(|e| e.to_string())?.clone();
    let user_id = cur_user.map(|u| u.user_id).unwrap_or_else(|| "usr-default".into());
    let session = ShiftRepo::get_active_session(&conn, &user_id).map_err(|e| e.to_string())?;
    let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
    *act = session.clone();
    Ok(session)
}

#[tauri::command]
fn record_cash_drop(
    state: State<'_, AppState>,
    amount_paisa: i64,
    reason: String,
) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let cur_shift = state.active_shift.lock().map_err(|e| e.to_string())?.clone();
    let shift_id = if let Some(s) = cur_shift {
        s.id
    } else {
        let cur_user = state.current_user.lock().map_err(|e| e.to_string())?.clone();
        let user_id = cur_user.map(|u| u.user_id).unwrap_or_else(|| "usr-default".into());
        ShiftRepo::get_active_session(&conn, &user_id)
            .map_err(|e| e.to_string())?
            .map(|s| s.id)
            .ok_or_else(|| "No active shift to record cash drop".to_string())?
    };
    ShiftRepo::record_cash_drop(&mut conn, &shift_id, amount_paisa, &reason).map_err(|e| e.to_string())
}

#[tauri::command]
fn close_shift(
    state: State<'_, AppState>,
    closing_counted_cash_paisa: i64,
) -> Result<pos_core::domain::ZReportData, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let cur_user = state.current_user.lock().map_err(|e| e.to_string())?.clone();
    let user_id = cur_user.map(|u| u.user_id).unwrap_or_else(|| "usr-default".into());

    let mut act = state.active_shift.lock().map_err(|e| e.to_string())?;
    let shift_id = if let Some(ref s) = *act {
        s.id.clone()
    } else {
        ShiftRepo::get_active_session(&conn, &user_id)
            .map_err(|e| e.to_string())?
            .map(|s| s.id)
            .ok_or_else(|| "No active shift to close".to_string())?
    };

    let zreport = ShiftRepo::close_shift(&mut conn, &shift_id, closing_counted_cash_paisa).map_err(|e| e.to_string())?;
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
fn get_category_performance(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<CategoryPerformance>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let start = start_date.unwrap_or_else(|| "1970-01-01T00:00:00Z".into());
    let end = end_date.unwrap_or_else(|| "2099-12-31T23:59:59Z".into());
    AnalyticsRepo::get_category_performance(&conn, &start, &end).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_top_products(
    state: State<'_, AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<TopProduct>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let start = start_date.unwrap_or_else(|| "1970-01-01T00:00:00Z".into());
    let end = end_date.unwrap_or_else(|| "2099-12-31T23:59:59Z".into());
    AnalyticsRepo::get_top_products(&conn, &start, &end, limit.unwrap_or(10)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_inventory_valuation(
    state: State<'_, AppState>,
) -> Result<InventoryValuation, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    AnalyticsRepo::get_inventory_valuation(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_low_stock_report(
    state: State<'_, AppState>,
) -> Result<Vec<LowStockReportRow>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT pv.sku, p.name,
                COALESCE(ib.on_hand_milli, 0) as on_hand_milli,
                COALESCE(p.reorder_point_milli, 10000) as reorder_milli,
                COALESCE(u.code, 'PC') as unit_code,
                COALESCE(pt.name, 'General Supplier') as supplier
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         LEFT JOIN inventory_balances ib ON pv.id = ib.variant_id
         LEFT JOIN units u ON p.unit_id = u.id
         LEFT JOIN parties pt ON pt.party_type = 'vendor'
         WHERE COALESCE(ib.on_hand_milli, 0) <= COALESCE(p.reorder_point_milli, 10000)
         GROUP BY pv.id
         ORDER BY on_hand_milli ASC
         LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        let on_hand_milli: i64 = r.get(2)?;
        let reorder_milli: i64 = r.get(3)?;
        let on_hand = on_hand_milli as f64 / 1000.0;
        let reorder_point = reorder_milli as f64 / 1000.0;
        let suggested = (reorder_point * 2.0 - on_hand).max(1.0);
        Ok(LowStockReportRow {
            sku: r.get(0)?,
            name: r.get(1)?,
            on_hand,
            reorder_point,
            unit: r.get(4)?,
            supplier: r.get(5)?,
            suggested_order: suggested.round(),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            result.push(item);
        }
    }
    Ok(result)
}

#[tauri::command]
fn create_live_snapshot(
    state: State<'_, AppState>,
) -> Result<SnapshotInfo, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let snap_dir = DbKeyManager::default_key_dir().join("snapshots");
    let info = SnapshotManager::create_snapshot(&conn, &snap_dir).map_err(|e| e.to_string())?;
    let _ = SnapshotManager::rotate_snapshots(&snap_dir, 24);
    Ok(info)
}

#[tauri::command]
fn list_database_snapshots() -> Result<Vec<SnapshotInfo>, String> {
    let snap_dir = DbKeyManager::default_key_dir().join("snapshots");
    if !snap_dir.exists() {
        return Ok(Vec::new());
    }
    let mut snapshots = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&snap_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().map(|e| e == "kdb" || e == "db").unwrap_or(false) {
                if let Ok(meta) = entry.metadata() {
                    let created = meta.created().or_else(|_| meta.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                    let created_str = chrono::DateTime::<Utc>::from(created).to_rfc3339();
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let path_str = path.to_string_lossy().to_string();
                    snapshots.push(SnapshotInfo {
                        path: path_str,
                        filename,
                        file_size_bytes: meta.len(),
                        created_at: created_str,
                        is_valid: meta.len() > 0,
                    });
                }
            }
        }
    }
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

#[tauri::command]
fn get_machine_identifier() -> Result<String, String> {
    Ok(HardwareFingerprint::get_machine_id())
}

#[tauri::command]
fn get_license_info(state: State<'_, AppState>) -> Result<LicenseInfoResponse, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let machine_id = HardwareFingerprint::get_machine_id();
    let now = Utc::now();
    let status = LicenseStore::current_status(&conn, &machine_id, &now, None).map_err(|e| e.to_string())?;

    let store_name = SettingsRepo::get(&conn).map(|s| s.name).unwrap_or_else(|_| "Next POS Retail Store".into());

    let (status_str, tier_str, days_left) = match &status {
        LicenseStatus::Active { tier, days_left, .. } => {
            ("active".into(), format!("{:?}", tier), *days_left)
        }
        LicenseStatus::GracePeriod { tier, grace_days_left, .. } => {
            ("grace_period".into(), format!("{:?}", tier), Some(*grace_days_left))
        }
        LicenseStatus::TrialActive { days_left, .. } => {
            ("trial".into(), "Trial".into(), Some(*days_left))
        }
        LicenseStatus::Expired => ("expired".into(), "None".into(), Some(0)),
        LicenseStatus::MachineMismatch { .. } => ("machine_mismatch".into(), "None".into(), None),
        LicenseStatus::InvalidSignature => ("invalid_signature".into(), "None".into(), None),
        LicenseStatus::MalformedToken => ("malformed_token".into(), "None".into(), None),
        LicenseStatus::ClockTampered => ("clock_tampered".into(), "None".into(), None),
    };

    Ok(LicenseInfoResponse {
        machine_id,
        status: status_str,
        tier: tier_str,
        days_left,
        can_post_sales: status.can_post_sales(),
        store_name,
    })
}

#[tauri::command]
fn activate_license_token(state: State<'_, AppState>, token: String) -> Result<LicenseInfoResponse, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let machine_id = HardwareFingerprint::get_machine_id();
    let now = Utc::now();
    LicenseStore::install_token(&conn, &token, &machine_id, &now, None).map_err(|e| e.to_string())?;
    drop(conn);
    get_license_info(state)
}

#[tauri::command]
fn export_backup(
    state: State<'_, AppState>,
    password: String,
    destination_file: Option<String>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let dest_path = if let Some(dest) = destination_file.filter(|s| !s.trim().is_empty()) {
        std::path::PathBuf::from(dest)
    } else {
        let backup_dir = DbKeyManager::default_key_dir().join("backups");
        let _ = std::fs::create_dir_all(&backup_dir);
        let time_str = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        backup_dir.join(format!("backup_{}.kpos", time_str))
    };

    if let Some(parent) = dest_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let manifest = CryptoBackupService::export_backup(
        &conn,
        &dest_path,
        &password,
    ).map_err(|e| e.to_string())?;

    Ok(format!(
        "Backup created: {} ({:.1} KB, schema V{})",
        dest_path.display(),
        manifest.payload_size_bytes as f64 / 1024.0,
        manifest.schema_version
    ))
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

#[derive(Serialize)]
pub struct CloudSyncResult {
    pub success: bool,
    pub synced_count: i64,
    pub message: String,
}

#[tauri::command]
async fn sync_to_cloud(state: State<'_, AppState>) -> Result<CloudSyncResult, String> {
    let (shop_id, shop_name, unsynced_events) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let shop_name = SettingsRepo::get(&conn).map(|s| s.name).unwrap_or_else(|_| "Al-Rehman General Store".into());
        let shop_id = pos_core::licensing::HardwareFingerprint::get_machine_id();

        let mut stmt = conn.prepare(
            "SELECT event_id, event_type, payload_json, occurred_at FROM sync_outbox WHERE synced_at IS NULL ORDER BY occurred_at ASC LIMIT 50"
        ).map_err(|e| e.to_string())?;

        let events = stmt.query_map([], |r| {
            let event_id: String = r.get(0)?;
            let event_type: String = r.get(1)?;
            let payload_str: String = r.get(2)?;
            let occurred_at: String = r.get(3)?;
            let payload: serde_json::Value = serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null);
            Ok(serde_json::json!({
                "event_id": event_id,
                "event_type": event_type,
                "payload": payload,
                "occurred_at": occurred_at
            }))
        }).map_err(|e| e.to_string())?
        .collect::<std::result::Result<Vec<serde_json::Value>, _>>()
        .map_err(|e| e.to_string())?;

        (shop_id, shop_name, events)
    };

    if unsynced_events.is_empty() {
        return Ok(CloudSyncResult {
            success: true,
            synced_count: 0,
            message: "No pending events. All transactions are up to date on Supabase!".into(),
        });
    }

    let count = unsynced_events.len();
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "p_shop_id": shop_id,
        "p_shop_name": shop_name,
        "p_events": unsynced_events
    });

    let res = client.post("https://gdmsdcbiewgpqkuqlpfc.supabase.co/rest/v1/rpc/sync_shop_events")
        .header("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkbXNkY2JpZXdncHFrdXFscGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTk4ODUsImV4cCI6MjEwOTE3NTg4NX0.0dubMeBrXpgowmRXXKVx8988LfcAQOKWAvwucQja2jc")
        .header("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkbXNkY2JpZXdncHFrdXFscGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTk4ODUsImV4cCI6MjEwOTE3NTg4NX0.0dubMeBrXpgowmRXXKVx8988LfcAQOKWAvwucQja2jc")
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Supabase Cloud: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Supabase sync rejected: {}", err_text));
    }

    // Mark events as synced in local DB
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().to_rfc3339();
        let _ = conn.execute("UPDATE sync_outbox SET synced_at = ?1 WHERE synced_at IS NULL", [&now]);
    }

    Ok(CloudSyncResult {
        success: true,
        synced_count: count as i64,
        message: format!("Successfully synced {} events to Supabase Cloud!", count),
    })
}

#[tauri::command]
fn list_system_printers() -> Result<Vec<String>, String> {
    Ok(printer::list_system_printers())
}

#[tauri::command]
fn print_raw_escpos(
    printer_name: Option<String>,
    raw_bytes: Vec<u8>,
) -> Result<(), String> {
    printer::print_bytes(printer_name.as_deref(), "ESC/POS Stream", &raw_bytes)
        .map_err(|e| format!("Printing failed: {}", e))
}

#[tauri::command]
fn kick_cash_drawer(printer_name: Option<String>) -> Result<(), String> {
    printer::kick_drawer(printer_name.as_deref())
        .map_err(|e| format!("Drawer kick failed: {}", e))
}

#[tauri::command]
fn cut_printer_paper(printer_name: Option<String>) -> Result<(), String> {
    printer::cut_paper(printer_name.as_deref())
        .map_err(|e| format!("Paper cut failed: {}", e))
}

#[tauri::command]
fn print_sale_receipt(
    printer_name: Option<String>,
    width: Option<String>,
    payload: ReceiptPayload,
) -> Result<(), String> {
    let roll_width = match width.as_deref() {
        Some("80mm") => ReceiptWidth::Width80mm,
        _ => ReceiptWidth::Width58mm,
    };
    printer::print_sale_receipt(printer_name.as_deref(), roll_width, &payload)
        .map_err(|e| format!("Receipt printing failed: {}", e))
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
            list_products_catalog,
            create_product,
            list_categories,
            create_category,
            list_brands,
            create_brand,
            list_units,
            create_unit,
            create_party,
            list_vendors,
            create_purchase_invoice,
            list_purchases,
            post_sale,
            get_recent_sales,
            post_return,
            open_shift,
            get_active_shift,
            record_cash_drop,
            close_shift,
            list_khata_parties,
            get_khata_statement,
            get_reports_summary,
            get_category_performance,
            get_top_products,
            get_inventory_valuation,
            get_low_stock_report,
            export_backup,
            restore_backup,
            create_live_snapshot,
            list_database_snapshots,
            get_machine_identifier,
            get_license_info,
            activate_license_token,
            sync_to_cloud,
            reset_store_account,
            list_system_printers,
            print_raw_escpos,
            kick_cash_drawer,
            cut_printer_paper,
            print_sale_receipt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
