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
  name_ur: string | null;
  sku: string;
  barcode: string | null;
  unit_id: string;
  unit_code: string;
  retail_price_paisa: number;
  stock_milli: number;
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
  setupFirstOwner: (username: string, password: string, pin?: string) =>
    callTauri<UserSummary>("setup_first_owner", { username, password, pin: pin || null }),
  loginWithPassword: (username: string, password: string) =>
    callTauri<UserSession>("login_with_password", { username, password }),
  loginWithPin: (userId: string, pin: string) =>
    callTauri<UserSession>("login_with_pin", { userId, pin }),
  listActiveUsers: () => callTauri<UserSummary[]>("list_active_users"),
  logoutUser: () => callTauri<void>("logout_user"),

  searchProducts: (query: string) => callTauri<ProductSearchResult[]>("search_products", { query }),
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
};
