// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Tauri shell: every command is a thin wrapper around `pos_core::app::PosApp`,
//! which checks the login session and permissions itself. The UI never talks to
//! the database directly and never supplies prices, tax, cashier or shift.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use pos_core::app::*;
use pos_core::auth::UserSummary;
use pos_core::backup::{BackupManifest, RestoreReport, SnapshotInfo};
use pos_core::domain::analytics::{CategoryPerformance, FinancialSummary, InventoryValuation, TopProduct};
use pos_core::domain::brand::Brand;
use pos_core::domain::cart::ParkedCartSummary;
use pos_core::domain::catalog::{CreateProductParams, ProductDetail, ProductSearchResult, UpdateProductInput};
use pos_core::domain::category::Category;
use pos_core::domain::importer::ImportSummary;
use pos_core::domain::inventory::InventoryBalanceView;
use pos_core::domain::khata::{AgingReportBucket, KhataStatement, PaymentAllocationResult};
use pos_core::domain::purchase::{CreatePurchaseInput, PurchaseInvoice};
use pos_core::domain::refund::CompletedReturn;
use pos_core::domain::settings::BusinessSettings;
use pos_core::domain::shift::{CashSession, ZReportData};
use pos_core::domain::stock_count::{RecordCountItemInput, StockCountSession};
use pos_core::domain::unit::Unit;
use pos_core::hardware::ReceiptWidth;
use pos_core::history::*;
use pos_core::licensing::LicenseStatus;
use serde::Serialize;
use pos_core::app::lan::{LanDevice, LanHub, SharedApp};
use tauri::{AppHandle, Emitter, Manager, State};

mod printer;

/// The app, or the reason it could not open the database (shown on screen).
/// Shared with the phone link, which runs phones' commands on the same app.
struct Core(SharedApp);

type R<T> = std::result::Result<T, String>;

fn with<T>(core: &State<Core>, f: impl FnOnce(&mut PosApp) -> pos_core::error::Result<T>) -> R<T> {
    let mut guard = core.0.lock().map_err(|_| "Internal error: app state is locked".to_string())?;
    match guard.as_mut() {
        Ok(app) => f(app).map_err(|e| e.to_string()),
        Err(e) => Err(format!("The shop database could not be opened: {}", e)),
    }
}

#[derive(Serialize)]
struct StartupInfo {
    ok: bool,
    error: Option<String>,
    status: Option<AppStatus>,
}

#[derive(Serialize)]
struct LicenseInfo {
    status: LicenseStatus,
    machine_id: String,
}

#[derive(Serialize)]
struct RecalledCart {
    customer_id: Option<String>,
    lines: Vec<CheckoutLineInputOut>,
}

// ------------------------------------------------------------ status / auth

#[tauri::command(rename_all = "snake_case")]
fn app_status(core: State<Core>) -> StartupInfo {
    let guard = match core.0.lock() {
        Ok(g) => g,
        Err(_) => return StartupInfo { ok: false, error: Some("Internal error".into()), status: None },
    };
    match guard.as_ref() {
        Ok(app) => match app.status() {
            Ok(s) => StartupInfo { ok: true, error: None, status: Some(s) },
            Err(e) => StartupInfo { ok: false, error: Some(e.to_string()), status: None },
        },
        Err(e) => StartupInfo { ok: false, error: Some(e.clone()), status: None },
    }
}

#[tauri::command(rename_all = "snake_case")]
fn setup_first_run(core: State<Core>, store: StoreSetupInput, owner: OwnerSetupInput) -> R<SetupResult> {
    with(&core, |a| a.setup_first_run(store, owner))
}

#[tauri::command(rename_all = "snake_case")]
fn login_password(core: State<Core>, username: String, password: String) -> R<SessionInfo> {
    with(&core, |a| a.login_password(&username, &password))
}

#[tauri::command(rename_all = "snake_case")]
fn login_pin(core: State<Core>, user_id: String, pin: String) -> R<SessionInfo> {
    with(&core, |a| a.login_pin(&user_id, &pin))
}

#[tauri::command(rename_all = "snake_case")]
fn logout(core: State<Core>) -> R<()> {
    with(&core, |a| a.logout())
}

#[tauri::command(rename_all = "snake_case")]
fn reveal_recovery_phrase(core: State<Core>, password: String) -> R<String> {
    with(&core, |a| a.reveal_recovery_phrase(&password))
}

#[tauri::command(rename_all = "snake_case")]
fn list_users(core: State<Core>) -> R<Vec<UserSummary>> {
    with(&core, |a| a.list_users())
}

#[tauri::command(rename_all = "snake_case")]
fn create_user(core: State<Core>, input: NewUserInput) -> R<UserSummary> {
    with(&core, |a| a.create_user(input))
}

#[tauri::command(rename_all = "snake_case")]
fn set_pin(core: State<Core>, user_id: Option<String>, new_pin: String) -> R<()> {
    with(&core, |a| a.set_pin(user_id, &new_pin))
}

#[tauri::command(rename_all = "snake_case")]
fn set_user_active(core: State<Core>, user_id: String, active: bool) -> R<()> {
    with(&core, |a| a.set_user_active(&user_id, active))
}

// ------------------------------------------------------------ settings

#[tauri::command(rename_all = "snake_case")]
fn get_settings(core: State<Core>) -> R<BusinessSettings> {
    with(&core, |a| a.get_settings())
}

#[tauri::command(rename_all = "snake_case")]
fn save_settings(core: State<Core>, settings: BusinessSettings) -> R<()> {
    with(&core, |a| a.save_settings(settings))
}

#[tauri::command(rename_all = "snake_case")]
fn diagnostics(core: State<Core>) -> R<DiagnosticsInfo> {
    with(&core, |a| a.diagnostics())
}

// ------------------------------------------------------------ catalog

#[tauri::command(rename_all = "snake_case")]
fn search_products(core: State<Core>, query: String, limit: Option<usize>) -> R<Vec<ProductRow>> {
    with(&core, |a| a.search_products(&query, limit.unwrap_or(50)))
}

#[tauri::command(rename_all = "snake_case")]
fn search_sellable(core: State<Core>, query: String, limit: Option<usize>) -> R<Vec<ProductRow>> {
    with(&core, |a| a.search_sellable(&query, limit.unwrap_or(50)))
}

#[tauri::command(rename_all = "snake_case")]
fn generate_barcode(core: State<Core>) -> R<String> {
    with(&core, |a| a.generate_barcode())
}

#[tauri::command(rename_all = "snake_case")]
fn assign_barcode(core: State<Core>, variant_id: String) -> R<String> {
    with(&core, |a| a.assign_barcode(&variant_id))
}

/// Sends barcode labels to a thermal label printer (TSPL: TSC, Xprinter, Rongta…).
#[tauri::command(rename_all = "snake_case")]
fn print_labels(core: State<Core>, variant_id: String, copies: usize, size: Option<String>, printer_name: Option<String>) -> R<()> {
    let size = match size.as_deref() {
        Some("50x30") => pos_core::hardware::LabelSize::Size50x30,
        _ => pos_core::hardware::LabelSize::Size38x25,
    };
    let payload = with(&core, |a| a.label_payload(&variant_id, copies, size))?;
    let bytes = pos_core::hardware::LabelGenerator::generate_tspl(&payload);
    printer::print_bytes(printer_name.as_deref(), "Barcode labels", &bytes).map_err(|e| format!("Label printing failed: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
fn scan_code(core: State<Core>, code: String) -> R<Option<ScanResult>> {
    with(&core, |a| a.scan(&code))
}

#[tauri::command(rename_all = "snake_case")]
fn create_product(core: State<Core>, params: CreateProductParams, is_service: Option<bool>) -> R<ProductSearchResult> {
    with(&core, |a| a.create_item(params, is_service.unwrap_or(false)))
}

// ------------------------------------------------------------ returns to vendors, claims, reports

#[tauri::command(rename_all = "snake_case")]
fn post_purchase_return(core: State<Core>, input: pos_core::app::ops::PurchaseReturnInput) -> R<pos_core::app::ops::PurchaseReturnDoc> {
    with(&core, |a| a.post_purchase_return(input))
}

#[tauri::command(rename_all = "snake_case")]
fn list_purchase_returns(core: State<Core>, limit: Option<usize>) -> R<Vec<pos_core::app::ops::PurchaseReturnDoc>> {
    with(&core, |a| a.list_purchase_returns(limit.unwrap_or(100)))
}

#[tauri::command(rename_all = "snake_case")]
fn create_claim(core: State<Core>, input: pos_core::app::ops::ClaimInput) -> R<pos_core::app::ops::Claim> {
    with(&core, |a| a.create_claim(input))
}

#[tauri::command(rename_all = "snake_case")]
fn update_claim(core: State<Core>, id: String, status: String, notes: Option<String>, credit_paisa: Option<i64>) -> R<pos_core::app::ops::Claim> {
    with(&core, |a| a.update_claim(&id, &status, notes, credit_paisa))
}

#[tauri::command(rename_all = "snake_case")]
fn list_claims(core: State<Core>, status: Option<String>) -> R<Vec<pos_core::app::ops::Claim>> {
    with(&core, |a| a.list_claims(status))
}

#[tauri::command(rename_all = "snake_case")]
fn report(core: State<Core>, kind: String, from: String, to: String, offset_min: Option<i64>) -> R<pos_core::app::reports::ReportTable> {
    with(&core, |a| a.report(&kind, &from, &to, offset_min))
}

#[tauri::command(rename_all = "snake_case")]
fn import_products_file(core: State<Core>, file_name: String, data_base64: String) -> R<pos_core::domain::importer::ImportSummary> {
    with(&core, |a| a.import_products_file(&file_name, &data_base64))
}

/// Folder for exported reports and product lists: Documents\Next POS Exports.
fn exports_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().document_dir().or_else(|_| app.path().home_dir()).map_err(|e| e.to_string())?;
    let dir = base.join("Next POS Exports");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not make the exports folder: {e}"))?;
    Ok(dir)
}

/// Save an exported file (PDF / Excel / CSV). Returns where it was saved.
#[tauri::command(rename_all = "snake_case")]
fn save_export(app: AppHandle, core: State<Core>, file_name: String, data_base64: String) -> R<String> {
    use base64::Engine;
    with(&core, |a| a.status().map(|_| ()))?;
    let clean: String = file_name.chars().filter(|c| c.is_ascii_alphanumeric() || " _-().".contains(*c)).collect();
    let clean = clean.trim().trim_start_matches('.').to_string();
    let ext = clean.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if clean.is_empty() || !["pdf", "xlsx", "csv"].contains(&ext.as_str()) {
        return Err("Only PDF, Excel and CSV files can be saved".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_base64.as_bytes()).map_err(|_| "The file could not be read".to_string())?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("The file is too large".into());
    }
    let dir = exports_dir(&app)?;
    let stem = clean[..clean.len() - ext.len() - 1].to_string();
    let mut path = dir.join(&clean);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).{ext}"));
        n += 1;
    }
    std::fs::write(&path, bytes).map_err(|e| format!("Could not save the file: {e}"))?;
    Ok(path.display().to_string())
}

/// Open the exports folder in Windows Explorer.
#[tauri::command(rename_all = "snake_case")]
fn open_exports_folder(app: AppHandle) -> R<()> {
    let dir = exports_dir(&app)?;
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(not(target_os = "windows"))]
    let r = std::process::Command::new("xdg-open").arg(&dir).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
fn update_price(core: State<Core>, variant_id: String, retail_paisa: i64, wholesale_paisa: Option<i64>) -> R<()> {
    with(&core, |a| a.update_price(&variant_id, retail_paisa, wholesale_paisa))
}

#[tauri::command(rename_all = "snake_case")]
fn list_units(core: State<Core>) -> R<Vec<Unit>> {
    with(&core, |a| a.list_units())
}

#[tauri::command(rename_all = "snake_case")]
fn create_unit(core: State<Core>, code: String, name: String, decimals: u8) -> R<Unit> {
    with(&core, |a| a.create_unit(&code, &name, decimals))
}

#[tauri::command(rename_all = "snake_case")]
fn list_categories(core: State<Core>) -> R<Vec<Category>> {
    with(&core, |a| a.list_categories())
}

#[tauri::command(rename_all = "snake_case")]
fn create_category(core: State<Core>, name: String, name_ur: Option<String>, parent_id: Option<String>) -> R<Category> {
    with(&core, |a| a.create_category(&name, name_ur, parent_id))
}

#[tauri::command(rename_all = "snake_case")]
fn list_brands(core: State<Core>) -> R<Vec<Brand>> {
    with(&core, |a| a.list_brands())
}

#[tauri::command(rename_all = "snake_case")]
fn create_brand(core: State<Core>, name: String, name_ur: Option<String>) -> R<Brand> {
    with(&core, |a| a.create_brand(&name, name_ur))
}

#[tauri::command(rename_all = "snake_case")]
fn list_tax_rates(core: State<Core>) -> R<Vec<TaxRate>> {
    with(&core, |a| a.list_tax_rates())
}

#[tauri::command(rename_all = "snake_case")]
fn create_tax_rate(core: State<Core>, name: String, rate_bp: i64, inclusive: bool) -> R<TaxRate> {
    with(&core, |a| a.create_tax_rate(&name, rate_bp, inclusive))
}

#[tauri::command(rename_all = "snake_case")]
fn import_csv(core: State<Core>, csv_text: String) -> R<ImportSummary> {
    with(&core, |a| a.import_csv(&csv_text))
}

#[tauri::command(rename_all = "snake_case")]
fn stock_list(core: State<Core>) -> R<Vec<InventoryBalanceView>> {
    with(&core, |a| a.stock_list())
}

// ------------------------------------------------------------ parties

#[tauri::command(rename_all = "snake_case")]
fn list_customers(core: State<Core>, query: String) -> R<Vec<CustomerSummary>> {
    with(&core, |a| a.list_customers(&query))
}

#[tauri::command(rename_all = "snake_case")]
fn list_vendors(core: State<Core>, query: String) -> R<Vec<CustomerSummary>> {
    with(&core, |a| a.list_vendors(&query))
}

#[tauri::command(rename_all = "snake_case")]
fn create_party(core: State<Core>, input: CustomerInput) -> R<CustomerSummary> {
    with(&core, |a| a.create_party(input))
}

// ------------------------------------------------------------ shift

#[tauri::command(rename_all = "snake_case")]
fn active_shift(core: State<Core>) -> R<Option<CashSession>> {
    with(&core, |a| a.active_shift())
}

#[tauri::command(rename_all = "snake_case")]
fn start_shift(core: State<Core>, opening_float_paisa: i64) -> R<CashSession> {
    with(&core, |a| a.start_shift(opening_float_paisa))
}

#[tauri::command(rename_all = "snake_case")]
fn cash_drop(core: State<Core>, amount_paisa: i64, reason: String) -> R<()> {
    with(&core, |a| a.cash_drop(amount_paisa, &reason))
}

#[tauri::command(rename_all = "snake_case")]
fn close_shift(core: State<Core>, counted_cash_paisa: i64) -> R<ZReportData> {
    with(&core, |a| a.close_shift(counted_cash_paisa))
}

// ------------------------------------------------------------ checkout

#[tauri::command(rename_all = "snake_case")]
fn quote(core: State<Core>, customer_id: Option<String>, lines: Vec<CheckoutLineInput>, global_discount_paisa: i64) -> R<Quote> {
    with(&core, |a| a.quote(customer_id.as_deref(), &lines, global_discount_paisa))
}

#[tauri::command(rename_all = "snake_case")]
fn checkout(core: State<Core>, input: CheckoutInput) -> R<ReceiptData> {
    with(&core, |a| a.checkout(input))
}

#[tauri::command(rename_all = "snake_case")]
fn recent_sales(core: State<Core>, limit: Option<usize>) -> R<Vec<RecentSale>> {
    with(&core, |a| a.recent_sales(limit.unwrap_or(50)))
}

#[tauri::command(rename_all = "snake_case")]
fn get_receipt(core: State<Core>, sale_id: String) -> R<ReceiptData> {
    with(&core, |a| a.receipt(&sale_id))
}

#[tauri::command(rename_all = "snake_case")]
fn park_cart(core: State<Core>, name: String, customer_id: Option<String>, lines: Vec<CheckoutLineInput>) -> R<String> {
    with(&core, |a| a.park_cart(&name, customer_id, &lines))
}

#[tauri::command(rename_all = "snake_case")]
fn list_parked(core: State<Core>) -> R<Vec<ParkedCartSummary>> {
    with(&core, |a| a.list_parked())
}

#[tauri::command(rename_all = "snake_case")]
fn recall_parked(core: State<Core>, id: String) -> R<RecalledCart> {
    with(&core, |a| a.recall_parked(&id)).map(|(customer_id, lines)| RecalledCart { customer_id, lines })
}

#[tauri::command(rename_all = "snake_case")]
fn delete_parked(core: State<Core>, id: String) -> R<()> {
    with(&core, |a| a.delete_parked(&id))
}

#[tauri::command(rename_all = "snake_case")]
fn find_sale_for_return(core: State<Core>, doc_no: String) -> R<ReturnableSale> {
    with(&core, |a| a.find_sale_for_return(&doc_no))
}

#[tauri::command(rename_all = "snake_case")]
fn post_return(core: State<Core>, input: ReturnInput) -> R<CompletedReturn> {
    with(&core, |a| a.post_return(input))
}

// ------------------------------------------------------------ khata

#[tauri::command(rename_all = "snake_case")]
fn khata_statement(core: State<Core>, party_id: String, from: String, to: String) -> R<KhataStatement> {
    with(&core, |a| a.khata_statement(&party_id, &from, &to))
}

#[tauri::command(rename_all = "snake_case")]
fn receive_payment(core: State<Core>, party_id: String, amount_paisa: i64, method: String, reference: Option<String>) -> R<PaymentAllocationResult> {
    with(&core, |a| a.receive_payment(&party_id, amount_paisa, &method, reference))
}

#[tauri::command(rename_all = "snake_case")]
fn aging(core: State<Core>, party_type: String) -> R<Vec<AgingReportBucket>> {
    with(&core, |a| a.aging(&party_type))
}

/// Opens the WhatsApp reminder for a customer. The link is built by the backend
/// and only `https://wa.me/` links are ever opened.
#[tauri::command(rename_all = "snake_case")]
fn open_whatsapp_reminder(core: State<Core>, party_id: String) -> R<String> {
    let url = with(&core, |a| a.whatsapp_reminder_url(&party_id))?;
    if !url.starts_with("https://wa.me/") || url.contains('"') || url.contains(' ') {
        return Err("Refusing to open an unexpected link".into());
    }
    #[cfg(windows)]
    let r = std::process::Command::new("explorer.exe").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map_err(|e| format!("Could not open WhatsApp: {}", e))?;
    Ok(url)
}

// ------------------------------------------------------------ purchases / stock

#[tauri::command(rename_all = "snake_case")]
fn post_purchase(core: State<Core>, input: CreatePurchaseInput) -> R<PurchaseInvoice> {
    with(&core, |a| a.post_purchase(input))
}

#[tauri::command(rename_all = "snake_case")]
fn list_purchases(core: State<Core>, limit: Option<usize>) -> R<Vec<PurchaseInvoice>> {
    with(&core, |a| a.list_purchases(limit.unwrap_or(100)))
}

#[tauri::command(rename_all = "snake_case")]
fn start_stock_count(core: State<Core>, notes: Option<String>) -> R<StockCountSession> {
    with(&core, |a| a.start_stock_count(notes))
}

#[tauri::command(rename_all = "snake_case")]
fn record_stock_counts(core: State<Core>, session_id: String, items: Vec<RecordCountItemInput>) -> R<()> {
    with(&core, |a| a.record_stock_counts(&session_id, items))
}

#[tauri::command(rename_all = "snake_case")]
fn current_stock_count(core: State<Core>) -> R<Option<StockCountSession>> {
    with(&core, |a| a.current_stock_count())
}

#[tauri::command(rename_all = "snake_case")]
fn finalize_stock_count(core: State<Core>, session_id: String) -> R<StockCountSession> {
    with(&core, |a| a.finalize_stock_count(&session_id))
}

// ------------------------------------------------------------ reports

#[tauri::command(rename_all = "snake_case")]
fn financial_summary(core: State<Core>, from: String, to: String) -> R<FinancialSummary> {
    with(&core, |a| a.financial_summary(&from, &to))
}

#[tauri::command(rename_all = "snake_case")]
fn category_performance(core: State<Core>, from: String, to: String) -> R<Vec<CategoryPerformance>> {
    with(&core, |a| a.category_performance(&from, &to))
}

#[tauri::command(rename_all = "snake_case")]
fn top_products(core: State<Core>, from: String, to: String, limit: Option<usize>) -> R<Vec<TopProduct>> {
    with(&core, |a| a.top_products(&from, &to, limit.unwrap_or(10)))
}

#[tauri::command(rename_all = "snake_case")]
fn inventory_valuation(core: State<Core>) -> R<InventoryValuation> {
    with(&core, |a| a.inventory_valuation())
}

// ------------------------------------------------------------ license / backup

#[tauri::command(rename_all = "snake_case")]
fn license_info(core: State<Core>) -> R<LicenseInfo> {
    with(&core, |a| a.license()).map(|(status, machine_id)| LicenseInfo { status, machine_id })
}

#[tauri::command(rename_all = "snake_case")]
fn install_license(core: State<Core>, token: String) -> R<LicenseStatus> {
    with(&core, |a| a.install_license(&token))
}

#[tauri::command(rename_all = "snake_case")]
fn default_backup_dir() -> String {
    PosApp::default_backup_dir().to_string_lossy().to_string()
}

#[tauri::command(rename_all = "snake_case")]
fn create_backup(core: State<Core>, dir: Option<String>, password: String) -> R<BackupFileInfo> {
    with(&core, |a| a.create_backup(dir.as_deref(), &password))
}

#[tauri::command(rename_all = "snake_case")]
fn list_backups(core: State<Core>, dir: Option<String>) -> R<Vec<BackupFileInfo>> {
    with(&core, |a| a.list_backups(dir.as_deref()))
}

#[tauri::command(rename_all = "snake_case")]
fn verify_backup(core: State<Core>, path: String, password: String) -> R<BackupManifest> {
    with(&core, |a| a.verify_backup(&path, &password))
}

#[tauri::command(rename_all = "snake_case")]
fn restore_backup(core: State<Core>, path: String, password: String) -> R<RestoreReport> {
    with(&core, |a| a.restore_backup(&path, &password))
}

// ------------------------------------------------------------ reports / snapshots

#[tauri::command(rename_all = "snake_case")]
fn low_stock(core: State<Core>) -> R<Vec<LowStockRow>> {
    with(&core, |a| a.low_stock())
}

#[tauri::command(rename_all = "snake_case")]
fn create_snapshot(core: State<Core>) -> R<SnapshotInfo> {
    with(&core, |a| a.create_snapshot())
}

#[tauri::command(rename_all = "snake_case")]
fn list_snapshots(core: State<Core>) -> R<Vec<SnapshotInfo>> {
    with(&core, |a| a.list_snapshots())
}

// ------------------------------------------------------------ printing
// Receipts are built by the backend from the database; the screen only says
// which sale to print. Printing runs after the database lock is released.

fn width_of(w: Option<String>) -> ReceiptWidth {
    match w.as_deref() {
        Some("80mm") => ReceiptWidth::Width80mm,
        _ => ReceiptWidth::Width58mm,
    }
}

#[tauri::command(rename_all = "snake_case")]
fn list_printers(core: State<Core>) -> R<Vec<String>> {
    with(&core, |a| a.require_printer_user())?;
    Ok(printer::list_system_printers())
}

#[tauri::command(rename_all = "snake_case")]
fn print_receipt(core: State<Core>, sale_id: String, printer_name: Option<String>, width: Option<String>) -> R<()> {
    let payload = with(&core, |a| a.receipt_payload(&sale_id))?;
    printer::print_sale_receipt(printer_name.as_deref(), width_of(width), &payload)
        .map_err(|e| format!("Receipt printing failed: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
fn print_z_report(core: State<Core>, printer_name: Option<String>, width: Option<String>) -> R<()> {
    let payload = with(&core, |a| a.z_report_payload())?;
    printer::print_sale_receipt(printer_name.as_deref(), width_of(width), &payload)
        .map_err(|e| format!("Z report printing failed: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
fn print_test_receipt(core: State<Core>, printer_name: Option<String>, width: Option<String>) -> R<()> {
    let payload = with(&core, |a| a.test_receipt_payload())?;
    printer::print_sale_receipt(printer_name.as_deref(), width_of(width), &payload)
        .map_err(|e| format!("Test print failed: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
fn kick_drawer(core: State<Core>, printer_name: Option<String>) -> R<()> {
    with(&core, |a| a.require_printer_user())?;
    printer::kick_drawer(printer_name.as_deref()).map_err(|e| format!("Drawer kick failed: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
fn cut_paper(core: State<Core>, printer_name: Option<String>) -> R<()> {
    with(&core, |a| a.require_printer_user())?;
    printer::cut_paper(printer_name.as_deref()).map_err(|e| format!("Paper cut failed: {}", e))
}

// ------------------------------------------------------------ cloud sync (Owner opt-in)

#[derive(Serialize)]
struct CloudSyncResult {
    synced_count: usize,
    message: String,
}

#[tauri::command(rename_all = "snake_case")]
fn cloud_settings(core: State<Core>) -> R<CloudSettingsView> {
    with(&core, |a| a.cloud_settings())
}

#[tauri::command(rename_all = "snake_case")]
fn save_cloud_settings(core: State<Core>, input: CloudSettingsInput) -> R<CloudSettingsView> {
    with(&core, |a| a.save_cloud_settings(input))
}

/// Sends unsent events only when the Owner has turned sync on. The URL and key
/// come from the encrypted database, never from the code or the screen.
#[tauri::command(rename_all = "snake_case")]
async fn sync_to_cloud(core: State<'_, Core>) -> R<CloudSyncResult> {
    let batch = with(&core, |a| a.cloud_batch())?;
    let Some(batch) = batch else {
        return Ok(CloudSyncResult { synced_count: 0, message: "Cloud sync is off. The Owner can turn it on in Backup settings.".into() });
    };
    if batch.events.is_empty() {
        return Ok(CloudSyncResult { synced_count: 0, message: "Nothing new to sync.".into() });
    }
    let body = serde_json::json!({
        "p_shop_id": batch.shop_id,
        "p_shop_name": batch.shop_name,
        "p_events": batch.events,
    });
    let res = reqwest::Client::new()
        .post(format!("{}/rest/v1/rpc/sync_shop_events", batch.url))
        .header("apikey", &batch.api_key)
        .header("Authorization", format!("Bearer {}", batch.api_key))
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Could not reach the cloud server: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Cloud server refused the sync ({}): {}", status, text.chars().take(300).collect::<String>()));
    }
    let n = batch.event_ids.len();
    with(&core, |a| a.cloud_mark_synced(&batch.event_ids))?;
    Ok(CloudSyncResult { synced_count: n, message: format!("Synced {} events.", n) })
}

// ------------------------------------------------------------ phones (shop WiFi)

/// The phone link while it runs, and why it could not start (if so).
struct Phones {
    hub: Mutex<Option<LanHub>>,
    error: Mutex<Option<String>>,
    security_dir: std::path::PathBuf,
}

#[derive(Serialize)]
struct PhonesStatus {
    enabled: bool,
    running: bool,
    port: Option<u16>,
    addresses: Vec<String>,
    error: Option<String>,
}

fn start_phone_link(app: &AppHandle) {
    let phones = app.state::<Phones>();
    let mut hub = phones.hub.lock().unwrap_or_else(|p| p.into_inner());
    if hub.is_some() {
        return;
    }
    let shared = app.state::<Core>().0.clone();
    let emitter = app.clone();
    let on_scan = Arc::new(move |scan: pos_core::app::lan::RemoteScan| {
        let _ = emitter.emit("remote-scan", scan);
    });
    match LanHub::start(shared, &phones.security_dir, pos_lan::HTTP_PORT, Some(pos_lan::DISCOVERY_PORT), on_scan) {
        Ok(h) => {
            *hub = Some(h);
            *phones.error.lock().unwrap_or_else(|p| p.into_inner()) = None;
        }
        Err(e) => *phones.error.lock().unwrap_or_else(|p| p.into_inner()) = Some(e),
    }
}

fn stop_phone_link(app: &AppHandle) {
    let phones = app.state::<Phones>();
    let hub = phones.hub.lock().unwrap_or_else(|p| p.into_inner()).take();
    if let Some(h) = hub {
        h.stop();
    }
}

#[tauri::command(rename_all = "snake_case")]
fn phones_status(core: State<Core>, phones: State<Phones>) -> R<PhonesStatus> {
    let enabled = with(&core, |a| {
        a.lan_devices()?;
        a.lan_enabled()
    })?;
    let hub = phones.hub.lock().map_err(|_| "Internal error".to_string())?;
    Ok(PhonesStatus {
        enabled,
        running: hub.is_some(),
        port: hub.as_ref().map(|h| h.port),
        addresses: pos_core::app::lan::local_addresses(),
        error: phones.error.lock().map(|e| e.clone()).unwrap_or(None),
    })
}

#[tauri::command(rename_all = "snake_case")]
fn set_phones_enabled(app: AppHandle, core: State<Core>, enabled: bool) -> R<()> {
    with(&core, |a| a.set_lan_enabled(enabled))?;
    if enabled {
        start_phone_link(&app);
    } else {
        stop_phone_link(&app);
    }
    Ok(())
}

/// Text for the pairing QR code (valid for a few minutes, works once).
#[tauri::command(rename_all = "snake_case")]
fn phone_pairing_qr(app: AppHandle, core: State<Core>, phones: State<Phones>) -> R<String> {
    if phones.hub.lock().map(|h| h.is_none()).unwrap_or(true) {
        start_phone_link(&app);
    }
    let (code, store) = with(&core, |a| {
        let code = a.lan_new_pairing_code()?;
        let store = a.get_settings().map(|s| s.name).unwrap_or_else(|_| "Next POS".to_string());
        Ok((code, store))
    })?;
    let hub = phones.hub.lock().map_err(|_| "Internal error".to_string())?;
    match hub.as_ref() {
        Some(h) => Ok(h.pairing_qr(&store, &code).to_qr_text()),
        None => Err(phones.error.lock().ok().and_then(|e| e.clone()).unwrap_or_else(|| "The phone link could not start.".into())),
    }
}

#[tauri::command(rename_all = "snake_case")]
fn cancel_phone_pairing(core: State<Core>) -> R<()> {
    with(&core, |a| {
        a.lan_cancel_pairing();
        Ok(())
    })
}

#[tauri::command(rename_all = "snake_case")]
fn list_phones(core: State<Core>) -> R<Vec<LanDevice>> {
    with(&core, |a| a.lan_devices())
}

#[tauri::command(rename_all = "snake_case")]
fn remove_phone(core: State<Core>, phones: State<Phones>, device_id: String) -> R<()> {
    with(&core, |a| a.lan_revoke_device(&device_id))?;
    if let Some(h) = phones.hub.lock().ok().as_ref().and_then(|h| h.as_ref()) {
        h.forget_session(&device_id);
    }
    Ok(())
}

// ------------------------------------------------------------ history & editing

#[tauri::command(rename_all = "snake_case")]
fn list_sales(core: State<Core>, query: SaleListQuery) -> R<Vec<SaleListRow>> {
    with(&core, |a| a.list_sales(query))
}

#[tauri::command(rename_all = "snake_case")]
fn sale_detail(core: State<Core>, sale_id: String) -> R<SaleDetail> {
    with(&core, |a| a.sale_detail(&sale_id))
}

#[tauri::command(rename_all = "snake_case")]
fn sale_revision(core: State<Core>, sale_id: String, revision: i64) -> R<serde_json::Value> {
    with(&core, |a| a.sale_revision(&sale_id, revision))
}

#[tauri::command(rename_all = "snake_case")]
fn quote_sale_edit(core: State<Core>, input: EditSaleInput) -> R<SaleEditPreview> {
    with(&core, |a| a.quote_sale_edit(&input))
}

#[tauri::command(rename_all = "snake_case")]
fn edit_sale(core: State<Core>, input: EditSaleInput) -> R<ReceiptData> {
    with(&core, |a| a.edit_sale(input))
}

#[tauri::command(rename_all = "snake_case")]
fn list_purchases_filtered(core: State<Core>, query: PurchaseListQuery) -> R<Vec<PurchaseListRow>> {
    with(&core, |a| a.list_purchases_filtered(query))
}

#[tauri::command(rename_all = "snake_case")]
fn purchase_detail(core: State<Core>, purchase_id: String) -> R<PurchaseDetail> {
    with(&core, |a| a.purchase_detail(&purchase_id))
}

#[tauri::command(rename_all = "snake_case")]
fn purchase_revision(core: State<Core>, purchase_id: String, revision: i64) -> R<serde_json::Value> {
    with(&core, |a| a.purchase_revision(&purchase_id, revision))
}

#[tauri::command(rename_all = "snake_case")]
fn quote_purchase_edit(core: State<Core>, input: EditPurchaseInput) -> R<PurchaseEditPreview> {
    with(&core, |a| a.quote_purchase_edit(&input))
}

#[tauri::command(rename_all = "snake_case")]
fn edit_purchase(core: State<Core>, input: EditPurchaseInput) -> R<PurchaseInvoice> {
    with(&core, |a| a.edit_purchase(input))
}

#[tauri::command(rename_all = "snake_case")]
fn product_detail(core: State<Core>, product_id: String) -> R<ProductDetail> {
    with(&core, |a| a.product_detail(&product_id))
}

#[tauri::command(rename_all = "snake_case")]
fn update_product(core: State<Core>, input: UpdateProductInput) -> R<ProductSearchResult> {
    with(&core, |a| a.update_product(input))
}

fn main() {
    let data_dir = std::env::var("NEXTPOS_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| PosApp::default_data_dir());
    let opened = PosApp::open(&data_dir).map_err(|e| e.to_string());
    let phones_on = opened.as_ref().map(|a| a.lan_enabled().unwrap_or(false)).unwrap_or(false);

    tauri::Builder::default()
        .manage(Core(Arc::new(Mutex::new(opened))))
        .manage(Phones { hub: Mutex::new(None), error: Mutex::new(None), security_dir: data_dir.join("security") })
        .setup(move |app| {
            // Phones on the shop WiFi (only if the Owner turned it on).
            if phones_on {
                start_phone_link(app.handle());
            }
            // Automatic encrypted snapshot every 30 minutes (keeps 48 recent + 30 daily).
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(30 * 60));
                let state = handle.state::<Core>();
                let guard = match state.0.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                if let Ok(pos) = guard.as_ref() {
                    if let Err(e) = pos.auto_snapshot() {
                        eprintln!("auto snapshot failed: {}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status, setup_first_run, login_password, login_pin, logout, reveal_recovery_phrase,
            list_users, create_user, set_pin, set_user_active,
            get_settings, save_settings, diagnostics,
            search_products, search_sellable, scan_code, generate_barcode, assign_barcode, print_labels, create_product, update_price, list_units, create_unit,
            list_categories, create_category, list_brands, create_brand, list_tax_rates, create_tax_rate,
            import_csv, stock_list,
            list_customers, list_vendors, create_party,
            active_shift, start_shift, cash_drop, close_shift,
            quote, checkout, recent_sales, get_receipt, park_cart, list_parked, recall_parked, delete_parked,
            find_sale_for_return, post_return,
            khata_statement, receive_payment, aging, open_whatsapp_reminder,
            post_purchase, list_purchases, start_stock_count, record_stock_counts, current_stock_count, finalize_stock_count,
            financial_summary, category_performance, top_products, inventory_valuation,
            license_info, install_license, default_backup_dir, create_backup, list_backups, verify_backup, restore_backup,
            low_stock, create_snapshot, list_snapshots,
            list_printers, print_receipt, print_z_report, print_test_receipt, kick_drawer, cut_paper,
            cloud_settings, save_cloud_settings, sync_to_cloud,
            post_purchase_return, list_purchase_returns, create_claim, update_claim, list_claims, report, save_export, open_exports_folder, import_products_file,
            phones_status, set_phones_enabled, phone_pairing_qr, cancel_phone_pairing, list_phones, remove_phone,
            list_sales, sale_detail, sale_revision, quote_sale_edit, edit_sale,
            list_purchases_filtered, purchase_detail, purchase_revision, quote_purchase_edit, edit_purchase,
            product_detail, update_product,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
