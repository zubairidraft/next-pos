import { invoke } from "@tauri-apps/api/core";

export interface SystemStatus {
  pos_core_version: string;
  is_first_run: boolean;
  database_encrypted: boolean;
  current_user: UserSession | null;
  active_shift: CashSession | null;
  license_status: string;
  store_name: string;
}

export interface UserSummary {
  id: string;
  username: string;
  role: "Owner" | "Manager" | "Cashier" | "StockKeeper";
  active: boolean;
  has_pin: boolean;
}

export interface UserSession {
  user_id: string;
  username: string;
  role: "Owner" | "Manager" | "Cashier" | "StockKeeper";
  session_token: string;
  opened_at: string;
  expires_at: string;
}

export interface CashSession {
  id: string;
  user_id: string;
  opening_float_paisa: number;
  expected_cash_paisa: number;
  counted_cash_paisa: number | null;
  variance_paisa: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

export interface ProductSearchResult {
  variant_id: string;
  product_id: string;
  name: string;
  name_ur?: string | null;
  sku: string;
  barcode: string | null;
  category?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  base_unit_id: string;
  base_unit_code: string;
  unit_id?: string;
  unit_code?: string;
  retail_price_paisa: number;
  wholesale_price_paisa?: number | null;
  stock_on_hand_milli: number;
  stock_milli?: number;
}

export interface PostSaleLineInput {
  variant_id: string;
  unit_id: string;
  qty_milli: number;
  unit_price_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  price_override_by?: string | null;
}

export interface PaymentTenderInput {
  method: string;
  amount_paisa: number;
  reference?: string | null;
}

export interface PostSaleRequest {
  customer_id?: string | null;
  cash_session_id?: string | null;
  lines: PostSaleLineInput[];
  tenders: PaymentTenderInput[];
  global_discount_paisa: number;
  price_override_by?: string | null;
  credit_override_by?: string | null;
}

export interface CompletedSale {
  id: string;
  doc_no: string;
  subtotal_paisa: number;
  total_discount_paisa: number;
  tax_paisa: number;
  grand_total_paisa: number;
  change_paisa: number;
  created_at: string;
}

export interface SaleHistoryRow {
  id: string;
  doc_no: string;
  party_name: string;
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  grand_total_paisa: number;
  created_at: string;
}

export interface KhataPartySummary {
  id: string;
  name: string;
  name_ur: string | null;
  party_type: string;
  phone: string | null;
  balance_paisa: number;
  credit_limit_paisa: number;
}

export interface LedgerEntry {
  id: string;
  party_id: string;
  entry_type: string;
  doc_no: string | null;
  amount_paisa: number;
  running_balance_paisa: number;
  notes: string | null;
  occurred_at: string;
}

export interface KhataStatement {
  party_id: string;
  opening_balance_paisa: number;
  closing_balance_paisa: number;
  entries: LedgerEntry[];
}

export interface FinancialSummary {
  gross_sales_paisa: number;
  net_sales_paisa: number;
  discounts_paisa: number;
  taxes_paisa: number;
  cogs_paisa: number;
  gross_profit_paisa: number;
  sales_count: number;
  returns_count: number;
  returns_paisa: number;
}

export interface Category {
  id: string;
  name: string;
  name_ur?: string | null;
  parent_id?: string | null;
  active: boolean;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  name_ur?: string | null;
  active: boolean;
  created_at: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  decimals_allowed: number;
  created_at: string;
}

export interface CreatePackagingUnitParams {
  unit_id: string;
  factor_to_base: number;
  barcode?: string | null;
  retail_price_paisa?: number | null;
}

export interface CreateProductParams {
  sku: string;
  name: string;
  name_ur?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  base_unit_id: string;
  hs_code?: string | null;
  tax_rate_id?: string | null;
  track_mode?: string | null;
  reorder_level_milli?: number | null;
  barcode?: string | null;
  retail_price_paisa: number;
  wholesale_price_paisa?: number | null;
  packaging_units?: CreatePackagingUnitParams[];
}

export interface Party {
  id: string;
  party_type: string;
  name: string;
  name_ur?: string | null;
  phone?: string | null;
  cnic?: string | null;
  ntn?: string | null;
  credit_limit_paisa: number;
  opening_balance_paisa: number;
  price_list_id?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePartyParams {
  party_type: "customer" | "vendor" | "both";
  name: string;
  name_ur?: string | null;
  phone?: string | null;
  cnic?: string | null;
  ntn?: string | null;
  credit_limit_paisa: number;
  opening_balance_paisa: number;
  price_list_id?: string | null;
}

export interface PurchaseInvoiceLine {
  id: string;
  purchase_id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  unit_id: string;
  unit_code: string;
  received_qty_milli: number;
  unit_cost_paisa: number;
  total_paisa: number;
  effective_unit_cost_paisa: number;
}

export interface PurchaseInvoice {
  id: string;
  doc_no: string;
  vendor_id: string;
  vendor_name: string;
  vendor_invoice_no?: string | null;
  status: string;
  freight_paisa: number;
  total_paisa: number;
  lines: PurchaseInvoiceLine[];
  created_at: string;
}

export interface CreatePurchaseLineInput {
  variant_id: string;
  unit_id: string;
  received_qty_milli: number;
  unit_cost_paisa: number;
}

export interface CreatePurchaseInput {
  vendor_id: string;
  vendor_invoice_no?: string | null;
  freight_paisa: number;
  lines: CreatePurchaseLineInput[];
  user_id?: string | null;
}

export interface ReceiptLineItem {
  name: string;
  name_ur?: string | null;
  qty_display: string;
  unit_price_paisa: number;
  total_paisa: number;
}

export interface ReceiptPayload {
  store_name: string;
  store_name_ur?: string | null;
  store_address?: string | null;
  store_phone?: string | null;
  ntn?: string | null;
  invoice_no: string;
  date_time: string;
  cashier_name: string;
  customer_name?: string | null;
  items: ReceiptLineItem[];
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  grand_total_paisa: number;
  payments: [string, number][]; // [method, amount_paisa]
  change_paisa: number;
  footer_note?: string | null;
  footer_note_ur?: string | null;
}

export interface CloudSyncResult {
  success: boolean;
  synced_count: number;
  message: string;
}

// Fallback in case frontend is launched in a pure browser tab
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function callTauri<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri) {
    return await invoke<T>(cmd, args);
  }
  console.warn(`[Mock Fallback] Tauri IPC '${cmd}' called in web browser environment`, args);
  throw new Error(`Tauri environment not detected for '${cmd}'. Please run inside Next POS Desktop.`);
}

export const api = {
  getSystemStatus: () => callTauri<SystemStatus>("get_system_status"),
  setupFirstOwner: (payload: {
    username: string;
    password: string;
    pin?: string | null;
    shop_name?: string;
    shop_name_ur?: string;
    phone?: string;
    address?: string;
    account_type?: "demo" | "fresh";
  }) => callTauri<UserSummary>("setup_first_owner", { payload }),
  resetStoreAccount: (account_type: "demo" | "fresh") =>
    callTauri<void>("reset_store_account", { account_type }),
  loginWithPassword: (username: string, password: string) =>
    callTauri<UserSession>("login_with_password", { username, password }),
  loginWithPin: (userId: string, pin: string) =>
    callTauri<UserSession>("login_with_pin", { userId, pin }),
  listActiveUsers: () => callTauri<UserSummary[]>("list_active_users"),
  logoutUser: () => callTauri<void>("logout_user"),

  searchProducts: (query: string) => callTauri<ProductSearchResult[]>("search_products", { query }),
  listProductsCatalog: (limit = 100, offset = 0) =>
    callTauri<ProductSearchResult[]>("list_products_catalog", { limit, offset }),
  createProduct: (params: CreateProductParams) =>
    callTauri<ProductSearchResult>("create_product", { params: { ...params, packaging_units: params.packaging_units || [] } }),

  listCategories: () => callTauri<Category[]>("list_categories"),
  createCategory: (name: string, name_ur?: string | null, parent_id?: string | null) =>
    callTauri<Category>("create_category", { name, name_ur: name_ur || null, parent_id: parent_id || null }),

  listBrands: () => callTauri<Brand[]>("list_brands"),
  createBrand: (name: string, name_ur?: string | null) =>
    callTauri<Brand>("create_brand", { name, name_ur: name_ur || null }),

  listUnits: () => callTauri<Unit[]>("list_units"),
  createUnit: (code: string, name: string, decimals_allowed: number) =>
    callTauri<Unit>("create_unit", { code, name, decimals_allowed }),

  createParty: (params: CreatePartyParams) =>
    callTauri<Party>("create_party", { params }),
  listVendors: () => callTauri<Party[]>("list_vendors"),

  createPurchaseInvoice: (input: CreatePurchaseInput) =>
    callTauri<PurchaseInvoice>("create_purchase_invoice", { input }),
  listPurchases: (limit = 50) =>
    callTauri<PurchaseInvoice[]>("list_purchases", { limit }),

  postSale: (request: PostSaleRequest) => callTauri<CompletedSale>("post_sale", { request }),
  getRecentSales: (limit = 20) => callTauri<SaleHistoryRow[]>("get_recent_sales", { limit }),

  openShift: (openingFloatPaisa: number) =>
    callTauri<CashSession>("open_shift", { openingFloatPaisa }),
  closeShift: (closingCountedCashPaisa: number) =>
    callTauri<any>("close_shift", { closingCountedCashPaisa }),

  listKhataParties: (partyType = "customer") =>
    callTauri<KhataPartySummary[]>("list_khata_parties", { partyType }),
  getKhataStatement: (partyId: string) =>
    callTauri<KhataStatement>("get_khata_statement", { partyId }),

  getReportsSummary: (startDate?: string, endDate?: string) =>
    callTauri<FinancialSummary>("get_reports_summary", { startDate: startDate || null, endDate: endDate || null }),

  exportBackup: (password: string, destinationFile: string) =>
    callTauri<string>("export_backup", { password, destinationFile }),
  restoreBackup: (password: string, backupFile: string) =>
    callTauri<string>("restore_backup", { password, backupFile }),

  syncToCloud: () => callTauri<CloudSyncResult>("sync_to_cloud"),

  listSystemPrinters: () => callTauri<string[]>("list_system_printers"),
  printRawEscpos: (printerName?: string, rawBytes?: number[]) =>
    callTauri<void>("print_raw_escpos", { printerName: printerName || null, rawBytes: rawBytes || [] }),
  kickCashDrawer: (printerName?: string) =>
    callTauri<void>("kick_cash_drawer", { printerName: printerName || null }),
  cutPrinterPaper: (printerName?: string) =>
    callTauri<void>("cut_printer_paper", { printerName: printerName || null }),
  printSaleReceipt: (payload: ReceiptPayload, printerName?: string, width = "58mm") =>
    callTauri<void>("print_sale_receipt", { printerName: printerName || null, width, payload }),
};
