//! Application service used by the desktop shell (Tauri commands).
//!
//! Every screen action goes through `PosApp`. It owns the encrypted database
//! connection and the logged-in session, checks permissions for each action, and
//! fills in everything the UI must not be trusted with (prices, tax, cashier,
//! shift, license state). The Tauri layer is a thin wrapper around these methods.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::auth::{Permission, Role, UserRepo, UserSession, UserSummary};
use crate::backup::{BackupManifest, CryptoBackupService, RestoreReport, SnapshotManager};
use crate::db::connection::{open_encrypted_db, run_migrations};
use crate::db::key::DbKeyManager;
use crate::domain::analytics::{AnalyticsRepo, CategoryPerformance, FinancialSummary, InventoryValuation, TopProduct};
use crate::domain::audit::AuditRepo;
use crate::domain::brand::{Brand, BrandRepo};
use crate::domain::cart::{Cart, CartLine, CartRepo, ParkedCartSummary};
use crate::domain::catalog::{CatalogRepo, CreateProductParams, ProductSearchResult};
use crate::domain::category::{Category, CategoryRepo};
use crate::domain::grocery::GroceryScaleService;
use crate::domain::importer::{CatalogImporter, ImportSummary};
use crate::domain::inventory::{InventoryBalanceView, InventoryRepo};
use crate::domain::khata::{AgingReportBucket, KhataRepo, KhataStatement, PaymentAllocationResult};
use crate::domain::party::{CreatePartyParams, Party, PartyRepo};
use crate::domain::purchase::{CreatePurchaseInput, PurchaseInvoice, PurchaseRepo};
use crate::domain::refund::{CompletedReturn, PostReturnRequest, ReturnRepo};
use crate::domain::sale::{catalog_price, min_sale_price, unit_factor, CompletedSale, PaymentTenderInput, PostSaleLineInput, PostSaleRequest, SaleRepo};
use crate::domain::settings::{BusinessSettings, SettingsRepo};
use crate::domain::shift::{CashSession, ShiftRepo, ZReportData};
use crate::domain::stock_count::{RecordCountItemInput, StockCountRepo, StockCountSession};
use crate::domain::unit::{Unit, UnitRepo};
use crate::error::{PosError, Result};
use crate::licensing::{HardwareFingerprint, LicenseStatus, LicenseStore};
use crate::money::{mul_div_half_up, Qty};

pub const DB_FILE: &str = "nextpos.db";
pub const KEY_FILE: &str = "master.key";

// ---------------------------------------------------------------- DTOs

#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub user_id: String,
    pub username: String,
    pub role: Role,
    pub permissions: Vec<Permission>,
    pub expires_at: String,
}

impl From<&UserSession> for SessionInfo {
    fn from(s: &UserSession) -> Self {
        SessionInfo {
            user_id: s.user_id.clone(),
            username: s.username.clone(),
            role: s.role,
            permissions: s.role.permissions(),
            expires_at: s.expires_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AppStatus {
    pub needs_setup: bool,
    pub store_name: Option<String>,
    pub store_name_ur: Option<String>,
    pub machine_id: String,
    pub license: LicenseStatus,
    pub can_post_sales: bool,
    pub trial_watermark: bool,
    pub session: Option<SessionInfo>,
    pub users: Vec<UserSummary>,
    pub app_version: String,
    pub data_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StoreSetupInput {
    pub name: String,
    pub name_ur: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub ntn: Option<String>,
    pub strn: Option<String>,
    pub tax_mode: Option<String>,
    pub enabled_packs: Vec<String>,
    /// Load a small sample catalog (demo shops / training). Posted through the
    /// normal repositories, so stock and ledgers stay consistent.
    #[serde(default)]
    pub demo_catalog: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OwnerSetupInput {
    pub username: String,
    pub password: String,
    pub pin: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupResult {
    pub session: SessionInfo,
    /// Shown once. The owner must write it down; it is never stored on the PC.
    pub recovery_phrase: String,
}

/// An Owner/Manager approving something at the counter with their PIN.
#[derive(Debug, Clone, Deserialize)]
pub struct ApprovalInput {
    pub user_id: String,
    pub pin: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckoutLineInput {
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
    #[serde(default)]
    pub discount_paisa: i64,
    /// Only set when the cashier changed the price; needs PriceEdit or an approval.
    #[serde(default)]
    pub price_override_paisa: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckoutInput {
    pub customer_id: Option<String>,
    pub lines: Vec<CheckoutLineInput>,
    #[serde(default)]
    pub global_discount_paisa: i64,
    pub tenders: Vec<PaymentTenderInput>,
    #[serde(default)]
    pub approval: Option<ApprovalInput>,
}

/// A priced line as the counter should display it (all amounts from the database).
#[derive(Debug, Clone, Serialize)]
pub struct QuoteLine {
    pub variant_id: String,
    pub unit_id: String,
    pub unit_code: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub qty_milli: i64,
    pub unit_price_paisa: i64,
    pub catalog_price_paisa: i64,
    /// Lowest price the counter may charge (wholesale, else cost). None = no limit.
    pub min_price_paisa: Option<i64>,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub total_paisa: i64,
    pub on_hand_milli: i64,
    /// A service: no stock to check.
    pub is_service: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Quote {
    pub lines: Vec<QuoteLine>,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub total_paisa: i64,
    pub customer: Option<CustomerSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SellUnit {
    pub unit_id: String,
    pub unit_code: String,
    pub factor_to_base: i64,
    pub barcode: Option<String>,
    pub price_paisa: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanResult {
    pub product: ProductSearchResult,
    pub unit_id: String,
    pub qty_milli: i64,
    pub units: Vec<SellUnit>,
    pub on_hand_milli: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProductRow {
    #[serde(flatten)]
    pub product: ProductSearchResult,
    pub on_hand_milli: i64,
    pub avg_cost_paisa: i64,
    pub reorder_level_milli: i64,
    /// A service (repair, fitting...): no stock.
    pub is_service: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CustomerSummary {
    pub id: String,
    pub party_type: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub phone: Option<String>,
    pub credit_limit_paisa: i64,
    pub balance_paisa: i64,
    pub price_list_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaxRate {
    pub id: String,
    pub name: String,
    pub rate_bp: i64,
    pub inclusive: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReturnableLine {
    pub sale_line_id: String,
    pub variant_id: String,
    pub unit_id: String,
    pub unit_code: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub qty_milli: i64,
    pub returned_qty_milli: i64,
    pub unit_price_paisa: i64,
    pub total_paisa: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReturnableSale {
    pub id: String,
    pub doc_no: String,
    pub created_at: String,
    pub customer_name: Option<String>,
    pub total_paisa: i64,
    pub lines: Vec<ReturnableLine>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReturnLineInput {
    pub sale_line_id: String,
    pub qty_milli: i64,
    /// Damaged items are recorded but not put back into sellable stock.
    #[serde(default)]
    pub damaged: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReturnInput {
    pub sale_id: String,
    pub lines: Vec<ReturnLineInput>,
    pub reason: Option<String>,
    pub refund_method: String,
    #[serde(default)]
    pub approval: Option<ApprovalInput>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReceiptData {
    pub store: Option<BusinessSettings>,
    pub sale: CompletedSale,
    pub cashier: Option<String>,
    pub trial_watermark: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecentSale {
    pub id: String,
    pub doc_no: String,
    pub customer_name: Option<String>,
    pub total_paisa: i64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupFileInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at: String,
    pub manifest: Option<BackupManifest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CustomerInput {
    pub party_type: Option<String>,
    pub name: String,
    pub name_ur: Option<String>,
    pub phone: Option<String>,
    pub cnic: Option<String>,
    pub ntn: Option<String>,
    #[serde(default)]
    pub credit_limit_paisa: i64,
    #[serde(default)]
    pub opening_balance_paisa: i64,
    pub price_list_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewUserInput {
    pub username: String,
    pub password: String,
    pub pin: Option<String>,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiagnosticsInfo {
    pub app_version: String,
    pub schema_version: i64,
    pub latest_schema_version: i64,
    pub sqlcipher_version: String,
    pub db_path: String,
    pub db_size_bytes: u64,
    pub integrity_ok: bool,
    pub last_snapshot: Option<String>,
    pub products: i64,
    pub sales: i64,
    pub customers: i64,
}

// ---------------------------------------------------------------- service

pub struct PosApp {
    data_dir: PathBuf,
    conn: Option<Connection>,
    key: [u8; 32],
    session: Option<UserSession>,
    machine_id: String,
    last_z_report: Option<ZReportData>,
    /// One-time code for pairing a phone, and when it stops working.
    lan_pairing: Option<(String, DateTime<Utc>)>,
}

#[path = "lan.rs"]
pub mod lan;
#[path = "ops.rs"]
pub mod ops;
#[path = "reports.rs"]
pub mod reports;
#[path = "history.rs"]
pub mod history;

fn perm_err(msg: &str) -> PosError {
    PosError::BusinessRule(msg.to_string())
}

fn now() -> DateTime<Utc> {
    Utc::now()
}

impl PosApp {
    /// Default data folder: `%APPDATA%\NextPOS` (the key lives in `security\`).
    pub fn default_data_dir() -> PathBuf {
        DbKeyManager::default_key_dir()
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(".nextpos"))
    }

    /// Opens (creating on first run) the encrypted shop database in `data_dir`.
    pub fn open(data_dir: &Path) -> Result<Self> {
        let machine_id = HardwareFingerprint::get_machine_id();
        Self::open_with_machine(data_dir, machine_id)
    }

    /// Same as [`PosApp::open`] with an explicit machine ID (tests).
    pub fn open_with_machine(data_dir: &Path, machine_id: String) -> Result<Self> {
        let key_path = data_dir.join("security").join(KEY_FILE);
        let (key, _created) = DbKeyManager::load_or_create_key(&key_path)?;
        let mut app = PosApp { data_dir: data_dir.to_path_buf(), conn: None, key, session: None, machine_id, last_z_report: None, lan_pairing: None };
        app.connect()?;
        Ok(app)
    }

    // Same layout as earlier builds: key, database and snapshots under `security\`.
    fn db_path(&self) -> PathBuf {
        self.data_dir.join("security").join(DB_FILE)
    }

    pub fn snapshot_dir(&self) -> PathBuf {
        self.data_dir.join("security").join("snapshots")
    }

    fn connect(&mut self) -> Result<()> {
        let mut conn = open_encrypted_db(&self.db_path(), &self.key)?;
        run_migrations(&mut conn)?;
        // Seed units only on an empty table (older builds seeded upper-case codes).
        let units: i64 = conn.query_row("SELECT COUNT(*) FROM units", [], |r| r.get(0))?;
        if units == 0 {
            UnitRepo::seed_defaults(&conn)?;
        }
        self.conn = Some(conn);
        Ok(())
    }

    fn conn(&self) -> Result<&Connection> {
        self.conn.as_ref().ok_or_else(|| PosError::Db("Database is not open".into()))
    }

    #[doc(hidden)]
    pub fn raw_conn(&self) -> Result<&Connection> {
        self.conn()
    }

    fn conn_mut(&mut self) -> Result<&mut Connection> {
        self.conn.as_mut().ok_or_else(|| PosError::Db("Database is not open".into()))
    }

    /// Fails unless someone is logged in and their role has `perm`.
    fn require(&self, perm: Permission) -> Result<&UserSession> {
        let s = self.session.as_ref().ok_or_else(|| perm_err("Please log in first"))?;
        UserRepo::require_permission(self.conn()?, s, perm, &now())?;
        Ok(s)
    }

    /// Fails unless someone is logged in (any role).
    fn require_login(&self) -> Result<&UserSession> {
        let s = self.session.as_ref().ok_or_else(|| perm_err("Please log in first"))?;
        if now() > s.expires_at {
            return Err(perm_err("Session expired; please log in again"));
        }
        Ok(s)
    }

    /// Verifies an Owner/Manager PIN approval and returns the approver's id.
    fn verify_approval(&self, a: &ApprovalInput, what: &str) -> Result<String> {
        let conn = self.conn()?;
        UserRepo::login_pin(conn, &a.user_id, &a.pin, &now())?;
        AuditRepo::require_manager(conn, &a.user_id, what)?;
        Ok(a.user_id.clone())
    }

    fn license_status(&self) -> Result<LicenseStatus> {
        LicenseStore::current_status(self.conn()?, &self.machine_id, &now(), None)
    }

    fn require_selling_license(&self) -> Result<LicenseStatus> {
        let st = self.license_status()?;
        if !st.can_post_sales() {
            return Err(perm_err(
                "License is not active, so new sales are blocked. Reports, khata and backups still work. Open the License screen to renew.",
            ));
        }
        Ok(st)
    }

    // ------------------------------------------------------------ status, setup, login

    pub fn status(&self) -> Result<AppStatus> {
        let conn = self.conn()?;
        let needs_setup = UserRepo::needs_first_owner(conn)?;
        let settings = SettingsRepo::get(conn).ok();
        let license = self.license_status()?;
        let session = self.session.as_ref().filter(|s| now() <= s.expires_at).map(SessionInfo::from);
        let users = if needs_setup {
            vec![]
        } else {
            UserRepo::list_users(conn)?.into_iter().filter(|u| u.active).collect()
        };
        Ok(AppStatus {
            needs_setup,
            store_name: settings.as_ref().map(|s| s.name.clone()),
            store_name_ur: settings.as_ref().and_then(|s| s.name_ur.clone()),
            machine_id: self.machine_id.clone(),
            can_post_sales: license.can_post_sales(),
            trial_watermark: license.requires_receipt_watermark(),
            license,
            session,
            users,
            app_version: crate::pos_core_version().to_string(),
            data_dir: self.data_dir.to_string_lossy().to_string(),
        })
    }

    /// First run: saves the shop details, creates the Owner and logs them in.
    /// Only allowed while no user exists.
    pub fn setup_first_run(&mut self, store: StoreSetupInput, owner: OwnerSetupInput) -> Result<SetupResult> {
        let conn = self.conn()?;
        if !UserRepo::needs_first_owner(conn)? {
            return Err(perm_err("This shop is already set up"));
        }
        if store.name.trim().is_empty() {
            return Err(PosError::Validation("Shop name is required".into()));
        }
        if let Some(pin) = &owner.pin {
            validate_pin(pin)?;
        }
        let tax_mode = store.tax_mode.clone().unwrap_or_else(|| "inclusive".into());
        if tax_mode != "inclusive" && tax_mode != "exclusive" {
            return Err(PosError::Validation("Tax mode must be inclusive or exclusive".into()));
        }
        let ts = now();
        let settings = BusinessSettings {
            id: "default".into(),
            name: store.name.trim().to_string(),
            name_ur: clean(store.name_ur),
            address: clean(store.address),
            phone: clean(store.phone),
            ntn: clean(store.ntn),
            strn: clean(store.strn),
            currency: "PKR".into(),
            time_zone: "Asia/Karachi".into(),
            tax_mode,
            negative_stock_policy: "Block".into(),
            enabled_packs: store.enabled_packs.clone(),
            fbr_enabled: false,
            created_at: ts,
            updated_at: ts,
        };
        SettingsRepo::save_or_update(conn, &settings)?;
        UserRepo::create_user(conn, &owner.username, &owner.password, owner.pin.as_deref(), Role::Owner, None)?;
        let session = UserRepo::login_password(conn, &owner.username, &owner.password, &ts)?;
        let info = SessionInfo::from(&session);
        self.session = Some(session);
        if store.demo_catalog {
            self.seed_demo_catalog()?;
        }
        Ok(SetupResult { session: info, recovery_phrase: DbKeyManager::format_recovery_phrase(&self.key) })
    }

    pub fn login_password(&mut self, username: &str, password: &str) -> Result<SessionInfo> {
        let s = UserRepo::login_password(self.conn()?, username, password, &now())?;
        let info = SessionInfo::from(&s);
        self.session = Some(s);
        Ok(info)
    }

    pub fn login_pin(&mut self, user_id: &str, pin: &str) -> Result<SessionInfo> {
        let s = UserRepo::login_pin(self.conn()?, user_id, pin, &now())?;
        let info = SessionInfo::from(&s);
        self.session = Some(s);
        Ok(info)
    }

    pub fn logout(&mut self) -> Result<()> {
        if let Some(s) = self.session.take() {
            AuditRepo::write(self.conn()?, Some(&s.user_id), "logout", "user", Some(&s.user_id), None, None)?;
        }
        Ok(())
    }

    /// The recovery phrase again, for an Owner who re-enters their password.
    pub fn reveal_recovery_phrase(&self, password: &str) -> Result<String> {
        let s = self.require(Permission::SettingsManage)?;
        UserRepo::login_password(self.conn()?, &s.username, password, &now())?;
        AuditRepo::write(self.conn()?, Some(&s.user_id), "recovery_phrase_viewed", "security", None, None, None)?;
        Ok(DbKeyManager::format_recovery_phrase(&self.key))
    }

    // ------------------------------------------------------------ users

    pub fn list_users(&self) -> Result<Vec<UserSummary>> {
        self.require(Permission::SettingsManage)?;
        UserRepo::list_users(self.conn()?)
    }

    pub fn create_user(&self, input: NewUserInput) -> Result<UserSummary> {
        let s = self.require(Permission::SettingsManage)?;
        if let Some(pin) = &input.pin {
            validate_pin(pin)?;
        }
        UserRepo::create_user(self.conn()?, &input.username, &input.password, input.pin.as_deref(), input.role, Some(&s.user_id))
    }

    pub fn set_pin(&self, user_id: Option<String>, new_pin: &str) -> Result<()> {
        let s = self.require_login()?;
        validate_pin(new_pin)?;
        let target = user_id.unwrap_or_else(|| s.user_id.clone());
        UserRepo::set_pin(self.conn()?, &s.user_id, &target, new_pin)
    }

    pub fn set_user_active(&self, user_id: &str, active: bool) -> Result<()> {
        let s = self.require(Permission::SettingsManage)?;
        if user_id == s.user_id && !active {
            return Err(perm_err("You cannot disable your own account"));
        }
        let conn = self.conn()?;
        conn.execute(
            "UPDATE users SET active = ?2, updated_at = ?3 WHERE id = ?1",
            params![user_id, active as i64, now().to_rfc3339()],
        )?;
        AuditRepo::write(conn, Some(&s.user_id), if active { "user_enabled" } else { "user_disabled" }, "user", Some(user_id), None, None)?;
        Ok(())
    }

    // ------------------------------------------------------------ settings

    pub fn get_settings(&self) -> Result<BusinessSettings> {
        self.require_login()?;
        match SettingsRepo::get(self.conn()?) {
            Ok(s) => Ok(s),
            Err(PosError::NotFound(_)) => Ok(SettingsRepo::default_settings()),
            Err(e) => Err(e),
        }
    }

    pub fn save_settings(&self, mut settings: BusinessSettings) -> Result<()> {
        let s = self.require(Permission::SettingsManage)?;
        if !["Block", "Warn", "Allow"].contains(&settings.negative_stock_policy.as_str()) {
            return Err(PosError::Validation("Negative stock policy must be Block, Warn or Allow".into()));
        }
        if settings.name.trim().is_empty() {
            return Err(PosError::Validation("Shop name is required".into()));
        }
        settings.updated_at = now();
        let conn = self.conn()?;
        SettingsRepo::save_or_update(conn, &settings)?;
        AuditRepo::write(conn, Some(&s.user_id), "settings_changed", "business_settings", Some(&settings.id), None, None)?;
        Ok(())
    }

    // ------------------------------------------------------------ catalog

    pub fn search_products(&self, query: &str, limit: usize) -> Result<Vec<ProductRow>> {
        self.require_login()?;
        let conn = self.conn()?;
        let limit = limit.clamp(1, 500);
        let found = CatalogRepo::search(conn, query, limit)?;
        found.into_iter().map(|p| product_row(conn, p)).collect()
    }

    /// Whether items with no stock are blocked from sale (shop setting, default Block).
    fn blocks_out_of_stock(&self) -> bool {
        self.conn()
            .ok()
            .and_then(|c| SettingsRepo::get(c).ok())
            .map(|s| s.negative_stock_policy == "Block")
            .unwrap_or(true)
    }

    /// Product search for the sale screen: items with no stock are left out
    /// (unless the shop allows selling without stock). Inactive items are excluded.
    pub fn search_sellable(&self, query: &str, limit: usize) -> Result<Vec<ProductRow>> {
        let rows = self.search_products(query, limit)?;
        let active_rows: Vec<ProductRow> = rows.into_iter().filter(|r| r.product.active).collect();
        if !self.blocks_out_of_stock() {
            return Ok(active_rows);
        }
        Ok(active_rows.into_iter().filter(|r| r.is_service || r.on_hand_milli > 0).collect())
    }

    /// Barcode scanner / Enter key: exact barcode (including carton barcodes),
    /// SKU, or an in-store scale label (prefix 20/21). Refuses items with no
    /// stock when the shop blocks selling without stock. Inactive items are ignored.
    pub fn scan(&self, code: &str) -> Result<Option<ScanResult>> {
        let hit = self.scan_any(code)?;
        if let Some(h) = &hit {
            if h.on_hand_milli <= 0 && self.blocks_out_of_stock() && !self.variant_is_service(&h.product.variant_id) {
                return Err(PosError::BusinessRule(format!(
                    "{} is out of stock. Add stock with a purchase first (Inventory → Purchase invoices).",
                    h.product.name
                )));
            }
        }
        Ok(hit)
    }

    fn scan_any(&self, code: &str) -> Result<Option<ScanResult>> {
        self.require_login()?;
        let conn = self.conn()?;
        let code = code.trim();
        if code.is_empty() {
            return Ok(None);
        }
        // Packaging barcode (e.g. carton of 24) on variant_units.
        let pack: Option<(String, String)> = conn
            .query_row(
                "SELECT pv.product_id, vu.unit_id FROM variant_units vu
                 JOIN product_variants pv ON pv.id = vu.variant_id
                 WHERE vu.barcode = ?1 AND vu.is_sale_unit = 1 LIMIT 1",
                params![code],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((product_id, unit_id)) = pack {
            if let Some(p) = CatalogRepo::get_by_id(conn, &product_id)? {
                if p.active {
                    return Ok(Some(scan_result(conn, p, Some(unit_id), 1000)?));
                }
            }
        }
        if let Some(p) = CatalogRepo::get_by_barcode(conn, code)? {
            if p.active {
                return Ok(Some(scan_result(conn, p, None, 1000)?));
            }
        }
        if let Some(p) = CatalogRepo::get_by_sku(conn, code)? {
            if p.active {
                return Ok(Some(scan_result(conn, p, None, 1000)?));
            }
        }
        if let Some(scale) = GroceryScaleService::parse_scale_barcode(code) {
            let sku = scale.item_sku.trim_start_matches('0');
            let p = CatalogRepo::get_by_sku(conn, &scale.item_sku)?
                .or(if sku.is_empty() { None } else { CatalogRepo::get_by_sku(conn, sku)? });
            if let Some(p) = p {
                if p.active {
                    let qty = match (scale.embedded_weight_milli, scale.embedded_price_paisa) {
                        (Some(w), _) => w,
                        (None, Some(price)) if p.retail_price_paisa > 0 => mul_div_half_up(price, 1000, p.retail_price_paisa),
                        _ => 1000,
                    };
                    if qty <= 0 {
                        return Err(PosError::Validation("Scale label has zero weight".into()));
                    }
                    return Ok(Some(scan_result(conn, p, None, qty)?));
                }
            }
        }
        Ok(None)
    }

    pub fn create_product(&self, params: CreateProductParams) -> Result<ProductSearchResult> {
        let s = self.require(Permission::PriceEdit)?;
        if params.retail_price_paisa <= 0 {
            return Err(PosError::Validation("Enter a sale price".into()));
        }
        if params.wholesale_price_paisa.map(|w| w > params.retail_price_paisa).unwrap_or(false) {
            return Err(PosError::Validation("Wholesale price cannot be more than the sale price".into()));
        }
        let conn = self.conn()?;
        let p = CatalogRepo::create_product(conn, params)?;
        AuditRepo::write(conn, Some(&s.user_id), "product_created", "product", Some(&p.product_id), None, None)?;
        Ok(p)
    }

    /// Changes the retail (and optionally wholesale) base-unit price.
    pub fn update_price(&self, variant_id: &str, retail_paisa: i64, wholesale_paisa: Option<i64>) -> Result<()> {
        let s = self.require(Permission::PriceEdit)?;
        if retail_paisa < 0 || wholesale_paisa.map(|w| w < 0).unwrap_or(false) {
            return Err(PosError::Validation("Price cannot be negative".into()));
        }
        let conn = self.conn()?;
        let unit_id: String = conn
            .query_row(
                "SELECT unit_id FROM variant_units WHERE variant_id = ?1 AND factor_to_base = 1000 LIMIT 1",
                params![variant_id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound("Product not found".into()))?;
        let old = catalog_price(conn, variant_id, &unit_id, 1000, "retail")?;
        let ts = now().to_rfc3339();
        let upsert = |list: &str, price: i64| -> Result<()> {
            conn.execute(
                "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(price_list_id, variant_id, unit_id) DO UPDATE SET price_paisa = excluded.price_paisa, valid_from = excluded.valid_from",
                params![ulid::Ulid::new().to_string(), list, variant_id, unit_id, price, ts],
            )?;
            Ok(())
        };
        upsert("retail", retail_paisa)?;
        if let Some(w) = wholesale_paisa {
            upsert("wholesale", w)?;
        }
        AuditRepo::write(conn, Some(&s.user_id), "price_changed", "variant", Some(variant_id), None,
            Some(&format!("{{\"old_retail\":{},\"new_retail\":{}}}", old.unwrap_or(0), retail_paisa)))?;
        Ok(())
    }

    /// Fetches all editable details and statistics of a product for the edit screen.
    pub fn product_detail(&self, product_id: &str) -> Result<crate::domain::catalog::ProductDetail> {
        self.require_login()?;
        let conn = self.conn()?;
        CatalogRepo::get_detail(conn, product_id)?
            .ok_or_else(|| PosError::NotFound("Product not found".into()))
    }

    /// Full product update: edits all details while enforcing stock, accounting and uniqueness rules.
    pub fn update_product(&mut self, input: crate::domain::catalog::UpdateProductInput) -> Result<ProductSearchResult> {
        let user_id = self.require(Permission::PriceEdit)?.user_id.clone();
        let name = input.name.trim().to_string();
        let sku = input.sku.trim().to_string();
        if name.is_empty() {
            return Err(PosError::Validation("Product name cannot be empty".into()));
        }
        if sku.is_empty() {
            return Err(PosError::Validation("Product SKU cannot be empty".into()));
        }
        if input.retail_price_paisa <= 0 {
            return Err(PosError::Validation("Enter a sale price".into()));
        }
        if let Some(w) = input.wholesale_price_paisa {
            if w < 0 || w > input.retail_price_paisa {
                return Err(PosError::Validation("Wholesale price cannot be negative or more than the sale price".into()));
            }
        }

        let old = self.product_detail(&input.product_id)?;

        // SKU uniqueness
        let conn = self.conn()?;
        let sku_taken: Option<String> = conn
            .query_row(
                "SELECT name FROM products WHERE sku = ?1 AND id != ?2 LIMIT 1",
                params![sku, input.product_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(other_name) = sku_taken {
            return Err(PosError::Validation(format!("SKU '{}' is already on {}", sku, other_name)));
        }

        // Barcode uniqueness
        let new_barcode = input.barcode.as_deref().map(str::trim).filter(|b| !b.is_empty());
        if let Some(bc) = new_barcode {
            let barcode_taken: Option<String> = conn
                .query_row(
                    "SELECT p.name FROM barcodes b
                     JOIN product_variants pv ON pv.id = b.variant_id
                     JOIN products p ON p.id = pv.product_id
                     WHERE b.value = ?1 AND pv.id != ?2 LIMIT 1",
                    params![bc, old.variant_id],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(other_name) = barcode_taken {
                return Err(PosError::Validation(format!("Barcode {} is already on {}", bc, other_name)));
            }
        }

        // Packaging barcode uniqueness
        let pkg_barcode = input.packaging_unit.as_ref().and_then(|p| p.barcode.as_deref().map(str::trim).filter(|b| !b.is_empty()));
        if let Some(pbc) = pkg_barcode {
            if Some(pbc) == new_barcode {
                return Err(PosError::Validation(format!("Barcode {} cannot be used for both base and packaging unit", pbc)));
            }
            let barcode_taken: Option<String> = conn
                .query_row(
                    "SELECT p.name FROM barcodes b
                     JOIN product_variants pv ON pv.id = b.variant_id
                     JOIN products p ON p.id = pv.product_id
                     WHERE b.value = ?1 AND pv.id != ?2 LIMIT 1",
                    params![pbc, old.variant_id],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(other_name) = barcode_taken {
                return Err(PosError::Validation(format!("Barcode {} is already on {}", pbc, other_name)));
            }
        }

        // Base unit change check
        if input.base_unit_id != old.base_unit_id {
            if old.has_movements || old.has_sales || old.has_purchases {
                return Err(PosError::BusinessRule("Unit cannot change after stock or sales exist.".into()));
            }
        }

        // Packaging unit factor change or removal check
        if let Some(old_pkg) = &old.packaging_unit {
            let factor_changed = input.packaging_unit.as_ref().map(|p| p.factor_to_base != old_pkg.factor_to_base || p.unit_id != old_pkg.unit_id).unwrap_or(true);
            if factor_changed {
                let used_sale: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM sale_lines WHERE variant_id = ?1 AND unit_id = ?2",
                    params![old.variant_id, old_pkg.unit_id],
                    |r| r.get(0),
                ).unwrap_or(0);
                let used_pur: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM purchase_lines WHERE variant_id = ?1 AND unit_id = ?2",
                    params![old.variant_id, old_pkg.unit_id],
                    |r| r.get(0),
                ).unwrap_or(0);
                let used_ret: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM purchase_return_lines WHERE variant_id = ?1 AND unit_id = ?2",
                    params![old.variant_id, old_pkg.unit_id],
                    |r| r.get(0),
                ).unwrap_or(0);
                if used_sale + used_pur + used_ret > 0 {
                    return Err(PosError::BusinessRule("This pack size is used in old bills. Add a new pack unit instead.".into()));
                }
            }
        }

        // Product <-> Service
        if !old.is_service && input.is_service {
            if old.on_hand_milli != 0 {
                return Err(PosError::BusinessRule("Stock is not zero. Adjust stock to 0 first.".into()));
            }
        }

        let reorder_level = if input.is_service { 0 } else { input.reorder_level_milli };

        // Collect changed fields for audit log
        let mut changes = serde_json::Map::new();
        if old.sku != sku { changes.insert("sku".into(), serde_json::json!([old.sku, sku])); }
        if old.name != name { changes.insert("name".into(), serde_json::json!([old.name, name])); }
        if old.name_ur != input.name_ur { changes.insert("name_ur".into(), serde_json::json!([old.name_ur, input.name_ur])); }
        if old.category_id != input.category_id { changes.insert("category_id".into(), serde_json::json!([old.category_id, input.category_id])); }
        if old.brand_id != input.brand_id { changes.insert("brand_id".into(), serde_json::json!([old.brand_id, input.brand_id])); }
        if old.base_unit_id != input.base_unit_id { changes.insert("base_unit_id".into(), serde_json::json!([old.base_unit_id, input.base_unit_id])); }
        if old.barcode != new_barcode.map(str::to_string) { changes.insert("barcode".into(), serde_json::json!([old.barcode, new_barcode])); }
        if old.retail_price_paisa != input.retail_price_paisa { changes.insert("retail_price_paisa".into(), serde_json::json!([old.retail_price_paisa, input.retail_price_paisa])); }
        if old.wholesale_price_paisa != input.wholesale_price_paisa { changes.insert("wholesale_price_paisa".into(), serde_json::json!([old.wholesale_price_paisa, input.wholesale_price_paisa])); }
        if old.tax_rate_id != input.tax_rate_id { changes.insert("tax_rate_id".into(), serde_json::json!([old.tax_rate_id, input.tax_rate_id])); }
        if old.reorder_level_milli != reorder_level { changes.insert("reorder_level_milli".into(), serde_json::json!([old.reorder_level_milli, reorder_level])); }
        if old.is_service != input.is_service { changes.insert("is_service".into(), serde_json::json!([old.is_service, input.is_service])); }
        if old.active != input.active { changes.insert("active".into(), serde_json::json!([old.active, input.active])); }

        let now_str = now().to_rfc3339();

        let conn = self.conn_mut()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| PosError::Db(format!("Failed to begin transaction: {}", e)))?;

        // 1. Update products table
        tx.execute(
            "UPDATE products SET sku = ?1, name = ?2, name_ur = ?3, category_id = ?4, brand_id = ?5,
                    base_unit_id = ?6, tax_rate_id = ?7, reorder_level_milli = ?8, is_service = ?9, active = ?10, updated_at = ?11
             WHERE id = ?12",
            params![
                sku,
                name,
                clean(input.name_ur),
                input.category_id,
                input.brand_id,
                input.base_unit_id,
                input.tax_rate_id,
                reorder_level,
                if input.is_service { 1 } else { 0 },
                if input.active { 1 } else { 0 },
                now_str,
                input.product_id,
            ],
        )?;

        // 2. Update product_variants sku
        tx.execute(
            "UPDATE product_variants SET sku = ?1 WHERE id = ?2",
            params![sku, old.variant_id],
        )?;

        // 3. Update base unit in variant_units
        tx.execute(
            "UPDATE variant_units SET unit_id = ?1, barcode = ?2 WHERE variant_id = ?3 AND factor_to_base = 1000",
            params![input.base_unit_id, new_barcode, old.variant_id],
        )?;

        // 4. Update barcode table for base unit
        tx.execute(
            "DELETE FROM barcodes WHERE variant_id = ?1 AND kind = 'manufacturer' AND (value = ?2 OR ?2 IS NULL)",
            params![old.variant_id, old.barcode],
        )?;
        if let Some(bc) = new_barcode {
            tx.execute(
                "INSERT OR REPLACE INTO barcodes (id, variant_id, value, kind, created_at) VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
                params![ulid::Ulid::new().to_string(), old.variant_id, bc, now_str],
            )?;
        }

        // 5. Update base unit prices
        let upsert_price = |list: &str, price: i64| -> Result<()> {
            tx.execute(
                "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(price_list_id, variant_id, unit_id) DO UPDATE SET price_paisa = excluded.price_paisa, valid_from = excluded.valid_from",
                params![ulid::Ulid::new().to_string(), list, old.variant_id, input.base_unit_id, price, now_str],
            )?;
            Ok(())
        };
        upsert_price("retail", input.retail_price_paisa)?;
        if let Some(w) = input.wholesale_price_paisa {
            upsert_price("wholesale", w)?;
        } else {
            tx.execute(
                "DELETE FROM prices WHERE variant_id = ?1 AND unit_id = ?2 AND price_list_id = 'wholesale'",
                params![old.variant_id, input.base_unit_id],
            )?;
        }

        // If price changed, write price_changed audit
        if old.retail_price_paisa != input.retail_price_paisa {
            AuditRepo::write(
                &tx,
                Some(&user_id),
                "price_changed",
                "variant",
                Some(&old.variant_id),
                None,
                Some(&format!("{{\"old_retail\":{},\"new_retail\":{}}}", old.retail_price_paisa, input.retail_price_paisa)),
            )?;
        }

        // 6. Handle packaging unit
        if let Some(old_pkg) = &old.packaging_unit {
            tx.execute(
                "DELETE FROM variant_units WHERE variant_id = ?1 AND factor_to_base != 1000",
                params![old.variant_id],
            )?;
            if let Some(old_pbc) = &old_pkg.barcode {
                tx.execute(
                    "DELETE FROM barcodes WHERE variant_id = ?1 AND value = ?2",
                    params![old.variant_id, old_pbc],
                )?;
            }
            tx.execute(
                "DELETE FROM prices WHERE variant_id = ?1 AND unit_id = ?2",
                params![old.variant_id, old_pkg.unit_id],
            )?;
        }

        if let Some(new_pkg) = &input.packaging_unit {
            let pkg_unit_id = ulid::Ulid::new().to_string();
            let pbc = new_pkg.barcode.as_deref().map(str::trim).filter(|b| !b.is_empty());
            tx.execute(
                "INSERT INTO variant_units (id, variant_id, unit_id, factor_to_base, barcode, is_sale_unit, is_purchase_unit, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6)",
                params![pkg_unit_id, old.variant_id, new_pkg.unit_id, new_pkg.factor_to_base, pbc, now_str],
            )?;
            if let Some(bc) = pbc {
                tx.execute(
                    "INSERT INTO barcodes (id, variant_id, value, kind, created_at) VALUES (?1, ?2, ?3, 'manufacturer', ?4)",
                    params![ulid::Ulid::new().to_string(), old.variant_id, bc, now_str],
                )?;
            }
            if let Some(pr) = new_pkg.retail_price_paisa {
                tx.execute(
                    "INSERT INTO prices (id, price_list_id, variant_id, unit_id, price_paisa, valid_from) VALUES (?1, 'retail', ?2, ?3, ?4, ?5)",
                    params![ulid::Ulid::new().to_string(), old.variant_id, new_pkg.unit_id, pr, now_str],
                )?;
            }
        }

        // 7. Audit log
        AuditRepo::write(
            &tx,
            Some(&user_id),
            "product_updated",
            "product",
            Some(&input.product_id),
            None,
            Some(&serde_json::to_string(&changes).unwrap_or_default()),
        )?;

        tx.commit().map_err(|e| PosError::Db(format!("Failed to commit product update: {}", e)))?;

        CatalogRepo::get_by_id(self.conn()?, &input.product_id)?
            .ok_or_else(|| PosError::Db("Product updated but could not be loaded".into()))
    }

    pub fn list_units(&self) -> Result<Vec<Unit>> {
        self.require_login()?;
        UnitRepo::list(self.conn()?)
    }

    pub fn create_unit(&self, code: &str, name: &str, decimals: u8) -> Result<Unit> {
        self.require(Permission::PriceEdit)?;
        UnitRepo::create(self.conn()?, code, name, decimals.min(3))
    }

    pub fn list_categories(&self) -> Result<Vec<Category>> {
        self.require_login()?;
        CategoryRepo::list(self.conn()?)
    }

    pub fn create_category(&self, name: &str, name_ur: Option<String>, parent_id: Option<String>) -> Result<Category> {
        self.require(Permission::PriceEdit)?;
        CategoryRepo::create(self.conn()?, name, clean(name_ur).as_deref(), parent_id.as_deref())
    }

    pub fn list_brands(&self) -> Result<Vec<Brand>> {
        self.require_login()?;
        BrandRepo::list(self.conn()?)
    }

    pub fn create_brand(&self, name: &str, name_ur: Option<String>) -> Result<Brand> {
        self.require(Permission::PriceEdit)?;
        BrandRepo::create(self.conn()?, name, clean(name_ur).as_deref())
    }

    pub fn list_tax_rates(&self) -> Result<Vec<TaxRate>> {
        self.require_login()?;
        let conn = self.conn()?;
        let rows = conn
            .prepare("SELECT id, name, rate_bp, inclusive FROM tax_rates ORDER BY rate_bp")?
            .query_map([], |r| Ok(TaxRate { id: r.get(0)?, name: r.get(1)?, rate_bp: r.get(2)?, inclusive: r.get::<_, i64>(3)? == 1 }))?
            .collect::<std::result::Result<_, _>>()?;
        Ok(rows)
    }

    pub fn create_tax_rate(&self, name: &str, rate_bp: i64, inclusive: bool) -> Result<TaxRate> {
        let s = self.require(Permission::SettingsManage)?;
        if name.trim().is_empty() || !(0..=10_000).contains(&rate_bp) {
            return Err(PosError::Validation("Tax name is required and rate must be 0% to 100%".into()));
        }
        let id = ulid::Ulid::new().to_string();
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO tax_rates (id, name, rate_bp, inclusive, fbr_code, created_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
            params![id, name.trim(), rate_bp, inclusive as i64, now().to_rfc3339()],
        )?;
        AuditRepo::write(conn, Some(&s.user_id), "tax_rate_created", "tax_rate", Some(&id), None, None)?;
        Ok(TaxRate { id, name: name.trim().to_string(), rate_bp, inclusive })
    }

    pub fn import_csv(&mut self, csv_text: &str) -> Result<ImportSummary> {
        let uid = self.require(Permission::PriceEdit)?.user_id.clone();
        let summary = CatalogImporter::import_csv(self.conn_mut()?, csv_text.as_bytes())?;
        AuditRepo::write(self.conn()?, Some(&uid), "catalog_imported", "product", None, None,
            Some(&format!("{{\"imported\":{},\"skipped\":{}}}", summary.imported, summary.skipped)))?;
        Ok(summary)
    }

    /// Stock of products (services have no stock and are left out).
    pub fn stock_list(&self) -> Result<Vec<InventoryBalanceView>> {
        self.require_login()?;
        let conn = self.conn()?;
        let services: std::collections::HashSet<String> = conn
            .prepare("SELECT pv.id FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE p.is_service = 1")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        Ok(InventoryRepo::list_balances(conn)?.into_iter().filter(|b| !services.contains(&b.variant_id)).collect())
    }

    // ------------------------------------------------------------ customers / vendors

    pub fn list_customers(&self, query: &str) -> Result<Vec<CustomerSummary>> {
        self.require_login()?;
        self.list_parties(&["customer", "both"], query)
    }

    pub fn list_vendors(&self, query: &str) -> Result<Vec<CustomerSummary>> {
        self.require_login()?;
        self.list_parties(&["vendor", "both"], query)
    }

    fn list_parties(&self, types: &[&str], query: &str) -> Result<Vec<CustomerSummary>> {
        let conn = self.conn()?;
        let like = format!("%{}%", query.trim().to_lowercase());
        let rows: Vec<CustomerSummary> = conn
            .prepare(
                "SELECT id, party_type, name, name_ur, phone, credit_limit_paisa, price_list_id FROM parties
                 WHERE active = 1 AND party_type IN (?1, ?2)
                   AND (lower(name) LIKE ?3 OR IFNULL(phone,'') LIKE ?3 OR IFNULL(name_ur,'') LIKE ?3)
                 ORDER BY name LIMIT 300",
            )?
            .query_map(params![types[0], types[1], like], |r| {
                Ok(CustomerSummary {
                    id: r.get(0)?,
                    party_type: r.get(1)?,
                    name: r.get(2)?,
                    name_ur: r.get(3)?,
                    phone: r.get(4)?,
                    credit_limit_paisa: r.get(5)?,
                    balance_paisa: 0,
                    price_list_id: r.get(6)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        rows.into_iter()
            .map(|mut c| {
                c.balance_paisa = KhataRepo::get_balance(conn, &c.id)?;
                Ok(c)
            })
            .collect()
    }

    pub fn create_party(&self, input: CustomerInput) -> Result<CustomerSummary> {
        let ptype = input.party_type.clone().unwrap_or_else(|| "customer".into());
        let s = match ptype.as_str() {
            "customer" => self.require(Permission::SalesCreate)?,
            "vendor" | "both" => self.require(Permission::PurchaseEntry)?,
            _ => return Err(PosError::Validation("Party type must be customer, vendor or both".into())),
        };
        // Credit limit and opening balance are money decisions: Owner/Manager only.
        if (input.credit_limit_paisa != 0 || input.opening_balance_paisa != 0) && !s.role.can(Permission::PriceEdit) {
            return Err(perm_err("Only an Owner or Manager can set a credit limit or opening balance"));
        }
        if input.credit_limit_paisa < 0 {
            return Err(PosError::Validation("Credit limit cannot be negative".into()));
        }
        if let Some(list) = &input.price_list_id {
            if list != "retail" && list != "wholesale" {
                return Err(PosError::Validation("Unknown price list".into()));
            }
        }
        let uid = s.user_id.clone();
        let conn = self.conn()?;
        let p: Party = PartyRepo::create_party(conn, CreatePartyParams {
            party_type: ptype,
            name: input.name,
            name_ur: clean(input.name_ur),
            phone: clean(input.phone),
            cnic: clean(input.cnic),
            ntn: clean(input.ntn),
            credit_limit_paisa: input.credit_limit_paisa,
            opening_balance_paisa: input.opening_balance_paisa,
            price_list_id: input.price_list_id,
        })?;
        AuditRepo::write(conn, Some(&uid), "party_created", "party", Some(&p.id), None, None)?;
        Ok(CustomerSummary {
            id: p.id,
            party_type: p.party_type,
            name: p.name,
            name_ur: p.name_ur,
            phone: p.phone,
            credit_limit_paisa: p.credit_limit_paisa,
            balance_paisa: p.opening_balance_paisa,
            price_list_id: p.price_list_id,
        })
    }

    // ------------------------------------------------------------ shift

    pub fn active_shift(&self) -> Result<Option<CashSession>> {
        let s = self.require_login()?;
        ShiftRepo::get_active_session(self.conn()?, &s.user_id)
    }

    pub fn start_shift(&mut self, opening_float_paisa: i64) -> Result<CashSession> {
        let uid = self.require(Permission::SalesCreate)?.user_id.clone();
        if opening_float_paisa < 0 {
            return Err(PosError::Validation("Opening cash cannot be negative".into()));
        }
        let cs = ShiftRepo::start_shift(self.conn_mut()?, &uid, opening_float_paisa)?;
        AuditRepo::write(self.conn()?, Some(&uid), "shift_opened", "cash_session", Some(&cs.id), None, None)?;
        Ok(cs)
    }

    pub fn cash_drop(&mut self, amount_paisa: i64, reason: &str) -> Result<()> {
        let uid = self.require(Permission::SalesCreate)?.user_id.clone();
        if amount_paisa <= 0 {
            return Err(PosError::Validation("Amount must be greater than zero".into()));
        }
        let cs = ShiftRepo::get_active_session(self.conn()?, &uid)?.ok_or_else(|| perm_err("No open shift"))?;
        ShiftRepo::record_cash_drop(self.conn_mut()?, &cs.id, amount_paisa, reason)?;
        AuditRepo::write(self.conn()?, Some(&uid), "cash_drop", "cash_session", Some(&cs.id), Some(reason), None)?;
        Ok(())
    }

    /// Preview of the Z-report numbers is only given after the cash is counted
    /// (blind close), so the cashier cannot just type the expected figure.
    pub fn close_shift(&mut self, counted_cash_paisa: i64) -> Result<ZReportData> {
        let uid = self.require(Permission::SalesCreate)?.user_id.clone();
        let cs = ShiftRepo::get_active_session(self.conn()?, &uid)?.ok_or_else(|| perm_err("No open shift"))?;
        if counted_cash_paisa < 0 {
            return Err(PosError::Validation("Counted cash cannot be negative".into()));
        }
        let z = ShiftRepo::close_shift(self.conn_mut()?, &cs.id, counted_cash_paisa)?;
        AuditRepo::write(self.conn()?, Some(&uid), "shift_closed", "cash_session", Some(&cs.id), None,
            Some(&format!("{{\"variance\":{}}}", z.variance_paisa)))?;
        self.last_z_report = Some(z.clone());
        Ok(z)
    }

    // ------------------------------------------------------------ checkout

    fn customer_summary(&self, id: &str) -> Result<CustomerSummary> {
        let conn = self.conn()?;
        let p = PartyRepo::get_by_id(conn, id)?;
        Ok(CustomerSummary {
            balance_paisa: KhataRepo::get_balance(conn, &p.id)?,
            id: p.id,
            party_type: p.party_type,
            name: p.name,
            name_ur: p.name_ur,
            phone: p.phone,
            credit_limit_paisa: p.credit_limit_paisa,
            price_list_id: p.price_list_id,
        })
    }

    /// Prices the cart from the database. The counter shows exactly these numbers,
    /// and `checkout` posts exactly the same numbers.
    pub fn quote(&self, customer_id: Option<&str>, lines: &[CheckoutLineInput], global_discount_paisa: i64) -> Result<Quote> {
        self.require_login()?;
        let conn = self.conn()?;
        let customer = match customer_id {
            Some(id) => Some(self.customer_summary(id)?),
            None => None,
        };
        let list = customer.as_ref().and_then(|c| c.price_list_id.clone()).unwrap_or_else(|| "retail".into());
        let mut out = Vec::with_capacity(lines.len());
        let (mut sub, mut disc, mut tax) = (0i64, 0i64, 0i64);
        for l in lines {
            if l.qty_milli <= 0 {
                return Err(PosError::Validation("Quantity must be greater than zero".into()));
            }
            if l.discount_paisa < 0 {
                return Err(PosError::Validation("Discount cannot be negative".into()));
            }
            let factor = unit_factor(conn, &l.variant_id, &l.unit_id)?;
            let catalog = catalog_price(conn, &l.variant_id, &l.unit_id, factor, &list)?
                .or(catalog_price(conn, &l.variant_id, &l.unit_id, factor, "retail")?)
                .ok_or_else(|| PosError::Validation("This item has no selling price; set one in Catalog".into()))?;
            let price = l.price_override_paisa.unwrap_or(catalog);
            if price < 0 {
                return Err(PosError::Validation("Price cannot be negative".into()));
            }
            let info = line_info(conn, &l.variant_id, &l.unit_id)?;
            let gross = mul_div_half_up(l.qty_milli, price, 1000);
            if l.discount_paisa > gross {
                return Err(PosError::Validation(format!("Discount on {} is larger than the line", info.name)));
            }
            let net = gross - l.discount_paisa;
            // Tax-inclusive prices already contain the tax; only exclusive rates add to the bill.
            let line_tax = if info.tax_inclusive { 0 } else { mul_div_half_up(net, info.tax_bp, 10_000) };
            sub += gross;
            disc += l.discount_paisa;
            tax += line_tax;
            out.push(QuoteLine {
                variant_id: l.variant_id.clone(),
                unit_id: l.unit_id.clone(),
                unit_code: info.unit_code,
                sku: info.sku,
                name: info.name,
                name_ur: info.name_ur,
                qty_milli: l.qty_milli,
                unit_price_paisa: price,
                catalog_price_paisa: catalog,
                min_price_paisa: min_sale_price(conn, &l.variant_id, &l.unit_id, factor)?,
                discount_paisa: l.discount_paisa,
                tax_paisa: line_tax,
                total_paisa: net + line_tax,
                on_hand_milli: InventoryRepo::get_on_hand_qty(conn, &l.variant_id)?.0,
                is_service: self.variant_is_service(&l.variant_id),
            });
        }
        if global_discount_paisa < 0 || global_discount_paisa > sub - disc {
            return Err(PosError::Validation("Bill discount must be between zero and the bill amount".into()));
        }
        Ok(Quote {
            lines: out,
            subtotal_paisa: sub,
            discount_paisa: disc + global_discount_paisa,
            tax_paisa: tax,
            total_paisa: sub - disc - global_discount_paisa + tax,
            customer,
        })
    }

    pub fn checkout(&mut self, input: CheckoutInput) -> Result<ReceiptData> {
        let session = self.require(Permission::SalesCreate)?.clone();
        let license = self.require_selling_license()?;
        let shift = ShiftRepo::get_active_session(self.conn()?, &session.user_id)?
            .ok_or_else(|| perm_err("Start your shift (opening cash) before making a sale"))?;

        let quote = self.quote(input.customer_id.as_deref(), &input.lines, input.global_discount_paisa)?;

        let approver = match &input.approval {
            Some(a) => Some(self.verify_approval(a, "Approval")?),
            None => None,
        };
        let self_manager = session.role.can(Permission::PriceEdit);
        let manager_id = approver.clone().or(if self_manager { Some(session.user_id.clone()) } else { None });

        let has_discount = input.global_discount_paisa > 0 || input.lines.iter().any(|l| l.discount_paisa > 0);
        if has_discount && !session.role.can(Permission::SalesDiscount) && approver.is_none() {
            return Err(perm_err("Discounts need Owner/Manager approval"));
        }

        // Counter prices: any price at or above the wholesale price is allowed; the
        // core refuses anything lower (see SaleRepo::post_sale) and logs each change.
        let mut lines = Vec::with_capacity(quote.lines.len());
        for q in &quote.lines {
            let overridden = q.unit_price_paisa != q.catalog_price_paisa;
            lines.push(PostSaleLineInput {
                variant_id: q.variant_id.clone(),
                unit_id: q.unit_id.clone(),
                qty_milli: q.qty_milli,
                unit_price_paisa: q.unit_price_paisa,
                discount_paisa: q.discount_paisa,
                tax_paisa: q.tax_paisa,
                price_override_by: if overridden { approver.clone() } else { None },
            });
        }

        // Going over the customer's credit limit needs an Owner/Manager.
        let credit_paisa: i64 = input.tenders.iter().filter(|t| t.method == "credit").map(|t| t.amount_paisa).sum();
        let mut credit_override_by = None;
        if credit_paisa > 0 {
            let cid = input.customer_id.as_deref().ok_or_else(|| PosError::Validation("Select a customer for a khata (credit) sale".into()))?;
            let check = KhataRepo::check_credit_limit(self.conn()?, cid, credit_paisa)?;
            if !check.allowed {
                credit_override_by = Some(manager_id.clone().ok_or_else(|| perm_err(&format!(
                    "Credit limit exceeded (balance would be Rs {}, limit Rs {}); Owner/Manager approval needed",
                    check.resulting_balance_paisa / 100,
                    check.credit_limit_paisa / 100
                )))?);
            }
        }

        let posted = SaleRepo::post_sale(self.conn_mut()?, PostSaleRequest {
            customer_id: input.customer_id.clone(),
            cash_session_id: Some(shift.id),
            lines,
            global_discount_paisa: input.global_discount_paisa,
            tenders: input.tenders,
            user_id: Some(session.user_id.clone()),
            credit_override_by,
        });
        let sale = match posted {
            Ok(s) => s,
            // Say which product, in its own unit, instead of internal ids.
            Err(PosError::NegativeStockBlocked { variant_id, requested_milli, available_milli }) => {
                let (name, unit): (String, String) = self
                    .conn()?
                    .query_row(
                        "SELECT p.name, u.code FROM product_variants pv JOIN products p ON p.id = pv.product_id JOIN units u ON u.id = p.base_unit_id WHERE pv.id = ?1",
                        params![variant_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .unwrap_or_else(|_| ("this item".into(), String::new()));
                return Err(PosError::BusinessRule(format!(
                    "Not enough stock for {}: selling {}, only {} in stock",
                    name,
                    qty_text(requested_milli, &unit),
                    qty_text(available_milli.max(0), &unit)
                )));
            }
            Err(e) => return Err(e),
        };
        Ok(ReceiptData {
            store: SettingsRepo::get(self.conn()?).ok(),
            sale,
            cashier: Some(session.username),
            trial_watermark: license.requires_receipt_watermark(),
        })
    }

    pub fn recent_sales(&self, limit: usize) -> Result<Vec<RecentSale>> {
        self.require(Permission::SalesReturn)?;
        let conn = self.conn()?;
        let rows = conn
            .prepare(
                "SELECT s.id, s.doc_no, p.name, s.total_paisa, s.status, s.created_at FROM sales s
                 LEFT JOIN parties p ON p.id = s.party_id ORDER BY s.created_at DESC LIMIT ?1",
            )?
            .query_map(params![limit.clamp(1, 500) as i64], |r| {
                Ok(RecentSale { id: r.get(0)?, doc_no: r.get(1)?, customer_name: r.get(2)?, total_paisa: r.get(3)?, status: r.get(4)?, created_at: r.get(5)? })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(rows)
    }

    /// Reprint: rebuilds the receipt of a posted sale from the database.
    pub fn receipt(&self, sale_id: &str) -> Result<ReceiptData> {
        self.require_login()?;
        let conn = self.conn()?;
        let sale = load_sale(conn, sale_id)?;
        let lic = self.license_status()?;
        Ok(ReceiptData { store: SettingsRepo::get(conn).ok(), sale, cashier: None, trial_watermark: lic.requires_receipt_watermark() })
    }

    // ------------------------------------------------------------ parked carts

    pub fn park_cart(&self, name: &str, customer_id: Option<String>, lines: &[CheckoutLineInput]) -> Result<String> {
        self.require(Permission::SalesCreate)?;
        let quote = self.quote(customer_id.as_deref(), lines, 0)?;
        let mut cart = Cart::new();
        cart.customer_id = customer_id;
        for q in quote.lines {
            cart.lines.push(CartLine {
                id: ulid::Ulid::new().to_string(),
                variant_id: q.variant_id,
                sku: q.sku,
                name: q.name,
                name_ur: q.name_ur,
                unit_id: q.unit_id,
                unit_code: q.unit_code,
                barcode: None,
                qty: Qty(q.qty_milli),
                unit_price: crate::money::Paisa(q.unit_price_paisa),
                discount_basis_points: 0,
                tax_rate_basis_points: 0,
            });
        }
        let name = if name.trim().is_empty() { format!("Cart {}", Utc::now().format("%H:%M")) } else { name.trim().to_string() };
        CartRepo::park_cart(self.conn()?, &cart, &name)
    }

    pub fn list_parked(&self) -> Result<Vec<ParkedCartSummary>> {
        self.require(Permission::SalesCreate)?;
        CartRepo::list_parked_carts(self.conn()?)
    }

    /// Takes a parked cart back. Prices are re-read from the catalog (not from the
    /// parked copy), so a price change while it was parked is applied.
    pub fn recall_parked(&mut self, id: &str) -> Result<(Option<String>, Vec<CheckoutLineInputOut>)> {
        self.require(Permission::SalesCreate)?;
        let cart = CartRepo::recall_cart(self.conn_mut()?, id)?;
        let lines = cart
            .lines
            .into_iter()
            .map(|l| CheckoutLineInputOut { variant_id: l.variant_id, unit_id: l.unit_id, qty_milli: l.qty.0 })
            .collect();
        Ok((cart.customer_id, lines))
    }

    pub fn delete_parked(&self, id: &str) -> Result<()> {
        let s = self.require(Permission::SalesCreate)?;
        let conn = self.conn()?;
        conn.execute("DELETE FROM parked_carts WHERE id = ?1", params![id])?;
        AuditRepo::write(conn, Some(&s.user_id), "parked_cart_deleted", "parked_cart", Some(id), None, None)?;
        Ok(())
    }

    // ------------------------------------------------------------ returns

    pub fn find_sale_for_return(&self, doc_no: &str) -> Result<ReturnableSale> {
        self.require(Permission::SalesReturn)?;
        let conn = self.conn()?;
        let (id, doc, created, cust, total): (String, String, String, Option<String>, i64) = conn
            .query_row(
                "SELECT s.id, s.doc_no, s.created_at, p.name, s.total_paisa FROM sales s
                 LEFT JOIN parties p ON p.id = s.party_id
                 WHERE upper(s.doc_no) = upper(?1) AND s.status = 'posted'",
                params![doc_no.trim()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .optional()?
            .ok_or_else(|| PosError::NotFound(format!("No sale with invoice number {}", doc_no.trim())))?;
        let lines = conn
            .prepare(
                "SELECT sl.id, sl.variant_id, sl.unit_id, u.code, pv.sku, p.name, p.name_ur, sl.qty_milli,
                        COALESCE((SELECT SUM(rl.qty_milli) FROM sale_return_lines rl WHERE rl.original_sale_line_id = sl.id), 0),
                        sl.unit_price_paisa, sl.total_paisa
                 FROM sale_lines sl
                 JOIN product_variants pv ON pv.id = sl.variant_id
                 JOIN products p ON p.id = pv.product_id
                 JOIN units u ON u.id = sl.unit_id
                 WHERE sl.sale_id = ?1",
            )?
            .query_map(params![id], |r| {
                Ok(ReturnableLine {
                    sale_line_id: r.get(0)?,
                    variant_id: r.get(1)?,
                    unit_id: r.get(2)?,
                    unit_code: r.get(3)?,
                    sku: r.get(4)?,
                    name: r.get(5)?,
                    name_ur: r.get(6)?,
                    qty_milli: r.get(7)?,
                    returned_qty_milli: r.get(8)?,
                    unit_price_paisa: r.get(9)?,
                    total_paisa: r.get(10)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(ReturnableSale { id, doc_no: doc, created_at: created, customer_name: cust, total_paisa: total, lines })
    }

    pub fn post_return(&mut self, input: ReturnInput) -> Result<CompletedReturn> {
        let session = self.require(Permission::SalesReturn)?.clone();
        // Cashiers can take returns only with an Owner/Manager PIN.
        if !session.role.can(Permission::SalesVoid) {
            let a = input.approval.as_ref().ok_or_else(|| perm_err("Returns need Owner/Manager approval"))?;
            self.verify_approval(a, "Customer return")?;
        }
        let conn = self.conn()?;
        let mut lines = Vec::with_capacity(input.lines.len());
        for l in input.lines.iter().filter(|l| l.qty_milli > 0) {
            let (variant_id, unit_id, sale_id, sold_qty, line_total): (String, String, String, i64, i64) = conn
                .query_row(
                    "SELECT variant_id, unit_id, sale_id, qty_milli, total_paisa FROM sale_lines WHERE id = ?1",
                    params![l.sale_line_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
                .optional()?
                .ok_or_else(|| PosError::NotFound("Sale line not found".into()))?;
            if sale_id != input.sale_id {
                return Err(PosError::Validation("Return line does not belong to this sale".into()));
            }
            // Refund = what the customer actually paid for these units (same rule as ReturnRepo).
            let (sale_total, sum_lines): (i64, i64) = conn.query_row(
                "SELECT s.total_paisa, (SELECT COALESCE(SUM(total_paisa),0) FROM sale_lines WHERE sale_id = s.id) FROM sales s WHERE s.id = ?1",
                params![sale_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let (already_qty, already_refund): (i64, i64) = conn.query_row(
                "SELECT COALESCE(SUM(qty_milli),0), COALESCE(SUM(refund_paisa),0) FROM sale_return_lines WHERE original_sale_line_id = ?1",
                params![l.sale_line_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let paid_for_line = if sum_lines > 0 { mul_div_half_up(line_total, sale_total, sum_lines) } else { 0 };
            let cap = if sold_qty > 0 { mul_div_half_up(paid_for_line, already_qty + l.qty_milli, sold_qty) } else { 0 };
            lines.push(crate::domain::refund::ReturnLineRequest {
                original_sale_line_id: l.sale_line_id.clone(),
                variant_id,
                unit_id,
                qty_milli: l.qty_milli,
                refund_paisa: (cap - already_refund).max(0),
                restock_type: if l.damaged { "damaged".into() } else { "sellable".into() },
            });
        }
        if lines.is_empty() {
            return Err(PosError::Validation("Enter a quantity for at least one item".into()));
        }
        let shift = ShiftRepo::get_active_session(conn, &session.user_id)?;
        if input.refund_method == "cash" && shift.is_none() {
            return Err(perm_err("Start your shift before giving a cash refund"));
        }
        ReturnRepo::post_return(self.conn_mut()?, PostReturnRequest {
            original_sale_id: input.sale_id,
            lines,
            reason: clean(input.reason),
            refund_method: input.refund_method,
            cash_session_id: shift.map(|s| s.id),
        })
    }

    // ------------------------------------------------------------ khata

    pub fn khata_statement(&self, party_id: &str, from: &str, to: &str) -> Result<KhataStatement> {
        self.require_login()?;
        let (from, to) = day_range(from, to);
        KhataRepo::get_statement(self.conn()?, party_id, &from, &to)
    }

    pub fn receive_payment(&mut self, party_id: &str, amount_paisa: i64, method: &str, reference: Option<String>) -> Result<PaymentAllocationResult> {
        let uid = self.require(Permission::SalesCreate)?.user_id.clone();
        if amount_paisa <= 0 {
            return Err(PosError::Validation("Amount must be greater than zero".into()));
        }
        if !["cash", "card", "jazzcash", "easypaisa", "raast", "bank", "cheque"].contains(&method) {
            return Err(PosError::Validation("Unknown payment method".into()));
        }
        let shift = ShiftRepo::get_active_session(self.conn()?, &uid)?;
        if method == "cash" && shift.is_none() {
            return Err(perm_err("Start your shift before receiving cash"));
        }
        let shift_id = shift.map(|s| s.id);
        let r = KhataRepo::allocate_payment_fifo(self.conn_mut()?, party_id, amount_paisa, method, reference.as_deref(), shift_id.as_deref())?;
        AuditRepo::write(self.conn()?, Some(&uid), "khata_payment", "party", Some(party_id), None,
            Some(&format!("{{\"amount\":{},\"method\":\"{}\"}}", amount_paisa, method)))?;
        Ok(r)
    }

    pub fn aging(&self, party_type: &str) -> Result<Vec<AgingReportBucket>> {
        self.require(Permission::ReportsView)?;
        KhataRepo::get_aging_buckets(self.conn()?, party_type)
    }

    /// Builds the WhatsApp reminder link on the backend (never from UI input).
    pub fn whatsapp_reminder_url(&self, party_id: &str) -> Result<String> {
        self.require_login()?;
        let conn = self.conn()?;
        let p = PartyRepo::get_by_id(conn, party_id)?;
        let phone = p.phone.clone().ok_or_else(|| PosError::Validation("This customer has no phone number".into()))?;
        let bal = KhataRepo::get_balance(conn, party_id)?;
        let store = SettingsRepo::get(conn).map(|s| s.name).unwrap_or_else(|_| "Our shop".into());
        Ok(KhataRepo::build_whatsapp_url(&p.name, &phone, bal, &store))
    }

    // ------------------------------------------------------------ purchases

    pub fn post_purchase(&mut self, mut input: CreatePurchaseInput) -> Result<PurchaseInvoice> {
        let uid = self.require(Permission::PurchaseEntry)?.user_id.clone();
        input.user_id = Some(uid);
        if let Some(l) = input.lines.iter().find(|l| self.variant_is_service(&l.variant_id)) {
            let name: String = self.conn()?.query_row(
                "SELECT p.name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?1",
                params![l.variant_id],
                |r| r.get(0),
            )?;
            return Err(PosError::Validation(format!("{name} is a service: services have no stock to buy")));
        }
        PurchaseRepo::post_purchase(self.conn_mut()?, input)
    }

    pub fn list_purchases(&self, limit: usize) -> Result<Vec<PurchaseInvoice>> {
        self.require(Permission::PurchaseEntry)?;
        PurchaseRepo::list_purchases(self.conn()?, limit.clamp(1, 500))
    }

    // ------------------------------------------------------------ stock count

    pub fn start_stock_count(&self, notes: Option<String>) -> Result<StockCountSession> {
        self.require(Permission::InventoryAdjust)?;
        StockCountRepo::start_session(self.conn()?, clean(notes))
    }

    /// Saves counts. Counting the same item again replaces its earlier count
    /// (otherwise the adjustment would be applied twice when the count is applied).
    pub fn record_stock_counts(&mut self, session_id: &str, items: Vec<RecordCountItemInput>) -> Result<()> {
        self.require(Permission::InventoryAdjust)?;
        if items.iter().any(|i| i.counted_qty_milli < 0) {
            return Err(PosError::Validation("Counted quantity cannot be negative".into()));
        }
        let conn = self.conn()?;
        let status: Option<String> = conn
            .query_row("SELECT status FROM stock_count_sessions WHERE id = ?1", params![session_id], |r| r.get(0))
            .optional()?;
        if status.as_deref() != Some("in_progress") {
            return Err(PosError::BusinessRule("This stock count is not open".into()));
        }
        for i in &items {
            conn.execute(
                "DELETE FROM stock_count_lines WHERE session_id = ?1 AND variant_id = ?2",
                params![session_id, i.variant_id],
            )?;
        }
        StockCountRepo::record_counts(self.conn_mut()?, session_id, items)
    }

    /// The stock count that is still open, with the items counted so far.
    pub fn current_stock_count(&self) -> Result<Option<StockCountSession>> {
        self.require(Permission::InventoryAdjust)?;
        let conn = self.conn()?;
        let head: Option<(String, String, Option<String>, String)> = conn
            .query_row(
                "SELECT id, doc_no, notes, started_at FROM stock_count_sessions WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()?;
        let Some((id, doc_no, notes, started_at)) = head else { return Ok(None) };
        let lines = conn
            .prepare(
                "SELECT scl.id, scl.variant_id, pv.sku, p.name, scl.expected_qty_milli, scl.counted_qty_milli,
                        scl.variance_qty_milli, scl.unit_cost_paisa, scl.variance_value_paisa, scl.notes
                 FROM stock_count_lines scl JOIN product_variants pv ON pv.id = scl.variant_id JOIN products p ON p.id = pv.product_id
                 WHERE scl.session_id = ?1 ORDER BY p.name",
            )?
            .query_map(params![id], |r| {
                Ok(crate::domain::stock_count::StockCountLine {
                    id: r.get(0)?,
                    session_id: id.clone(),
                    variant_id: r.get(1)?,
                    sku: r.get(2)?,
                    product_name: r.get(3)?,
                    expected_qty_milli: r.get(4)?,
                    counted_qty_milli: r.get(5)?,
                    variance_qty_milli: r.get(6)?,
                    unit_cost_paisa: r.get(7)?,
                    variance_value_paisa: r.get(8)?,
                    notes: r.get(9)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(Some(StockCountSession { id, doc_no, status: "in_progress".into(), notes, started_at, completed_at: None, approved_by: None, lines }))
    }

    /// Applying a count changes stock value, so it needs an Owner/Manager.
    pub fn finalize_stock_count(&mut self, session_id: &str) -> Result<StockCountSession> {
        let uid = self.require(Permission::PriceEdit)?.user_id.clone();
        let r = StockCountRepo::finalize_and_adjust(self.conn_mut()?, session_id, &uid)?;
        AuditRepo::write(self.conn()?, Some(&uid), "stock_count_applied", "stock_count", Some(session_id), None, None)?;
        Ok(r)
    }

    // ------------------------------------------------------------ reports

    pub fn financial_summary(&self, from: &str, to: &str) -> Result<FinancialSummary> {
        self.require(Permission::ReportsView)?;
        let (from, to) = day_range(from, to);
        AnalyticsRepo::get_financial_summary(self.conn()?, &from, &to)
    }

    pub fn category_performance(&self, from: &str, to: &str) -> Result<Vec<CategoryPerformance>> {
        self.require(Permission::ReportsView)?;
        let (from, to) = day_range(from, to);
        AnalyticsRepo::get_category_performance(self.conn()?, &from, &to)
    }

    pub fn top_products(&self, from: &str, to: &str, limit: usize) -> Result<Vec<TopProduct>> {
        self.require(Permission::ReportsView)?;
        let (from, to) = day_range(from, to);
        AnalyticsRepo::get_top_products(self.conn()?, &from, &to, limit.clamp(1, 100))
    }

    pub fn inventory_valuation(&self) -> Result<InventoryValuation> {
        self.require(Permission::ReportsView)?;
        AnalyticsRepo::get_inventory_valuation(self.conn()?)
    }

    // ------------------------------------------------------------ license

    pub fn license(&self) -> Result<(LicenseStatus, String)> {
        Ok((self.license_status()?, self.machine_id.clone()))
    }

    pub fn install_license(&self, token: &str) -> Result<LicenseStatus> {
        // Allowed before setup too, so a dealer can activate a fresh install.
        if !UserRepo::needs_first_owner(self.conn()?)? {
            self.require(Permission::SettingsManage)?;
        }
        LicenseStore::install_token(self.conn()?, token, &self.machine_id, &now(), None)
    }

    // ------------------------------------------------------------ backups

    /// Default backup folder: `Documents\NextPOS Backups`.
    pub fn default_backup_dir() -> PathBuf {
        let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| ".".into());
        PathBuf::from(home).join("Documents").join("NextPOS Backups")
    }

    fn backup_dir(dir: Option<&str>) -> Result<PathBuf> {
        let d = match dir.map(str::trim).filter(|d| !d.is_empty()) {
            Some(d) => PathBuf::from(d),
            None => Self::default_backup_dir(),
        };
        if !d.is_absolute() {
            return Err(PosError::Validation("Backup folder must be a full path, for example E:\\".into()));
        }
        Ok(d)
    }

    pub fn create_backup(&self, dir: Option<&str>, password: &str) -> Result<BackupFileInfo> {
        let s = self.require(Permission::BackupManage)?;
        let d = Self::backup_dir(dir)?;
        std::fs::create_dir_all(&d).map_err(|e| PosError::Db(format!("Cannot create backup folder: {}", e)))?;
        let file = d.join(format!("NextPOS_{}.kpos", Utc::now().format("%Y-%m-%d_%H%M%S")));
        let manifest = CryptoBackupService::export_backup(self.conn()?, &file, password)?;
        AuditRepo::write(self.conn()?, Some(&s.user_id), "backup_created", "backup", None, None,
            Some(&serde_json::json!({ "file": file.to_string_lossy() }).to_string()))?;
        file_info(&file, Some(manifest))
    }

    pub fn list_backups(&self, dir: Option<&str>) -> Result<Vec<BackupFileInfo>> {
        if !UserRepo::needs_first_owner(self.conn()?)? {
            self.require(Permission::BackupManage)?;
        }
        let d = Self::backup_dir(dir)?;
        if !d.exists() {
            return Ok(vec![]);
        }
        let mut out = Vec::new();
        for e in std::fs::read_dir(&d).map_err(|e| PosError::Db(e.to_string()))?.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "kpos").unwrap_or(false) {
                let m = CryptoBackupService::read_manifest(&p).ok().map(|(m, _)| m);
                out.push(file_info(&p, m)?);
            }
        }
        out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        Ok(out)
    }

    pub fn verify_backup(&self, path: &str, password: &str) -> Result<BackupManifest> {
        if !UserRepo::needs_first_owner(self.conn()?)? {
            self.require(Permission::BackupManage)?;
        }
        CryptoBackupService::verify_backup(Path::new(path), password)
    }

    /// Replaces the shop database with a backup. Allowed for the Owner, or on a
    /// fresh install (moving to a new PC). Everyone is logged out afterwards.
    pub fn restore_backup(&mut self, path: &str, password: &str) -> Result<RestoreReport> {
        let fresh = UserRepo::needs_first_owner(self.conn()?)?;
        let actor = if fresh { None } else { Some(self.require(Permission::BackupManage)?.user_id.clone()) };
        // Check the file before closing anything.
        CryptoBackupService::verify_backup(Path::new(path), password)?;
        self.session = None;
        self.conn = None; // close the live connection (and WAL) before swapping files
        let result = CryptoBackupService::restore_backup(Path::new(path), &self.db_path(), password, &self.key);
        let reopen = self.connect();
        let report = result?;
        reopen?;
        AuditRepo::write(self.conn()?, actor.as_deref(), "backup_restored", "backup", None, None,
            Some(&serde_json::json!({ "file": path }).to_string()))?;
        Ok(report)
    }

    /// Automatic snapshot (called by a timer in the shell every 30 minutes).
    pub fn auto_snapshot(&self) -> Result<()> {
        let dir = self.snapshot_dir();
        SnapshotManager::create_snapshot(self.conn()?, &dir)?;
        SnapshotManager::apply_retention(&dir, 48, 30)?;
        Ok(())
    }

    pub fn diagnostics(&self) -> Result<DiagnosticsInfo> {
        self.require(Permission::SettingsManage)?;
        let conn = self.conn()?;
        let count = |sql: &str| -> i64 { conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0) };
        let integrity: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).unwrap_or_default();
        Ok(DiagnosticsInfo {
            app_version: crate::pos_core_version().to_string(),
            schema_version: crate::db::connection::schema_version(conn),
            latest_schema_version: crate::db::connection::latest_known_schema_version(),
            sqlcipher_version: crate::db::connection::sqlcipher_version(conn).unwrap_or_default(),
            db_path: self.db_path().to_string_lossy().to_string(),
            db_size_bytes: std::fs::metadata(self.db_path()).map(|m| m.len()).unwrap_or(0),
            integrity_ok: integrity == "ok",
            last_snapshot: SnapshotManager::get_latest_snapshot(&self.snapshot_dir()).map(|s| s.created_at),
            products: count("SELECT COUNT(*) FROM products"),
            sales: count("SELECT COUNT(*) FROM sales"),
            customers: count("SELECT COUNT(*) FROM parties WHERE party_type IN ('customer','both')"),
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CheckoutLineInputOut {
    pub variant_id: String,
    pub unit_id: String,
    pub qty_milli: i64,
}

// ---------------------------------------------------------------- helpers

fn clean(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn validate_pin(pin: &str) -> Result<()> {
    if pin.len() < 4 || pin.len() > 8 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(PosError::Validation("PIN must be 4 to 8 digits".into()));
    }
    Ok(())
}

/// "2026-10-01".."2026-10-31" → whole days, inclusive, in RFC 3339 so text
/// comparison against stored timestamps works.
fn day_range(from: &str, to: &str) -> (String, String) {
    let f = if from.len() == 10 { format!("{}T00:00:00", from) } else { from.to_string() };
    let t = if to.len() == 10 {
        chrono::NaiveDate::parse_from_str(to, "%Y-%m-%d")
            .map(|d| format!("{}T00:00:00", d + Duration::days(1)))
            .unwrap_or_else(|_| to.to_string())
    } else {
        to.to_string()
    };
    (f, t)
}

struct LineInfo {
    sku: String,
    name: String,
    name_ur: Option<String>,
    unit_code: String,
    tax_bp: i64,
    tax_inclusive: bool,
}

fn line_info(conn: &Connection, variant_id: &str, unit_id: &str) -> Result<LineInfo> {
    conn.query_row(
        "SELECT pv.sku, p.name, p.name_ur, u.code, COALESCE(tr.rate_bp, 0), COALESCE(tr.inclusive, 1)
         FROM product_variants pv JOIN products p ON p.id = pv.product_id
         JOIN units u ON u.id = ?2
         LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
         WHERE pv.id = ?1 AND p.active = 1",
        params![variant_id, unit_id],
        |r| {
            Ok(LineInfo {
                sku: r.get(0)?,
                name: r.get(1)?,
                name_ur: r.get(2)?,
                unit_code: r.get(3)?,
                tax_bp: r.get(4)?,
                tax_inclusive: r.get::<_, i64>(5)? == 1,
            })
        },
    )
    .optional()?
    .ok_or_else(|| PosError::NotFound("Product not found or inactive".into()))
}

fn sell_units(conn: &Connection, variant_id: &str) -> Result<Vec<SellUnit>> {
    let rows: Vec<(String, String, i64, Option<String>)> = conn
        .prepare(
            "SELECT vu.unit_id, u.code, vu.factor_to_base, vu.barcode FROM variant_units vu
             JOIN units u ON u.id = vu.unit_id
             WHERE vu.variant_id = ?1 AND vu.is_sale_unit = 1 ORDER BY vu.factor_to_base",
        )?
        .query_map(params![variant_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<std::result::Result<_, _>>()?;
    rows.into_iter()
        .map(|(unit_id, unit_code, factor, barcode)| {
            let price_paisa = catalog_price(conn, variant_id, &unit_id, factor, "retail")?;
            Ok(SellUnit { unit_id, unit_code, factor_to_base: factor, barcode, price_paisa })
        })
        .collect()
}

fn scan_result(conn: &Connection, p: ProductSearchResult, unit_id: Option<String>, qty_milli: i64) -> Result<ScanResult> {
    let units = sell_units(conn, &p.variant_id)?;
    let unit_id = unit_id.unwrap_or_else(|| p.base_unit_id.clone());
    let on_hand = InventoryRepo::get_on_hand_qty(conn, &p.variant_id)?.0;
    Ok(ScanResult { product: p, unit_id, qty_milli, units, on_hand_milli: on_hand })
}

fn product_row(conn: &Connection, p: ProductSearchResult) -> Result<ProductRow> {
    let bal = InventoryRepo::get_balance(conn, &p.variant_id)?;
    let (reorder, service): (i64, i64) = conn
        .query_row("SELECT reorder_level_milli, is_service FROM products WHERE id = ?1", params![p.product_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap_or((0, 0));
    Ok(ProductRow {
        on_hand_milli: bal.as_ref().map(|b| b.on_hand_milli).unwrap_or(0),
        avg_cost_paisa: bal.as_ref().map(|b| b.avg_cost_paisa).unwrap_or(0),
        reorder_level_milli: reorder,
        is_service: service != 0,
        product: p,
    })
}

fn load_sale(conn: &Connection, sale_id: &str) -> Result<CompletedSale> {
    let (id, doc_no, party_id, customer_name, sub, disc, tax, total, created, revision, edited_at): (String, String, Option<String>, Option<String>, i64, i64, i64, i64, String, i64, Option<String>) = conn
        .query_row(
            "SELECT s.id, s.doc_no, s.party_id, p.name, s.subtotal_paisa, s.discount_paisa, s.tax_paisa, s.total_paisa, s.created_at, s.revision, s.edited_at
             FROM sales s LEFT JOIN parties p ON p.id = s.party_id WHERE s.id = ?1",
            params![sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get::<_, Option<i64>>(9)?.unwrap_or(0), r.get(10)?)),
        )
        .optional()?
        .ok_or_else(|| PosError::NotFound("Sale not found".into()))?;
    let lines = conn
        .prepare(
            "SELECT sl.id, sl.variant_id, p.name, pv.sku, u.code, sl.qty_milli, sl.unit_price_paisa, sl.discount_paisa, sl.tax_paisa, sl.total_paisa, sl.cogs_paisa, sl.unit_id
             FROM sale_lines sl JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id
             JOIN units u ON u.id = sl.unit_id WHERE sl.sale_id = ?1",
        )?
        .query_map(params![sale_id], |r| {
            Ok(crate::domain::sale::SaleLineDto {
                id: r.get(0)?,
                variant_id: r.get(1)?,
                product_name: r.get(2)?,
                sku: r.get(3)?,
                unit_code: r.get(4)?,
                unit_id: r.get(11)?,
                qty_milli: r.get(5)?,
                unit_price_paisa: r.get(6)?,
                discount_paisa: r.get(7)?,
                tax_paisa: r.get(8)?,
                total_paisa: r.get(9)?,
                cogs_paisa: r.get(10)?,
            })
        })?
        .collect::<std::result::Result<_, _>>()?;
    // Tenders: payments linked by reference to the invoice, plus khata debit.
    let mut tenders: Vec<PaymentTenderInput> = conn
        .prepare("SELECT method, amount_paisa, reference FROM payments
                  WHERE direction = 'inbound' AND (reference = ?1 OR reference LIKE ?1 || ' (%')")?
        .query_map(params![doc_no], |r| Ok(PaymentTenderInput { method: r.get(0)?, amount_paisa: r.get(1)?, reference: r.get(2)? }))?
        .collect::<std::result::Result<_, _>>()?;
    let credit: i64 = conn
        .query_row("SELECT COALESCE(SUM(debit_paisa),0) FROM party_ledger WHERE source_doc = ?1", params![doc_no], |r| r.get(0))
        .unwrap_or(0);
    if credit > 0 {
        tenders.push(PaymentTenderInput { method: "credit".into(), amount_paisa: credit, reference: None });
    }
    let tendered: i64 = tenders.iter().map(|t| t.amount_paisa).sum();
    Ok(CompletedSale {
        id,
        doc_no,
        customer_id: party_id,
        customer_name,
        subtotal_paisa: sub,
        discount_paisa: disc,
        tax_paisa: tax,
        total_paisa: total,
        tendered_paisa: tendered,
        change_paisa: (tendered - total).max(0),
        lines,
        tenders,
        created_at: created,
        revision,
        edited_at,
    })
}

fn file_info(p: &Path, manifest: Option<BackupManifest>) -> Result<BackupFileInfo> {
    let meta = std::fs::metadata(p).map_err(|e| PosError::Db(e.to_string()))?;
    Ok(BackupFileInfo {
        path: p.to_string_lossy().to_string(),
        filename: p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(),
        size_bytes: meta.len(),
        modified_at: meta.modified().map(|t| DateTime::<Utc>::from(t).to_rfc3339()).unwrap_or_default(),
        manifest,
    })
}

// ---------------------------------------------------------------- printing, reports, snapshots, demo, cloud

#[derive(Debug, Clone, Serialize)]
pub struct LowStockRow {
    pub variant_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub unit_code: String,
    pub on_hand_milli: i64,
    pub reorder_level_milli: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudSettingsView {
    pub enabled: bool,
    pub url: Option<String>,
    /// The key itself is never sent back to the screen.
    pub key_set: bool,
    pub consent_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub pending_events: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloudSettingsInput {
    pub enabled: bool,
    pub url: Option<String>,
    /// None = keep the stored key; Some("") = remove it.
    pub api_key: Option<String>,
}

/// What the shell sends to the cloud in one request.
#[derive(Debug, Clone)]
pub struct CloudBatch {
    pub url: String,
    pub api_key: String,
    pub shop_id: String,
    pub shop_name: String,
    pub event_ids: Vec<String>,
    pub events: Vec<serde_json::Value>,
}

fn setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |r| r.get(0)).optional()?)
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now().to_rfc3339()],
    )?;
    Ok(())
}

fn qty_text(milli: i64, unit: &str) -> String {
    if milli % 1000 == 0 {
        format!("{} {}", milli / 1000, unit)
    } else {
        format!("{:.3} {}", milli as f64 / 1000.0, unit)
    }
}

impl PosApp {
    // ------------------------------------------------------------ printing

    fn store_header(&self) -> (String, Option<String>, Option<String>, Option<String>, Option<String>) {
        match self.conn().ok().and_then(|c| SettingsRepo::get(c).ok()) {
            Some(s) => (s.name, s.name_ur, s.address, s.phone, s.ntn),
            None => ("Next POS".into(), None, None, None, None),
        }
    }

    /// Receipt for a posted sale, built only from the database (the screen
    /// cannot change what is printed).
    pub fn receipt_payload(&self, sale_id: &str) -> Result<crate::hardware::ReceiptPayload> {
        self.require_login()?;
        let conn = self.conn()?;
        let sale = load_sale(conn, sale_id)?;
        let cashier: Option<String> = conn
            .query_row(
                "SELECT u.username FROM audit_log a JOIN users u ON u.id = a.actor
                 WHERE a.action = 'sale_posted' AND a.entity_id = ?1 LIMIT 1",
                params![sale_id],
                |r| r.get(0),
            )
            .optional()?;
        let names_ur: std::collections::HashMap<String, Option<String>> = conn
            .prepare("SELECT pv.id, p.name_ur FROM sale_lines sl JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id WHERE sl.sale_id = ?1")?
            .query_map(params![sale_id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let watermark = self.license_status()?.requires_receipt_watermark();
        let (store_name, store_name_ur, store_address, store_phone, ntn) = self.store_header();
        let edit_note = if sale.revision > 0 {
            Some(format!("Edited rev {} · {}", sale.revision, sale.edited_at.as_deref().unwrap_or(&sale.created_at)))
        } else {
            None
        };
        let footer_note = match (edit_note, watermark) {
            (Some(en), true) => Some(format!("{}\n*** TRIAL VERSION ***", en)),
            (Some(en), false) => Some(format!("{}\nThank you for shopping!", en)),
            (None, true) => Some("TRIAL VERSION - Thank you!".into()),
            (None, false) => Some("Thank you for shopping!".into()),
        };
        Ok(crate::hardware::ReceiptPayload {
            store_name,
            store_name_ur,
            store_address,
            store_phone,
            ntn,
            invoice_no: sale.doc_no.clone(),
            date_time: sale.created_at.clone(),
            cashier_name: cashier.unwrap_or_default(),
            customer_name: sale.customer_name.clone(),
            items: sale
                .lines
                .iter()
                .map(|l| crate::hardware::ReceiptLineItem {
                    name: l.product_name.clone(),
                    name_ur: names_ur.get(&l.variant_id).cloned().flatten(),
                    qty_display: qty_text(l.qty_milli, &l.unit_code),
                    unit_price_paisa: l.unit_price_paisa,
                    total_paisa: l.total_paisa,
                })
                .collect(),
            subtotal_paisa: sale.subtotal_paisa,
            discount_paisa: sale.discount_paisa,
            tax_paisa: sale.tax_paisa,
            grand_total_paisa: sale.total_paisa,
            payments: sale.tenders.iter().map(|t| (t.method.clone(), t.amount_paisa)).collect(),
            change_paisa: sale.change_paisa,
            footer_note,
            footer_note_ur: Some("خریداری کا شکریہ".into()),
        })
    }

    /// The Z report of the shift this session just closed.
    pub fn z_report_payload(&self) -> Result<crate::hardware::ReceiptPayload> {
        let s = self.require_login()?;
        let z = self.last_z_report.as_ref().ok_or_else(|| perm_err("No shift was closed in this session"))?;
        let (store_name, store_name_ur, store_address, store_phone, ntn) = self.store_header();
        let item = |name: &str, v: i64| crate::hardware::ReceiptLineItem {
            name: name.into(),
            name_ur: None,
            qty_display: String::new(),
            unit_price_paisa: v,
            total_paisa: v,
        };
        Ok(crate::hardware::ReceiptPayload {
            store_name,
            store_name_ur,
            store_address,
            store_phone,
            ntn,
            invoice_no: format!("Z-REPORT {}", &z.session_id[z.session_id.len().saturating_sub(6)..]),
            date_time: z.closed_at.clone(),
            cashier_name: s.username.clone(),
            customer_name: None,
            items: vec![
                item("Opening cash", z.opening_float_paisa),
                item(&format!("Sales ({})", z.sales_count), z.gross_sales_paisa),
                item("Discounts", z.discounts_paisa),
                item("Cash", z.tender_cash_paisa),
                item("Card", z.tender_card_paisa),
                item("Digital", z.tender_digital_paisa),
                item("Khata (credit)", z.tender_khata_paisa),
                item("Refunds", z.refunds_paisa),
                item("Cash drops", z.cash_drops_paisa),
                item("Expected cash", z.expected_cash_paisa),
                item("Counted cash", z.counted_cash_paisa),
            ],
            subtotal_paisa: z.net_sales_paisa,
            discount_paisa: z.discounts_paisa,
            tax_paisa: z.taxes_paisa,
            grand_total_paisa: z.net_sales_paisa,
            payments: vec![],
            change_paisa: 0,
            footer_note: Some(format!("Variance: Rs {:.2}", z.variance_paisa as f64 / 100.0)),
            footer_note_ur: None,
        })
    }

    /// A fixed sample receipt for the printer setup screen.
    pub fn test_receipt_payload(&self) -> Result<crate::hardware::ReceiptPayload> {
        let s = self.require(Permission::SettingsManage)?;
        let (store_name, store_name_ur, store_address, store_phone, ntn) = self.store_header();
        Ok(crate::hardware::ReceiptPayload {
            store_name,
            store_name_ur,
            store_address,
            store_phone,
            ntn,
            invoice_no: "TEST PRINT".into(),
            date_time: now().to_rfc3339(),
            cashier_name: s.username.clone(),
            customer_name: None,
            items: vec![crate::hardware::ReceiptLineItem {
                name: "Printer test".into(),
                name_ur: None,
                qty_display: "1".into(),
                unit_price_paisa: 0,
                total_paisa: 0,
            }],
            subtotal_paisa: 0,
            discount_paisa: 0,
            tax_paisa: 0,
            grand_total_paisa: 0,
            payments: vec![],
            change_paisa: 0,
            footer_note: Some("Printer is working".into()),
            footer_note_ur: None,
        })
    }

    /// Printer actions (drawer kick, cut, test) need a logged-in user.
    pub fn require_printer_user(&self) -> Result<()> {
        self.require_login().map(|_| ())
    }

    // ------------------------------------------------------------ reports

    pub fn low_stock(&self) -> Result<Vec<LowStockRow>> {
        self.require(Permission::InventoryAdjust)
            .or_else(|_| self.require(Permission::ReportsView))?;
        let conn = self.conn()?;
        let rows = conn
            .prepare(
                "SELECT pv.id, pv.sku, p.name, p.name_ur, u.code, COALESCE(ib.on_hand_milli, 0), p.reorder_level_milli
                 FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 JOIN units u ON u.id = p.base_unit_id
                 LEFT JOIN inventory_balances ib ON ib.variant_id = pv.id
                 WHERE p.active = 1 AND p.reorder_level_milli > 0
                   AND COALESCE(ib.on_hand_milli, 0) <= p.reorder_level_milli
                 ORDER BY COALESCE(ib.on_hand_milli, 0) ASC LIMIT 200",
            )?
            .query_map([], |r| {
                Ok(LowStockRow {
                    variant_id: r.get(0)?,
                    sku: r.get(1)?,
                    name: r.get(2)?,
                    name_ur: r.get(3)?,
                    unit_code: r.get(4)?,
                    on_hand_milli: r.get(5)?,
                    reorder_level_milli: r.get(6)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(rows)
    }

    // ------------------------------------------------------------ snapshots

    pub fn create_snapshot(&self) -> Result<crate::backup::SnapshotInfo> {
        let s = self.require(Permission::BackupManage)?;
        let dir = self.snapshot_dir();
        let info = SnapshotManager::create_snapshot(self.conn()?, &dir)?;
        SnapshotManager::apply_retention(&dir, 48, 30)?;
        AuditRepo::write(self.conn()?, Some(&s.user_id), "snapshot_created", "backup", None, None, None)?;
        Ok(info)
    }

    pub fn list_snapshots(&self) -> Result<Vec<crate::backup::SnapshotInfo>> {
        self.require(Permission::BackupManage)?;
        let dir = self.snapshot_dir();
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "kdb").unwrap_or(false) {
                    if let Ok(m) = e.metadata() {
                        out.push(crate::backup::SnapshotInfo {
                            path: p.to_string_lossy().to_string(),
                            filename: e.file_name().to_string_lossy().to_string(),
                            file_size_bytes: m.len(),
                            created_at: m.modified().map(|t| DateTime::<Utc>::from(t).to_rfc3339()).unwrap_or_default(),
                            is_valid: m.len() > 0,
                        });
                    }
                }
            }
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }

    // ------------------------------------------------------------ demo catalog

    /// Small sample catalog for demos, created through the normal repositories:
    /// products, a vendor, a purchase that brings in stock, and one customer.
    fn seed_demo_catalog(&mut self) -> Result<()> {
        let conn = self.conn()?;
        let pc = UnitRepo::list(conn)?
            .into_iter()
            .find(|u| u.code.eq_ignore_ascii_case("pc"))
            .ok_or_else(|| PosError::NotFound("Unit 'pc' missing".into()))?
            .id;
        let cat = |n: &str, u: &str| CategoryRepo::create(conn, n, Some(u), None).map(|c| c.id);
        let bev = cat("Beverages", "مشروبات")?;
        let oil = cat("Cooking Oil & Ghee", "گھی اور تیل")?;
        let dairy = cat("Dairy", "ڈیری")?;
        let grain = cat("Grains & Pulses", "اناج اور دالیں")?;
        let care = cat("Personal Care", "صابن اور شیمپو")?;
        let items = [
            ("DEMO-TEA-450", "Tea 450g (demo)", "چائے ۴۵۰ گرام", &bev, 62_000, 52_000),
            ("DEMO-OIL-1L", "Cooking Oil 1L (demo)", "کوکنگ آئل ۱ لٹر", &oil, 54_000, 47_000),
            ("DEMO-MILK-1L", "Milk 1L (demo)", "دودھ ۱ لٹر", &dairy, 29_000, 25_000),
            ("DEMO-RICE-5K", "Basmati Rice 5kg (demo)", "باسمتی چاول ۵ کلو", &grain, 175_000, 150_000),
            ("DEMO-SOAP-150", "Soap 150g (demo)", "صابن ۱۵۰ گرام", &care, 15_000, 12_000),
        ];
        let mut lines = Vec::new();
        for (i, (sku, name, name_ur, cat_id, price, cost)) in items.iter().enumerate() {
            let p = CatalogRepo::create_product(conn, CreateProductParams {
                sku: sku.to_string(),
                name: name.to_string(),
                name_ur: Some(name_ur.to_string()),
                category_id: Some((*cat_id).clone()),
                brand_id: None,
                base_unit_id: pc.clone(),
                hs_code: None,
                tax_rate_id: None,
                track_mode: None,
                reorder_level_milli: Some(5_000),
                barcode: Some(format!("200000000{:04}", i + 1)),
                retail_price_paisa: *price,
                wholesale_price_paisa: None,
                packaging_units: vec![],
            })?;
            lines.push(crate::domain::purchase::CreatePurchaseLineInput {
                variant_id: p.variant_id,
                unit_id: pc.clone(),
                received_qty_milli: 50_000,
                unit_cost_paisa: *cost,
            });
        }
        let vendor = PartyRepo::create_party(conn, CreatePartyParams {
            party_type: "vendor".into(),
            name: "Demo Distributor".into(),
            name_ur: None,
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: 0,
            opening_balance_paisa: 0,
            price_list_id: None,
        })?;
        PartyRepo::create_party(conn, CreatePartyParams {
            party_type: "customer".into(),
            name: "Demo Customer".into(),
            name_ur: Some("نمونہ گاہک".into()),
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: 5_000_000,
            opening_balance_paisa: 0,
            price_list_id: None,
        })?;
        let uid = self.session.as_ref().map(|s| s.user_id.clone());
        PurchaseRepo::post_purchase(self.conn_mut()?, CreatePurchaseInput {
            vendor_id: vendor.id,
            vendor_invoice_no: Some("DEMO-1".into()),
            freight_paisa: 0,
            lines,
            user_id: uid,
        })?;
        Ok(())
    }

    // ------------------------------------------------------------ cloud sync (Owner opt-in)

    pub fn cloud_settings(&self) -> Result<CloudSettingsView> {
        self.require(Permission::SettingsManage)?;
        let conn = self.conn()?;
        let pending: i64 = conn.query_row("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL", [], |r| r.get(0))?;
        Ok(CloudSettingsView {
            enabled: setting(conn, "cloud.enabled")?.as_deref() == Some("1"),
            url: setting(conn, "cloud.url")?,
            key_set: setting(conn, "cloud.api_key")?.map(|k| !k.is_empty()).unwrap_or(false),
            consent_at: setting(conn, "cloud.consent_at")?,
            last_synced_at: setting(conn, "cloud.last_synced_at")?,
            pending_events: pending,
        })
    }

    /// Only the Owner can turn cloud sync on. Nothing is ever sent while it is off.
    pub fn save_cloud_settings(&self, input: CloudSettingsInput) -> Result<CloudSettingsView> {
        let uid = self.require(Permission::SettingsManage)?.user_id.clone();
        let conn = self.conn()?;
        if let Some(url) = input.url.as_deref().map(str::trim) {
            if !url.is_empty() && (!url.starts_with("https://") || url.contains(' ')) {
                return Err(PosError::Validation("Cloud URL must start with https://".into()));
            }
            set_setting(conn, "cloud.url", url.trim_end_matches('/'))?;
        }
        if let Some(k) = input.api_key.as_deref() {
            set_setting(conn, "cloud.api_key", k.trim())?;
        }
        if input.enabled {
            let url_ok = setting(conn, "cloud.url")?.map(|u| !u.is_empty()).unwrap_or(false);
            let key_ok = setting(conn, "cloud.api_key")?.map(|k| !k.is_empty()).unwrap_or(false);
            if !url_ok || !key_ok {
                return Err(PosError::Validation("Enter the cloud URL and key before turning sync on".into()));
            }
            if setting(conn, "cloud.consent_at")?.is_none() {
                set_setting(conn, "cloud.consent_at", &now().to_rfc3339())?;
            }
        }
        set_setting(conn, "cloud.enabled", if input.enabled { "1" } else { "0" })?;
        AuditRepo::write(conn, Some(&uid), if input.enabled { "cloud_sync_enabled" } else { "cloud_sync_disabled" }, "settings", None, None, None)?;
        self.cloud_settings()
    }

    /// Up to 50 unsent events, or None when sync is off.
    pub fn cloud_batch(&self) -> Result<Option<CloudBatch>> {
        self.require(Permission::BackupManage)?;
        let conn = self.conn()?;
        if setting(conn, "cloud.enabled")?.as_deref() != Some("1") {
            return Ok(None);
        }
        let url = setting(conn, "cloud.url")?.unwrap_or_default();
        let api_key = setting(conn, "cloud.api_key")?.unwrap_or_default();
        if url.is_empty() || api_key.is_empty() {
            return Ok(None);
        }
        let rows: Vec<(String, String, String, String)> = conn
            .prepare("SELECT event_id, event_type, payload_json, occurred_at FROM sync_outbox WHERE synced_at IS NULL ORDER BY occurred_at LIMIT 50")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let shop_name = SettingsRepo::get(conn).map(|s| s.name).unwrap_or_default();
        Ok(Some(CloudBatch {
            url,
            api_key,
            shop_id: self.machine_id.clone(),
            shop_name,
            event_ids: rows.iter().map(|r| r.0.clone()).collect(),
            events: rows
                .into_iter()
                .map(|(id, t, p, at)| {
                    serde_json::json!({
                        "event_id": id,
                        "event_type": t,
                        "payload": serde_json::from_str::<serde_json::Value>(&p).unwrap_or(serde_json::Value::Null),
                        "occurred_at": at,
                    })
                })
                .collect(),
        }))
    }

    /// Marks exactly the events that were sent (not ones added meanwhile).
    pub fn cloud_mark_synced(&self, event_ids: &[String]) -> Result<()> {
        let uid = self.require(Permission::BackupManage)?.user_id.clone();
        let conn = self.conn()?;
        let ts = now().to_rfc3339();
        for id in event_ids {
            conn.execute("UPDATE sync_outbox SET synced_at = ?2 WHERE event_id = ?1", params![id, ts])?;
        }
        set_setting(conn, "cloud.last_synced_at", &ts)?;
        AuditRepo::write(conn, Some(&uid), "cloud_synced", "sync_outbox", None, None, Some(&format!("{{\"events\":{}}}", event_ids.len())))?;
        Ok(())
    }
}

// ---------------------------------------------------------------- dev bridge dispatch
//
// Used only by the `pos-dev-server` binary, which lets the UI run in a normal
// browser during development. It calls exactly the same checked methods as the
// Tauri commands. Printing, opening links and cloud upload stay desktop-only.

fn arg<T: serde::de::DeserializeOwned>(args: &serde_json::Value, key: &str) -> Result<T> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(serde_json::Value::Null))
        .map_err(|e| PosError::Validation(format!("Bad argument '{}': {}", key, e)))
}

fn json<T: Serialize>(v: T) -> Result<serde_json::Value> {
    serde_json::to_value(v).map_err(|e| PosError::Db(e.to_string()))
}

impl PosApp {
    pub fn dispatch(&mut self, cmd: &str, a: &serde_json::Value) -> Result<serde_json::Value> {
        if let Some(r) = self.dispatch_ops(cmd, a) {
            return r;
        }
        if let Some(r) = self.dispatch_reports(cmd, a) {
            return r;
        }
        if let Some(r) = self.dispatch_history(cmd, a) {
            return r;
        }
        match cmd {
            "app_status" => {
                let st = self.status();
                json(match st {
                    Ok(s) => serde_json::json!({ "ok": true, "error": null, "status": s }),
                    Err(e) => serde_json::json!({ "ok": false, "error": e.to_string(), "status": null }),
                })
            }
            "setup_first_run" => json(self.setup_first_run(arg(a, "store")?, arg(a, "owner")?)?),
            "login_password" => json(self.login_password(&arg::<String>(a, "username")?, &arg::<String>(a, "password")?)?),
            "login_pin" => json(self.login_pin(&arg::<String>(a, "user_id")?, &arg::<String>(a, "pin")?)?),
            "logout" => json(self.logout()?),
            "reveal_recovery_phrase" => json(self.reveal_recovery_phrase(&arg::<String>(a, "password")?)?),
            "list_users" => json(self.list_users()?),
            "create_user" => json(self.create_user(arg(a, "input")?)?),
            "set_pin" => json(self.set_pin(arg(a, "user_id")?, &arg::<String>(a, "new_pin")?)?),
            "set_user_active" => json(self.set_user_active(&arg::<String>(a, "user_id")?, arg(a, "active")?)?),
            "get_settings" => json(self.get_settings()?),
            "save_settings" => json(self.save_settings(arg(a, "settings")?)?),
            "diagnostics" => json(self.diagnostics()?),
            "search_products" => json(self.search_products(&arg::<String>(a, "query")?, arg::<Option<usize>>(a, "limit")?.unwrap_or(50))?),
            "scan_code" => json(self.scan(&arg::<String>(a, "code")?)?),
            "generate_barcode" => json(self.generate_barcode()?),
            "assign_barcode" => json(self.assign_barcode(&arg::<String>(a, "variant_id")?)?),
            "search_sellable" => json(self.search_sellable(&arg::<String>(a, "query")?, arg::<Option<usize>>(a, "limit")?.unwrap_or(50))?),
            "create_product" => json(self.create_product(arg(a, "params")?)?),
            "update_price" => json(self.update_price(&arg::<String>(a, "variant_id")?, arg(a, "retail_paisa")?, arg(a, "wholesale_paisa")?)?),
            "product_detail" => json(self.product_detail(&arg::<String>(a, "product_id")?)?),
            "update_product" => json(self.update_product(arg(a, "input")?)?),
            "list_units" => json(self.list_units()?),
            "create_unit" => json(self.create_unit(&arg::<String>(a, "code")?, &arg::<String>(a, "name")?, arg(a, "decimals")?)?),
            "list_categories" => json(self.list_categories()?),
            "create_category" => json(self.create_category(&arg::<String>(a, "name")?, arg(a, "name_ur")?, arg(a, "parent_id")?)?),
            "list_brands" => json(self.list_brands()?),
            "create_brand" => json(self.create_brand(&arg::<String>(a, "name")?, arg(a, "name_ur")?)?),
            "list_tax_rates" => json(self.list_tax_rates()?),
            "create_tax_rate" => json(self.create_tax_rate(&arg::<String>(a, "name")?, arg(a, "rate_bp")?, arg(a, "inclusive")?)?),
            "import_csv" => json(self.import_csv(&arg::<String>(a, "csv_text")?)?),
            "stock_list" => json(self.stock_list()?),
            "list_customers" => json(self.list_customers(&arg::<String>(a, "query")?)?),
            "list_vendors" => json(self.list_vendors(&arg::<String>(a, "query")?)?),
            "create_party" => json(self.create_party(arg(a, "input")?)?),
            "active_shift" => json(self.active_shift()?),
            "start_shift" => json(self.start_shift(arg(a, "opening_float_paisa")?)?),
            "cash_drop" => json(self.cash_drop(arg(a, "amount_paisa")?, &arg::<String>(a, "reason")?)?),
            "close_shift" => json(self.close_shift(arg(a, "counted_cash_paisa")?)?),
            "quote" => {
                let cid: Option<String> = arg(a, "customer_id")?;
                let lines: Vec<CheckoutLineInput> = arg(a, "lines")?;
                json(self.quote(cid.as_deref(), &lines, arg(a, "global_discount_paisa")?)?)
            }
            "checkout" => json(self.checkout(arg(a, "input")?)?),
            "recent_sales" => json(self.recent_sales(arg::<Option<usize>>(a, "limit")?.unwrap_or(50))?),
            "get_receipt" => json(self.receipt(&arg::<String>(a, "sale_id")?)?),
            "park_cart" => {
                let lines: Vec<CheckoutLineInput> = arg(a, "lines")?;
                json(self.park_cart(&arg::<String>(a, "name")?, arg(a, "customer_id")?, &lines)?)
            }
            "list_parked" => json(self.list_parked()?),
            "recall_parked" => {
                let (customer_id, lines) = self.recall_parked(&arg::<String>(a, "id")?)?;
                json(serde_json::json!({ "customer_id": customer_id, "lines": lines }))
            }
            "delete_parked" => json(self.delete_parked(&arg::<String>(a, "id")?)?),
            "find_sale_for_return" => json(self.find_sale_for_return(&arg::<String>(a, "doc_no")?)?),
            "post_return" => json(self.post_return(arg(a, "input")?)?),
            "khata_statement" => json(self.khata_statement(&arg::<String>(a, "party_id")?, &arg::<String>(a, "from")?, &arg::<String>(a, "to")?)?),
            "receive_payment" => json(self.receive_payment(&arg::<String>(a, "party_id")?, arg(a, "amount_paisa")?, &arg::<String>(a, "method")?, arg(a, "reference")?)?),
            "aging" => json(self.aging(&arg::<String>(a, "party_type")?)?),
            // In the browser the page opens the link itself.
            "open_whatsapp_reminder" => json(self.whatsapp_reminder_url(&arg::<String>(a, "party_id")?)?),
            "post_purchase" => json(self.post_purchase(arg(a, "input")?)?),
            "list_purchases" => json(self.list_purchases(arg::<Option<usize>>(a, "limit")?.unwrap_or(100))?),
            "start_stock_count" => json(self.start_stock_count(arg(a, "notes")?)?),
            "record_stock_counts" => json(self.record_stock_counts(&arg::<String>(a, "session_id")?, arg(a, "items")?)?),
            "current_stock_count" => json(self.current_stock_count()?),
            "finalize_stock_count" => json(self.finalize_stock_count(&arg::<String>(a, "session_id")?)?),
            "financial_summary" => json(self.financial_summary(&arg::<String>(a, "from")?, &arg::<String>(a, "to")?)?),
            "category_performance" => json(self.category_performance(&arg::<String>(a, "from")?, &arg::<String>(a, "to")?)?),
            "top_products" => json(self.top_products(&arg::<String>(a, "from")?, &arg::<String>(a, "to")?, arg::<Option<usize>>(a, "limit")?.unwrap_or(10))?),
            "inventory_valuation" => json(self.inventory_valuation()?),
            "low_stock" => json(self.low_stock()?),
            "license_info" => {
                let (status, machine_id) = self.license()?;
                json(serde_json::json!({ "status": status, "machine_id": machine_id }))
            }
            "install_license" => json(self.install_license(&arg::<String>(a, "token")?)?),
            "default_backup_dir" => json(Self::default_backup_dir().to_string_lossy().to_string()),
            "create_backup" => json(self.create_backup(arg::<Option<String>>(a, "dir")?.as_deref(), &arg::<String>(a, "password")?)?),
            "list_backups" => json(self.list_backups(arg::<Option<String>>(a, "dir")?.as_deref())?),
            "verify_backup" => json(self.verify_backup(&arg::<String>(a, "path")?, &arg::<String>(a, "password")?)?),
            "restore_backup" => json(self.restore_backup(&arg::<String>(a, "path")?, &arg::<String>(a, "password")?)?),
            "create_snapshot" => json(self.create_snapshot()?),
            "list_snapshots" => json(self.list_snapshots()?),
            "cloud_settings" => json(self.cloud_settings()?),
            "save_cloud_settings" => json(self.save_cloud_settings(arg(a, "input")?)?),
            "list_printers" => {
                self.require_printer_user()?;
                json(Vec::<String>::new())
            }
            "print_receipt" | "print_z_report" | "print_test_receipt" | "kick_drawer" | "cut_paper" | "print_labels" => Err(PosError::BusinessRule(
                "Printing and the cash drawer work only in the desktop app (browser test mode)".into(),
            )),
            "sync_to_cloud" => Err(PosError::BusinessRule("Cloud sync runs only in the desktop app (browser test mode)".into())),
            other => Err(PosError::NotFound(format!("Unknown command '{}'", other))),
        }
    }
}

// ---------------------------------------------------------------- in-store barcodes and labels

/// EAN-13 check digit for the first 12 digits.
fn ean13_check(body12: &str) -> u32 {
    let sum: u32 = body12
        .chars()
        .enumerate()
        .map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    (10 - sum % 10) % 10
}

impl PosApp {
    fn barcode_taken(&self, code: &str) -> Result<bool> {
        let conn = self.conn()?;
        let n: i64 = conn.query_row(
            "SELECT (SELECT COUNT(*) FROM barcodes WHERE value = ?1) + (SELECT COUNT(*) FROM variant_units WHERE barcode = ?1)",
            params![code],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    /// A new in-store EAN-13 barcode (prefix 29: for the shop's own use, never on
    /// manufacturer packs, and not the 20/21 weighing-scale range). Unique in this shop.
    pub fn generate_barcode(&self) -> Result<String> {
        self.require(Permission::PriceEdit)?;
        for _ in 0..50 {
            let mut b = [0u8; 8];
            crate::db::key::fill_random(&mut b);
            let n = u64::from_le_bytes(b) % 10_000_000_000;
            let body = format!("29{:010}", n);
            let code = format!("{}{}", body, ean13_check(&body));
            if !self.barcode_taken(&code)? {
                return Ok(code);
            }
        }
        Err(PosError::Db("Could not find a free barcode; try again".into()))
    }

    /// Gives a product without a barcode a new in-store barcode and returns it.
    pub fn assign_barcode(&self, variant_id: &str) -> Result<String> {
        let uid = self.require(Permission::PriceEdit)?.user_id.clone();
        let conn = self.conn()?;
        let existing: Option<String> = conn
            .query_row("SELECT value FROM barcodes WHERE variant_id = ?1 LIMIT 1", params![variant_id], |r| r.get(0))
            .optional()?;
        if let Some(b) = existing {
            return Err(PosError::Validation(format!("This product already has barcode {}", b)));
        }
        let code = self.generate_barcode()?;
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO barcodes (id, variant_id, value, kind, created_at) VALUES (?1, ?2, ?3, 'in-store', ?4)",
            params![ulid::Ulid::new().to_string(), variant_id, code, now().to_rfc3339()],
        )?;
        conn.execute(
            "UPDATE variant_units SET barcode = ?2 WHERE variant_id = ?1 AND factor_to_base = 1000 AND barcode IS NULL",
            params![variant_id, code],
        )?;
        AuditRepo::write(conn, Some(&uid), "barcode_assigned", "variant", Some(variant_id), None, Some(&format!("{{\"barcode\":\"{}\"}}", code)))?;
        Ok(code)
    }

    /// Label for the thermal label printer, built from the database.
    pub fn label_payload(&self, variant_id: &str, copies: usize, size: crate::hardware::LabelSize) -> Result<crate::hardware::LabelPayload> {
        self.require_login()?;
        let conn = self.conn()?;
        let product_id: String = conn
            .query_row("SELECT product_id FROM product_variants WHERE id = ?1", params![variant_id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| PosError::NotFound("Product not found".into()))?;
        let p = CatalogRepo::get_by_id(conn, &product_id)?.ok_or_else(|| PosError::NotFound("Product not found".into()))?;
        let barcode = p.barcode.clone().ok_or_else(|| PosError::Validation("This product has no barcode. Generate one first.".into()))?;
        if copies == 0 || copies > 500 {
            return Err(PosError::Validation("Copies must be 1 to 500".into()));
        }
        Ok(crate::hardware::LabelPayload {
            store_name: SettingsRepo::get(conn).map(|s| s.name).unwrap_or_default(),
            item_name: p.name,
            item_name_ur: p.name_ur,
            barcode,
            price_paisa: p.retail_price_paisa,
            size,
            copies,
        })
    }
}
