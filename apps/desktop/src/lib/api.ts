// Typed bridge to the Tauri backend (pos_core::app::PosApp).
// Every command is checked by the backend (login, role, license, shift); the
// screen never sends prices, tax, cashier or approver IDs it was not given.
// Argument names are snake_case: every Rust command uses rename_all = "snake_case".
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------- shared

export type Role = "Owner" | "Manager" | "Cashier" | "StockKeeper";
export type Permission =
  | "SalesCreate"
  | "SalesDiscount"
  | "SalesVoid"
  | "SalesReturn"
  | "PriceEdit"
  | "InventoryAdjust"
  | "PurchaseEntry"
  | "ReportsView"
  | "SettingsManage"
  | "BackupManage";

export interface UserSummary {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  has_pin: boolean;
}

export interface SessionInfo {
  user_id: string;
  username: string;
  role: Role;
  permissions: Permission[];
  expires_at: string;
}

export interface LicenseFeatures {
  grocery_pack: boolean;
  electronics_pack: boolean;
  apparel_pack: boolean;
  multi_till: boolean;
}

export type LicenseStatus =
  | { status: "Active"; details: { tier: string; days_left: number | null; features: LicenseFeatures } }
  | { status: "GracePeriod"; details: { tier: string; grace_days_left: number; features: LicenseFeatures } }
  | { status: "TrialActive"; details: { days_left: number; features: LicenseFeatures } }
  | { status: "Expired" }
  | { status: "MachineMismatch"; details: { expected: string; actual: string } }
  | { status: "InvalidSignature" }
  | { status: "MalformedToken" }
  | { status: "ClockTampered" };

export interface AppStatus {
  needs_setup: boolean;
  store_name: string | null;
  store_name_ur: string | null;
  machine_id: string;
  license: LicenseStatus;
  can_post_sales: boolean;
  trial_watermark: boolean;
  session: SessionInfo | null;
  users: UserSummary[];
  app_version: string;
  data_dir: string;
}

export interface StartupInfo {
  ok: boolean;
  error: string | null;
  status: AppStatus | null;
}

export interface StoreSetupInput {
  name: string;
  name_ur?: string | null;
  address?: string | null;
  phone?: string | null;
  ntn?: string | null;
  strn?: string | null;
  tax_mode?: "inclusive" | "exclusive" | null;
  enabled_packs: string[];
  demo_catalog: boolean;
}

export interface OwnerSetupInput {
  username: string;
  password: string;
  pin?: string | null;
}

export interface SetupResult {
  session: SessionInfo;
  recovery_phrase: string;
}

export interface BusinessSettings {
  id: string;
  name: string;
  name_ur: string | null;
  address: string | null;
  phone: string | null;
  ntn: string | null;
  strn: string | null;
  currency: string;
  time_zone: string;
  tax_mode: string;
  negative_stock_policy: "Block" | "Warn" | "Allow" | string;
  enabled_packs: string[];
  fbr_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------- catalog

export interface ProductSearchResult {
  product_id: string;
  variant_id: string;
  sku: string;
  name: string;
  name_ur: string | null;
  category_id: string | null;
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  base_unit_id: string;
  base_unit_code: string;
  barcode: string | null;
  retail_price_paisa: number;
  wholesale_price_paisa: number | null;
  tax_rate_bp: number;
  tax_inclusive: boolean;
  active?: boolean;
}

export interface ProductRow extends ProductSearchResult {
  on_hand_milli: number;
  avg_cost_paisa: number;
  reorder_level_milli: number;
  /** A service (repair, fitting...): no stock. */
  is_service: boolean;
}

export interface SellUnit {
  unit_id: string;
  unit_code: string;
  factor_to_base: number;
  barcode: string | null;
  price_paisa: number | null;
}

export interface ScanResult {
  product: ProductSearchResult;
  unit_id: string;
  qty_milli: number;
  units: SellUnit[];
  on_hand_milli: number;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  decimals_allowed: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  name_ur: string | null;
  parent_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  name_ur: string | null;
  active: boolean;
  created_at: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate_bp: number;
  inclusive: boolean;
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
  track_mode?: "none" | "batch" | "serial" | null;
  reorder_level_milli?: number | null;
  barcode?: string | null;
  retail_price_paisa: number;
  wholesale_price_paisa?: number | null;
  packaging_units: CreatePackagingUnitParams[];
}

export interface ImportRowError {
  row: number;
  sku: string;
  message: string;
}

export interface ImportSummary {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
  duration_ms: number;
}

export interface InventoryBalanceView {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_name_ur: string | null;
  sku: string;
  barcode: string | null;
  unit_code: string;
  on_hand_milli: number;
  avg_cost_paisa: number;
  total_valuation_paisa: number;
  last_rebuilt_at: string;
}

// ---------------------------------------------------------------- parties

export interface CustomerSummary {
  id: string;
  party_type: "customer" | "vendor" | "both" | string;
  name: string;
  name_ur: string | null;
  phone: string | null;
  credit_limit_paisa: number;
  balance_paisa: number;
  price_list_id: string | null;
}

export interface CustomerInput {
  party_type?: "customer" | "vendor" | "both";
  name: string;
  name_ur?: string | null;
  phone?: string | null;
  cnic?: string | null;
  ntn?: string | null;
  credit_limit_paisa?: number;
  opening_balance_paisa?: number;
  price_list_id?: "retail" | "wholesale" | null;
}

// ---------------------------------------------------------------- shift

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

export interface ZReportData {
  session_id: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string;
  opening_float_paisa: number;
  gross_sales_paisa: number;
  discounts_paisa: number;
  net_sales_paisa: number;
  taxes_paisa: number;
  tender_cash_paisa: number;
  tender_card_paisa: number;
  tender_digital_paisa: number;
  tender_khata_paisa: number;
  cash_drops_paisa: number;
  refunds_paisa: number;
  expected_cash_paisa: number;
  counted_cash_paisa: number;
  variance_paisa: number;
  sales_count: number;
}

// ---------------------------------------------------------------- checkout

export type TenderMethod = "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank" | "cheque" | "credit";

export interface PaymentTenderInput {
  method: TenderMethod;
  amount_paisa: number;
  reference?: string | null;
}

/** One cart line as the screen holds it: only ids and quantities. */
export interface CheckoutLineInput {
  variant_id: string;
  unit_id: string;
  qty_milli: number;
  discount_paisa?: number;
  /** Only when the price was changed at the counter (needs PriceEdit or approval). */
  price_override_paisa?: number | null;
}

export interface ApprovalInput {
  user_id: string;
  pin: string;
}

export interface CheckoutInput {
  customer_id?: string | null;
  lines: CheckoutLineInput[];
  global_discount_paisa: number;
  tenders: PaymentTenderInput[];
  approval?: ApprovalInput | null;
}

export interface QuoteLine {
  variant_id: string;
  unit_id: string;
  unit_code: string;
  sku: string;
  name: string;
  name_ur: string | null;
  qty_milli: number;
  unit_price_paisa: number;
  catalog_price_paisa: number;
  /** Lowest price the counter may charge (wholesale, else cost). null = no limit. */
  min_price_paisa: number | null;
  discount_paisa: number;
  tax_paisa: number;
  total_paisa: number;
  on_hand_milli: number;
  is_service: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  total_paisa: number;
  customer: CustomerSummary | null;
}

export interface SaleLineDto {
  id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  unit_code: string;
  unit_id?: string;
  qty_milli: number;
  unit_price_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  total_paisa: number;
  cogs_paisa: number;
}

export interface CompletedSale {
  id: string;
  doc_no: string;
  customer_id: string | null;
  customer_name: string | null;
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  total_paisa: number;
  tendered_paisa: number;
  change_paisa: number;
  lines: SaleLineDto[];
  tenders: PaymentTenderInput[];
  created_at: string;
  revision?: number;
  edited_at?: string | null;
}

export interface ReceiptData {
  store: BusinessSettings | null;
  sale: CompletedSale;
  cashier: string | null;
  trial_watermark: boolean;
}

export interface RecentSale {
  id: string;
  doc_no: string;
  customer_name: string | null;
  total_paisa: number;
  status: string;
  created_at: string;
}

export interface ParkedCartSummary {
  id: string;
  cart_name: string;
  customer_id: string | null;
  total_paisa: number;
  item_count: number;
  parked_at: string;
}

export interface RecalledCart {
  customer_id: string | null;
  lines: { variant_id: string; unit_id: string; qty_milli: number }[];
}

// ---------------------------------------------------------------- returns

export interface ReturnableLine {
  sale_line_id: string;
  variant_id: string;
  unit_id: string;
  unit_code: string;
  sku: string;
  name: string;
  name_ur: string | null;
  qty_milli: number;
  returned_qty_milli: number;
  unit_price_paisa: number;
  total_paisa: number;
}

export interface ReturnableSale {
  id: string;
  doc_no: string;
  created_at: string;
  customer_name: string | null;
  total_paisa: number;
  lines: ReturnableLine[];
}

export type RefundMethod = "cash" | "credit" | "card" | "jazzcash" | "easypaisa" | "raast" | "bank";

export interface ReturnInput {
  sale_id: string;
  lines: { sale_line_id: string; qty_milli: number; damaged?: boolean }[];
  reason?: string | null;
  refund_method: RefundMethod;
  approval?: ApprovalInput | null;
}

export interface CompletedReturn {
  id: string;
  doc_no: string;
  original_sale_id: string;
  refund_paisa: number;
  restocked_items_count: number;
  created_at: string;
}

// ---------------------------------------------------------------- khata

export interface LedgerEntry {
  id: string;
  party_id: string;
  entry_type: string;
  debit_paisa: number;
  credit_paisa: number;
  balance_paisa: number;
  source_doc: string;
  occurred_at: string;
}

export interface KhataStatement {
  party_id: string;
  party_name: string;
  party_name_ur: string | null;
  phone: string | null;
  start_date: string;
  end_date: string;
  opening_balance_paisa: number;
  entries: LedgerEntry[];
  total_debit_paisa: number;
  total_credit_paisa: number;
  closing_balance_paisa: number;
}

export interface InvoiceAllocation {
  sale_id: string;
  doc_no: string;
  total_paisa: number;
  previously_paid_paisa: number;
  allocated_paisa: number;
  remaining_paisa: number;
}

export interface PaymentAllocationResult {
  payment_id: string;
  party_id: string;
  total_payment_paisa: number;
  allocations: InvoiceAllocation[];
  unallocated_credit_paisa: number;
  new_party_balance_paisa: number;
}

export interface AgingReportBucket {
  bucket_name: string;
  amount_paisa: number;
  invoice_count: number;
}

// ---------------------------------------------------------------- purchases / stock

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
  vendor_invoice_no: string | null;
  status: string;
  freight_paisa: number;
  total_paisa: number;
  lines: PurchaseInvoiceLine[];
  created_at: string;
  revision?: number;
  edited_at?: string | null;
}

export interface CreatePurchaseInput {
  vendor_id: string;
  vendor_invoice_no?: string | null;
  freight_paisa: number;
  lines: { variant_id: string; unit_id: string; received_qty_milli: number; unit_cost_paisa: number }[];
}

export interface StockCountLine {
  id: string;
  session_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  expected_qty_milli: number;
  counted_qty_milli: number;
  variance_qty_milli: number;
  unit_cost_paisa: number;
  variance_value_paisa: number;
  notes: string | null;
}

export interface StockCountSession {
  id: string;
  doc_no: string;
  status: string;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  approved_by: string | null;
  lines: StockCountLine[];
}

// ---------------------------------------------------------------- reports

export interface FinancialSummary {
  start_date: string;
  end_date: string;
  gross_sales_paisa: number;
  discounts_paisa: number;
  tax_paisa: number;
  net_sales_paisa: number;
  cogs_paisa: number;
  gross_profit_paisa: number;
  gross_margin_percent: number;
  sales_count: number;
  total_units_sold_milli: number;
  average_ticket_paisa: number;
  tender_breakdown: [string, number][];
}

export interface CategoryPerformance {
  category_id: string;
  category_name: string;
  category_name_ur: string | null;
  qty_sold_milli: number;
  revenue_paisa: number;
  cogs_paisa: number;
  gross_profit_paisa: number;
  gross_margin_percent: number;
}

export interface TopProduct {
  variant_id: string;
  sku: string;
  name: string;
  name_ur: string | null;
  qty_sold_milli: number;
  revenue_paisa: number;
  cogs_paisa: number;
  gross_profit_paisa: number;
}

export interface InventoryValuation {
  total_variants_count: number;
  total_stock_milli: number;
  total_cost_valuation_paisa: number;
  total_retail_valuation_paisa: number;
  potential_profit_paisa: number;
}

export interface LowStockRow {
  variant_id: string;
  sku: string;
  name: string;
  name_ur: string | null;
  unit_code: string;
  on_hand_milli: number;
  reorder_level_milli: number;
}

// ---------------------------------------------------------------- license / backup / system

export interface LicenseInfo {
  status: LicenseStatus;
  machine_id: string;
}

export interface KdfParams {
  algorithm: string;
  memory_kib: number;
  iterations: number;
  parallelism: number;
  salt_hex: string;
}

export interface BackupManifest {
  magic: string;
  format_version: number;
  created_at: string;
  app_version: string;
  schema_version: number;
  payload_size_bytes: number;
  payload_sha256: string;
  kdf: KdfParams;
}

export interface BackupFileInfo {
  path: string;
  filename: string;
  size_bytes: number;
  modified_at: string;
  manifest: BackupManifest | null;
}

export interface RestoreReport {
  manifest: BackupManifest;
  safety_copy_path: string | null;
}

export interface SnapshotInfo {
  path: string;
  filename: string;
  file_size_bytes: number;
  created_at: string;
  is_valid: boolean;
}

export interface DiagnosticsInfo {
  app_version: string;
  schema_version: number;
  latest_schema_version: number;
  sqlcipher_version: string;
  db_path: string;
  db_size_bytes: number;
  integrity_ok: boolean;
  last_snapshot: string | null;
  products: number;
  sales: number;
  customers: number;
}

export interface CloudStatus {
  linked: boolean;
  shop_id: string | null;
  server: string | null;
  linked_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  pending: number;
  backup_password_set: boolean;
  last_backup_at: string | null;
  last_backup_error: string | null;
}

export interface CloudActionResult {
  status: CloudStatus;
  message: string;
}

export interface NewUserInput {
  username: string;
  password: string;
  pin?: string | null;
  role: Role;
}

// ---------------------------------------------------------------- calls

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Browser test mode (development only): the same backend runs in
 * `pos-dev-server` on this PC with its own test database. Never used in the
 * desktop app or in a production build.
 */
export const isBrowserTest = !isTauri && import.meta.env.DEV;
const DEV_SERVER = (import.meta.env.VITE_DEV_SERVER as string | undefined) || "http://127.0.0.1:4848";

async function callDevServer<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DEV_SERVER}/invoke/${cmd}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-NextPOS-Dev": "1" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error(`Browser test server is not running at ${DEV_SERVER}. Start it with dev-agentation.bat (or: cargo run -p pos-core --features dev-server --bin pos-dev-server).`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Test server error ${res.status}`);
  return body as T;
}

/**
 * Another way to reach the backend, set by the phone app: there every command
 * goes over the shop WiFi to the PC (see src/mobile/link.ts).
 */
type Transport = (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
let transport: Transport | null = null;
export function setTransport(t: Transport | null) {
  transport = t;
}

/** Calls a backend command. Errors are always real: nothing is faked. */
async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (transport) return (await transport(cmd, args)) as T;
  if (!isTauri) {
    if (isBrowserTest) return callDevServer<T>(cmd, args);
    throw new Error("This needs the Next POS desktop app. It cannot run in a plain browser tab.");
  }
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : (e as Error)?.message || String(e));
  }
}

/** The backend's message without its technical prefix ("Business rule violation: …"). */
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^(Business rule violation|Validation error|Not found|Database error): /, "");
}

// ---------------------------------------------------------------- returns to vendors, claims, reports

export interface PurchaseReturnInput {
  vendor_id: string;
  purchase_id?: string | null;
  reason?: string | null;
  lines: { variant_id: string; unit_id: string; qty_milli: number; unit_cost_paisa: number }[];
}

export interface PurchaseReturnDoc {
  id: string;
  doc_no: string;
  vendor_id: string;
  vendor_name: string;
  reason: string | null;
  total_paisa: number;
  created_at: string;
  lines: { variant_id: string; product_name: string; unit_code: string; qty_milli: number; unit_cost_paisa: number; total_paisa: number }[];
}

export type ClaimKind = "warranty" | "damaged" | "expired";
export type ClaimStatus = "open" | "sent" | "replaced" | "credited" | "rejected" | "closed";

export interface ClaimInput {
  kind: ClaimKind;
  variant_id: string;
  qty_milli: number;
  customer_id?: string | null;
  vendor_id?: string | null;
  serial?: string | null;
  sale_doc?: string | null;
  notes?: string | null;
}

export interface Claim {
  id: string;
  doc_no: string;
  kind: ClaimKind;
  status: ClaimStatus;
  variant_id: string;
  product_name: string;
  unit_code: string;
  qty_milli: number;
  customer_id: string | null;
  customer_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  serial: string | null;
  sale_doc: string | null;
  notes: string | null;
  value_paisa: number;
  credit_paisa: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export type ReportCellKind = "text" | "money" | "qty" | "int" | "date" | "datetime" | "percent";
export interface ReportTable {
  kind: string;
  title: string;
  from: string;
  to: string;
  dated: boolean;
  columns: { key: string; label: string; kind: ReportCellKind }[];
  rows: (string | number | null)[][];
  totals: (string | number | null)[];
  summary: { label: string; value: string | number | null; kind: ReportCellKind }[];
  note: string | null;
}

// ---------------------------------------------------------------- branches on this PC

export interface Branch {
  id: string;
  /** The branch's shop name ("" until it is set up). */
  name: string;
}

export interface BranchesInfo {
  /** The open branch (null for a data folder outside the list). */
  current: string | null;
  /** This window was opened for a particular branch: no picker. */
  chosen: boolean;
  list: Branch[];
}

// ---------------------------------------------------------------- phones on the shop WiFi

export interface PhonesStatus {
  enabled: boolean;
  running: boolean;
  port: number | null;
  addresses: string[];
  error: string | null;
}

export interface LanDevice {
  id: string;
  name: string;
  paired_at: string;
  last_seen_at: string | null;
  last_ip: string | null;
  revoked: boolean;
}

/** A barcode read by a paired phone's camera. */
export interface RemoteScan {
  code: string;
  device_id: string;
  device_name: string;
}

/** Listen for phone scans (desktop app). Returns a function that stops listening. */
export function onRemoteScan(cb: (s: RemoteScan) => void): () => void {
  if (isTauri) {
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<RemoteScan>("remote-scan", (e) => cb(e.payload)).then((un) => (cancelled ? un() : (stop = un)))
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }
  if (isBrowserTest) {
    // Browser test mode: the test server keeps phone scans until the screen asks.
    const t = setInterval(() => {
      callDevServer<RemoteScan[]>("poll_remote_scans", {})
        .then((list) => list.forEach(cb))
        .catch(() => undefined);
    }, 700);
    return () => clearInterval(t);
  }
  return () => undefined;
}

// ---------------------------------------------------------------- history & editing

export interface SaleListQuery {
  from: string;
  to: string;
  offset_min: number;
  query?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface SaleListRow {
  id: string;
  doc_no: string;
  created_at: string;
  customer_name?: string | null;
  salesman?: string | null;
  item_count: number;
  total_paisa: number;
  paid_text: string;
  status: string;
  revision: number;
  returned_paisa: number;
}

export interface PaymentRow {
  id: string;
  method: string;
  amount_paisa: number;
  reference?: string | null;
  direction: string;
  occurred_at: string;
}

export interface ReturnSummary {
  id: string;
  doc_no: string;
  refund_paisa: number;
  created_at: string;
  reason?: string | null;
}

export interface RevisionRow {
  revision: number;
  reason: string;
  edited_by?: string | null;
  edited_at: string;
}

export interface SaleDetail {
  receipt: ReceiptData;
  payments: PaymentRow[];
  credit_paisa: number;
  returns: ReturnSummary[];
  revisions: RevisionRow[];
  can_edit: boolean;
  edit_blocked_reason?: string | null;
}

export interface EditSaleInput {
  sale_id: string;
  expected_revision: number;
  customer_id?: string | null;
  lines: CheckoutLineInput[];
  global_discount_paisa: number;
  settlement: PaymentTenderInput[];
  refund_to_khata: boolean;
  reason: string;
  approval?: ApprovalInput | null;
}

export interface SaleEditPreview {
  old_total_paisa: number;
  new_total_paisa: number;
  diff_paisa: number;
  stock_warnings: string[];
}

export interface PurchaseListQuery {
  from: string;
  to: string;
  offset_min: number;
  query?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface PurchaseListRow {
  id: string;
  doc_no: string;
  created_at: string;
  vendor_name: string;
  vendor_invoice_no?: string | null;
  item_count: number;
  freight_paisa: number;
  total_paisa: number;
  status: string;
  revision: number;
  returned_paisa: number;
  entered_by?: string | null;
}

export interface PurchaseReturnSummary {
  id: string;
  doc_no: string;
  total_paisa: number;
  created_at: string;
  reason?: string | null;
}

export interface PurchaseDetail {
  invoice: PurchaseInvoice;
  returns: PurchaseReturnSummary[];
  paid_paisa: number;
  revisions: RevisionRow[];
  can_edit: boolean;
  edit_blocked_reason?: string | null;
}

export interface EditPurchaseInput {
  purchase_id: string;
  expected_revision: number;
  vendor_id: string;
  vendor_invoice_no?: string | null;
  freight_paisa: number;
  lines: { variant_id: string; unit_id: string; received_qty_milli: number; unit_cost_paisa: number }[];
  reason: string;
}

export interface PurchaseEditPreview {
  old_total_paisa: number;
  new_total_paisa: number;
  diff_paisa: number;
  vendor_diff_text: string;
}

export interface PackagingUnitDetail {
  unit_id: string;
  unit_name: string;
  unit_code: string;
  factor_to_base: number;
  barcode?: string | null;
  retail_price_paisa?: number | null;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  name_ur?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  base_unit_id: string;
  base_unit_code: string;
  barcode?: string | null;
  retail_price_paisa: number;
  wholesale_price_paisa?: number | null;
  tax_rate_id?: string | null;
  reorder_level_milli: number;
  is_service: boolean;
  active: boolean;
  track_mode?: string | null;
  packaging_unit?: PackagingUnitDetail | null;
  on_hand_milli: number;
  has_movements: boolean;
  has_sales: boolean;
  has_purchases: boolean;
  serial_count: number;
}

export interface UpdatePackagingUnit {
  unit_id: string;
  factor_to_base: number;
  barcode?: string | null;
  retail_price_paisa?: number | null;
}

export interface UpdateProductInput {
  product_id: string;
  sku: string;
  name: string;
  name_ur?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  base_unit_id: string;
  barcode?: string | null;
  retail_price_paisa: number;
  wholesale_price_paisa?: number | null;
  tax_rate_id?: string | null;
  reorder_level_milli: number;
  is_service: boolean;
  active: boolean;
  packaging_unit?: UpdatePackagingUnit | null;
}

export const api = {
  // phones (Owner)
  phonesStatus: () => call<PhonesStatus>("phones_status"),
  setPhonesEnabled: (enabled: boolean) => call<void>("set_phones_enabled", { enabled }),
  phonePairingQr: () => call<string>("phone_pairing_qr"),
  cancelPhonePairing: () => call<void>("cancel_phone_pairing"),
  listPhones: () => call<LanDevice[]>("list_phones"),
  removePhone: (device_id: string) => call<void>("remove_phone", { device_id }),

  // status, setup, login
  appStatus: () => call<StartupInfo>("app_status"),
  setupFirstRun: (store: StoreSetupInput, owner: OwnerSetupInput) => call<SetupResult>("setup_first_run", { store, owner }),
  loginPassword: (username: string, password: string) => call<SessionInfo>("login_password", { username, password }),
  loginPin: (user_id: string, pin: string) => call<SessionInfo>("login_pin", { user_id, pin }),
  logout: () => call<void>("logout"),
  revealRecoveryPhrase: (password: string) => call<string>("reveal_recovery_phrase", { password }),

  // users
  listUsers: () => call<UserSummary[]>("list_users"),
  createUser: (input: NewUserInput) => call<UserSummary>("create_user", { input }),
  setPin: (new_pin: string, user_id?: string | null) => call<void>("set_pin", { user_id: user_id ?? null, new_pin }),
  setUserActive: (user_id: string, active: boolean) => call<void>("set_user_active", { user_id, active }),

  // branches on this PC (desktop app only)
  branches: () => call<BranchesInfo>("branches"),
  branchOpen: (id: string) => call<void>("branch_open", { id }),
  branchCreate: (name: string) => call<Branch>("branch_create", { name }),

  // settings / system
  getSettings: () => call<BusinessSettings>("get_settings"),
  saveSettings: (settings: BusinessSettings) => call<void>("save_settings", { settings }),
  diagnostics: () => call<DiagnosticsInfo>("diagnostics"),

  // catalog
  searchProducts: (query: string, limit = 50) => call<ProductRow[]>("search_products", { query, limit }),
  /** Sale screen search: leaves out items with no stock (when the shop blocks that). */
  searchSellable: (query: string, limit = 50) => call<ProductRow[]>("search_sellable", { query, limit }),
  scanCode: (code: string) => call<ScanResult | null>("scan_code", { code }),
  generateBarcode: () => call<string>("generate_barcode"),
  assignBarcode: (variant_id: string) => call<string>("assign_barcode", { variant_id }),
  printLabels: (variant_id: string, copies: number, size: "38x25" | "50x30", printer_name?: string | null) =>
    call<void>("print_labels", { variant_id, copies, size, printer_name: printer_name || null }),
  createProduct: (params: CreateProductParams, is_service = false) => call<ProductSearchResult>("create_product", { params, is_service }),
  postPurchaseReturn: (input: PurchaseReturnInput) => call<PurchaseReturnDoc>("post_purchase_return", { input }),
  listPurchaseReturns: (limit = 100) => call<PurchaseReturnDoc[]>("list_purchase_returns", { limit }),
  createClaim: (input: ClaimInput) => call<Claim>("create_claim", { input }),
  updateClaim: (id: string, status: ClaimStatus, notes: string | null, credit_paisa: number | null) => call<Claim>("update_claim", { id, status, notes, credit_paisa }),
  listClaims: (status: "open" | "done" | null) => call<Claim[]>("list_claims", { status }),
  report: (kind: string, from: string, to: string) => call<ReportTable>("report", { kind, from, to, offset_min: -new Date().getTimezoneOffset() }),
  /** Desktop app: saves into Documents\Next POS Exports and returns the path. */
  saveExport: (file_name: string, data_base64: string) => call<string>("save_export", { file_name, data_base64 }),
  openExportsFolder: () => call<void>("open_exports_folder"),
  /** Excel (.xlsx / .xls) or CSV file, as base64. Existing SKUs are skipped. */
  importProductsFile: (file_name: string, data_base64: string) => call<ImportSummary>("import_products_file", { file_name, data_base64 }),
  updatePrice: (variant_id: string, retail_paisa: number, wholesale_paisa?: number | null) =>
    call<void>("update_price", { variant_id, retail_paisa, wholesale_paisa: wholesale_paisa ?? null }),
  listUnits: () => call<Unit[]>("list_units"),
  createUnit: (code: string, name: string, decimals: number) => call<Unit>("create_unit", { code, name, decimals }),
  listCategories: () => call<Category[]>("list_categories"),
  createCategory: (name: string, name_ur?: string | null, parent_id?: string | null) =>
    call<Category>("create_category", { name, name_ur: name_ur || null, parent_id: parent_id || null }),
  listBrands: () => call<Brand[]>("list_brands"),
  createBrand: (name: string, name_ur?: string | null) => call<Brand>("create_brand", { name, name_ur: name_ur || null }),
  listTaxRates: () => call<TaxRate[]>("list_tax_rates"),
  createTaxRate: (name: string, rate_bp: number, inclusive: boolean) => call<TaxRate>("create_tax_rate", { name, rate_bp, inclusive }),
  importCsv: (csv_text: string) => call<ImportSummary>("import_csv", { csv_text }),
  stockList: () => call<InventoryBalanceView[]>("stock_list"),

  // parties
  listCustomers: (query = "") => call<CustomerSummary[]>("list_customers", { query }),
  listVendors: (query = "") => call<CustomerSummary[]>("list_vendors", { query }),
  createParty: (input: CustomerInput) => call<CustomerSummary>("create_party", { input }),

  // shift
  activeShift: () => call<CashSession | null>("active_shift"),
  startShift: (opening_float_paisa: number) => call<CashSession>("start_shift", { opening_float_paisa }),
  cashDrop: (amount_paisa: number, reason: string) => call<void>("cash_drop", { amount_paisa, reason }),
  closeShift: (counted_cash_paisa: number) => call<ZReportData>("close_shift", { counted_cash_paisa }),

  // checkout
  quote: (customer_id: string | null, lines: CheckoutLineInput[], global_discount_paisa = 0) =>
    call<Quote>("quote", { customer_id, lines, global_discount_paisa }),
  checkout: (input: CheckoutInput) => call<ReceiptData>("checkout", { input }),
  recentSales: (limit = 50) => call<RecentSale[]>("recent_sales", { limit }),
  getReceipt: (sale_id: string) => call<ReceiptData>("get_receipt", { sale_id }),
  parkCart: (name: string, customer_id: string | null, lines: CheckoutLineInput[]) =>
    call<string>("park_cart", { name, customer_id, lines }),
  listParked: () => call<ParkedCartSummary[]>("list_parked"),
  recallParked: (id: string) => call<RecalledCart>("recall_parked", { id }),
  deleteParked: (id: string) => call<void>("delete_parked", { id }),

  // returns
  findSaleForReturn: (doc_no: string) => call<ReturnableSale>("find_sale_for_return", { doc_no }),
  postReturn: (input: ReturnInput) => call<CompletedReturn>("post_return", { input }),

  // khata
  khataStatement: (party_id: string, from: string, to: string) => call<KhataStatement>("khata_statement", { party_id, from, to }),
  receivePayment: (party_id: string, amount_paisa: number, method: string, reference?: string | null) =>
    call<PaymentAllocationResult>("receive_payment", { party_id, amount_paisa, method, reference: reference || null }),
  aging: (party_type: "customer" | "vendor") => call<AgingReportBucket[]>("aging", { party_type }),
  openWhatsappReminder: (party_id: string) => call<string>("open_whatsapp_reminder", { party_id }),

  // purchases / stock count
  postPurchase: (input: CreatePurchaseInput) => call<PurchaseInvoice>("post_purchase", { input: { ...input, user_id: null } }),
  listPurchases: (limit = 100) => call<PurchaseInvoice[]>("list_purchases", { limit }),
  startStockCount: (notes?: string | null) => call<StockCountSession>("start_stock_count", { notes: notes || null }),
  recordStockCounts: (session_id: string, items: { variant_id: string; counted_qty_milli: number; notes?: string | null }[]) =>
    call<void>("record_stock_counts", { session_id, items: items.map((i) => ({ ...i, notes: i.notes ?? null })) }),
  currentStockCount: () => call<StockCountSession | null>("current_stock_count"),
  finalizeStockCount: (session_id: string) => call<StockCountSession>("finalize_stock_count", { session_id }),

  // reports
  financialSummary: (from: string, to: string) => call<FinancialSummary>("financial_summary", { from, to }),
  categoryPerformance: (from: string, to: string) => call<CategoryPerformance[]>("category_performance", { from, to }),
  topProducts: (from: string, to: string, limit = 10) => call<TopProduct[]>("top_products", { from, to, limit }),
  inventoryValuation: () => call<InventoryValuation>("inventory_valuation"),
  lowStock: () => call<LowStockRow[]>("low_stock"),

  // license / backup
  licenseInfo: () => call<LicenseInfo>("license_info"),
  installLicense: (token: string) => call<LicenseStatus>("install_license", { token }),
  defaultBackupDir: () => call<string>("default_backup_dir"),
  createBackup: (password: string, dir?: string | null) => call<BackupFileInfo>("create_backup", { dir: dir || null, password }),
  listBackups: (dir?: string | null) => call<BackupFileInfo[]>("list_backups", { dir: dir || null }),
  verifyBackup: (path: string, password: string) => call<BackupManifest>("verify_backup", { path, password }),
  restoreBackup: (path: string, password: string) => call<RestoreReport>("restore_backup", { path, password }),
  createSnapshot: () => call<SnapshotInfo>("create_snapshot"),
  listSnapshots: () => call<SnapshotInfo[]>("list_snapshots"),

  // Next POS Cloud (Owner only)
  cloudStatus: () => call<CloudStatus>("cloud_status"),
  cloudLink: (code: string) => call<CloudStatus>("cloud_link", { code }),
  cloudUnlink: () => call<CloudStatus>("cloud_unlink"),
  cloudResendAll: () => call<CloudStatus>("cloud_resend_all"),
  cloudSetBackupPassword: (password: string) => call<CloudStatus>("cloud_set_backup_password", { password }),
  cloudSyncNow: () => call<CloudActionResult>("cloud_sync_now"),
  cloudBackupNow: () => call<CloudActionResult>("cloud_backup_now"),

  // printing (receipt content is built by the backend)
  listPrinters: () => call<string[]>("list_printers"),
  printReceipt: (sale_id: string, printer_name?: string | null, width?: "58mm" | "80mm") =>
    call<void>("print_receipt", { sale_id, printer_name: printer_name || null, width: width || null }),
  printZReport: (printer_name?: string | null, width?: "58mm" | "80mm") =>
    call<void>("print_z_report", { printer_name: printer_name || null, width: width || null }),
  printTestReceipt: (printer_name?: string | null, width?: "58mm" | "80mm") =>
    call<void>("print_test_receipt", { printer_name: printer_name || null, width: width || null }),
  kickDrawer: (printer_name?: string | null) => call<void>("kick_drawer", { printer_name: printer_name || null }),
  cutPaper: (printer_name?: string | null) => call<void>("cut_paper", { printer_name: printer_name || null }),

  // history & editing
  listSales: (query: SaleListQuery) => call<SaleListRow[]>("list_sales", { query }),
  saleDetail: (sale_id: string) => call<SaleDetail>("sale_detail", { sale_id }),
  saleRevision: (sale_id: string, revision: number) => call<any>("sale_revision", { sale_id, revision }),
  quoteSaleEdit: (input: EditSaleInput) => call<SaleEditPreview>("quote_sale_edit", { input }),
  editSale: (input: EditSaleInput) => call<ReceiptData>("edit_sale", { input }),

  listPurchasesFiltered: (query: PurchaseListQuery) => call<PurchaseListRow[]>("list_purchases_filtered", { query }),
  purchaseDetail: (purchase_id: string) => call<PurchaseDetail>("purchase_detail", { purchase_id }),
  purchaseRevision: (purchase_id: string, revision: number) => call<any>("purchase_revision", { purchase_id, revision }),
  quotePurchaseEdit: (input: EditPurchaseInput) => call<PurchaseEditPreview>("quote_purchase_edit", { input }),
  editPurchase: (input: EditPurchaseInput) => call<PurchaseInvoice>("edit_purchase", { input }),

  productDetail: (product_id: string) => call<ProductDetail>("product_detail", { product_id }),
  updateProduct: (input: UpdateProductInput) => call<ProductSearchResult>("update_product", { input }),
};

// ---------------------------------------------------------------- helpers

export function formatPkr(paisa: number | null | undefined): string {
  const v = (paisa ?? 0) / 100;
  return `Rs ${v.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatQty(milli: number, unit?: string): string {
  const n = milli / 1000;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "");
  return unit ? `${s} ${unit}` : s;
}

/** Local printer preferences (per PC, not business data). */
export function printerPrefs() {
  let name: string | null = null;
  let width: "58mm" | "80mm" = "58mm";
  let autoKick = true;
  // "raw": ESC/POS straight to a thermal printer (no print window).
  // "driver": receipt only, through the Windows print window (any printer).
  let mode: "raw" | "driver" = "raw";
  try {
    mode = localStorage.getItem("pos_print_mode") === "driver" ? "driver" : "raw";
    name = localStorage.getItem("pos_printer_name") || null;
    width = (localStorage.getItem("pos_roll_width") as "58mm" | "80mm") || "58mm";
    autoKick = localStorage.getItem("pos_auto_kick_drawer") !== "false";
  } catch {
    /* storage unavailable: defaults */
  }
  return { name, width, autoKick, mode, raw: mode === "raw" && !!name };
}

export function hasPerm(session: SessionInfo | null | undefined, p: Permission): boolean {
  return !!session && session.permissions.includes(p);
}

export function licenseLabel(s: LicenseStatus): string {
  switch (s.status) {
    case "Active":
      return s.details.days_left == null ? `Licensed (${s.details.tier})` : `Licensed (${s.details.tier}), ${s.details.days_left} days left`;
    case "GracePeriod":
      return `Expired, grace period: ${s.details.grace_days_left} days left`;
    case "TrialActive":
      return `Trial: ${s.details.days_left} days left`;
    case "Expired":
      return "License expired";
    case "MachineMismatch":
      return "License is for a different PC";
    case "InvalidSignature":
      return "License key is not valid";
    case "MalformedToken":
      return "License key is damaged";
    case "ClockTampered":
      return "PC clock was moved back";
  }
}
