# Handover: Sale History, Purchase History & Full Editing

> **Arshad ke liye (kaise use karein):**
> 1. Ye file project mein `docs\HANDOVER_HISTORY_AND_EDITING.md` par rakhi hai.
> 2. Doosre AI ko poora project folder (`D:\Anti Gravity\Tools\pos`) do aur ye kaho:
>    *"Read docs/HANDOVER_HISTORY_AND_EDITING.md fully and implement it. Follow every rule in it. Run all the checks in section 9 before telling me it is done."*
> 3. Section 10 mein kuch faisle hain jo aap ne karne hain. AI ko kaam shuru karne se pehle unke jawab de dein, warna wo wahan likhe "default" par chalega.
> 4. Kaam ke baad section 9 ki checklist khud bhi app chala kar dekh lein.

---

## 0. What to build (summary)

Three features in the desktop app of **Next POS** (offline-first POS for Pakistan):

| # | Feature | Short description |
|---|---------|-------------------|
| A | **Sale History tab** | List every sale receipt, with date range and search. Open any receipt to view it, reprint it and **edit** it. |
| B | **Purchase History** | The same for purchase invoices: list, view, print and **edit**. |
| C | **Full product edit** | Every product detail is editable, not only the price. |

Every edit must keep **stock, khata (party ledger), cash/payments, reports and the audit log** correct. Accounting correctness matters more than UI polish. Never silently change money or stock history.

Do **only** what this document asks. Do not add other features, redesign existing screens or rename things. If something is unclear, stop and ask the owner (see section 10).

---

## 1. Project map and conventions (read first)

### 1.1 Stack
- **Rust workspace**
  - `crates/pos-core`: all business logic and the database. SQLite with SQLCipher, refinery migrations.
  - `crates/pos-lan`: phone link. **Do not touch it.**
  - `apps/desktop/src-tauri`: the Tauri 2 desktop shell (`src/main.rs`).
  - `apps/mobile/src-tauri`: the Android app. **Do not touch it.**
- **Frontend:** `apps/desktop/src`, built with React 18, Vite, Tailwind and TypeScript.

### 1.2 Key files

| Area | File |
|------|------|
| Service layer (every command, permission checks) | `crates/pos-core/src/app.rs` (`impl PosApp`) |
| Newer commands (returns, claims, import) | `crates/pos-core/src/ops.rs`, routed through `dispatch_ops` |
| Reports engine | `crates/pos-core/src/reports.rs` |
| Sale posting | `crates/pos-core/src/domain/sale.rs` (`SaleRepo::post_sale`) |
| Purchase posting | `crates/pos-core/src/domain/purchase.rs` (`PurchaseRepo::post_purchase`, `allocate_landed_cost`, `calculate_new_avg_cost`, `next_doc_no`) |
| Stock ledger | `crates/pos-core/src/domain/inventory.rs` (`InventoryRepo::record_movement`, `update_avg_cost`, `get_balance`) |
| Khata | `crates/pos-core/src/domain/khata.rs` (`KhataRepo::get_balance`, `record_entry`, `check_credit_limit`, `allocate_payment_fifo`) |
| Products | `crates/pos-core/src/domain/catalog.rs` (`CatalogRepo::create_product`, `get_by_id`) |
| Audit | `crates/pos-core/src/domain/audit.rs` (`AuditRepo::write`) |
| Migrations | `crates/pos-core/src/db/migrations/V1…V10` (next one is **V11**) |
| Tauri commands | `apps/desktop/src-tauri/src/main.rs` |
| Frontend API | `apps/desktop/src/lib/api.ts` (types plus `api.*` calls) |
| Keyboard entry widgets | `apps/desktop/src/components/entry/keyboard.tsx` (`CellInput`, `ItemSearch`, `PartyTypeAhead`, `NumberBox`, `Key`, `focusCell`) |
| Print helper | `apps/desktop/src/lib/print.ts` (`printElement`, `receiptPage`, `A4_PAGE`) |
| Receipt view | `apps/desktop/src/components/ReceiptModal.tsx` (prints `#receipt-print`) |
| POS screen | `apps/desktop/src/components/CheckoutView.tsx` |
| Purchase screen | `apps/desktop/src/components/PurchasingView.tsx` (keyboard `PurchaseEntry` and a basic `History`) |
| Products | `apps/desktop/src/components/CatalogView.tsx` and `ProductFormModal.tsx` |
| Navigation | `apps/desktop/src/App.tsx` (`Tab` type, `TAB_PERMS`, menus) |

### 1.3 Rules that apply everywhere

**Data formats**
- Money is an `i64` count of **paisa** (Rs 1 = 100). Quantity is an `i64` count of **milli-units** (1 pc = 1000).
- Never use floats in Rust for money or quantity. The UI converts with `Math.round(x * 100)` and `Math.round(x * 1000)`.
- IDs are ULID strings. Times are stored as RFC 3339 UTC (`chrono::Utc::now().to_rfc3339()`).
- Reports convert to the shop time zone with `offset_min` (Pakistan = 300).
- Document numbers come from `PurchaseRepo::next_doc_no(&tx, "<doc_type>")` and the `document_sequences` table.

**How commands are written**
- Every public `PosApp` method starts with `self.require(Permission::X)?`. Use `self.require_login()?` only for read-only things that every role may see.
- Every write that touches more than one table runs inside **one transaction** (`conn.transaction()` then `tx.commit()`). If any step fails, nothing is saved.

**Stock**
- Stock changes only through `InventoryRepo::record_movement`. That function also enforces the negative-stock policy.
- Never `UPDATE inventory_balances.on_hand_milli` by hand.
- Never delete rows from `stock_movements`. Corrections are new rows.

**Khata and payments**
- Khata changes only by inserting new `party_ledger` rows. Never update or delete old ones; corrections are new rows.
- Rows in the `payments` table are never updated or deleted, because closed shifts depend on them. Money differences become **new** payment rows.

**Audit and sync**
- Write `AuditRepo::write(...)` for every edit, with the reason and a JSON before/after summary.
- Add a `sync_outbox` row the same way `post_sale` does, using a new event type such as `sale_edited` or `purchase_edited`.

**Adding a command needs three places:**
1. A `PosApp` method plus a line in `dispatch(...)` in `app.rs` (or in `dispatch_ops` in `ops.rs`). This also makes it work in the browser test server.
2. A `#[tauri::command(rename_all = "snake_case")]` function in `main.rs`, registered in `invoke_handler`.
3. A typed wrapper in `api.ts`.

**Phone and security**
- **Do not** add the new edit commands to `PHONE_COMMANDS` in `crates/pos-core/src/lan.rs`. Editing is PC-only.
- **Never** open, read, copy or print anything in the `.nextpos_signing` folder (private license key).
- Do not add network calls. Do not weaken permission checks.

**UI rules (the owner asked for these)**
- Fully **keyboard-driven**: type-in boxes only, no dropdowns or select menus. Follow the pattern in `PurchaseEntry` and `CheckoutView` (Enter moves to the next box, F-keys for actions, Esc closes).
- Show the key next to each button with `<Key>`.
- Show every user-facing message in plain English, as existing screens do. Errors from the backend are shown as they are.

---

## 2. Database migration V11

Create `crates/pos-core/src/db/migrations/V11__history_editing.sql`. Keep it additive: only add tables and columns, never drop or rename.

```sql
-- V11: edit history for sales and purchases.

ALTER TABLE sales ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN edited_at TEXT;
ALTER TABLE sales ADD COLUMN edited_by TEXT REFERENCES users(id);

ALTER TABLE purchases ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN edited_at TEXT;
ALTER TABLE purchases ADD COLUMN edited_by TEXT REFERENCES users(id);
ALTER TABLE purchases ADD COLUMN user_id TEXT REFERENCES users(id);

-- Full copy of a document as it was BEFORE each edit (JSON of header + lines + payments).
CREATE TABLE IF NOT EXISTS document_revisions (
    id TEXT PRIMARY KEY,
    doc_kind TEXT NOT NULL CHECK(doc_kind IN ('sale', 'purchase')),
    doc_id TEXT NOT NULL,
    revision INTEGER NOT NULL,          -- the revision number that was replaced
    snapshot_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    edited_by TEXT REFERENCES users(id),
    edited_at TEXT NOT NULL,
    UNIQUE(doc_kind, doc_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_doc ON document_revisions(doc_kind, doc_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);
```

**Notes**
- The migration runner picks up the new file automatically. Check how V10 is registered and do the same.
- `purchases.user_id` stays NULL for old purchases. `post_purchase` should now fill it in. `CreatePurchaseInput.user_id` already exists, but the INSERT does not store it.
- Add a test that opens an older database (V10) and migrates it to V11 without data loss. Check `db_tests.rs` for the existing pattern.

---

## 3. Feature A: Sale History tab

### 3.1 Backend (read side)

Add to `app.rs`, or to a new `crates/pos-core/src/history.rs` mounted like `ops.rs` with its own `dispatch_history` checked inside `dispatch`:

```rust
pub struct SaleListQuery {
    pub from: String,          // "YYYY-MM-DD" local date
    pub to: String,            // inclusive
    pub offset_min: i32,       // shop time zone, as in reports.rs
    pub query: Option<String>, // doc no, customer name/phone, product name/sku/barcode
    pub limit: Option<usize>,  // default 200, max 1000
    pub offset: Option<usize>,
}

pub struct SaleListRow {
    pub id: String,
    pub doc_no: String,
    pub created_at: String,
    pub customer_name: Option<String>,
    pub salesman: Option<String>,   // users.username via sales.user_id, else cash_sessions.user_id
    pub item_count: i64,
    pub total_paisa: i64,
    pub paid_text: String,          // e.g. "Cash 1,200 · Khata 300" built from payments + ledger
    pub status: String,             // posted / voided / held
    pub revision: i64,              // > 0 means edited
    pub returned_paisa: i64,        // SUM of sale_returns.refund_paisa for this sale
}

pub fn list_sales(&self, q: SaleListQuery) -> Result<Vec<SaleListRow>>;
```

**`list_sales`**
- Convert the from/to dates to a UTC range exactly as `reports.rs` does; reuse its helper.
- Order by `created_at DESC`.
- Search matches:
  - `sales.doc_no LIKE`;
  - `parties.name` / `parties.phone LIKE`;
  - `EXISTS(sale_lines` joined to products/barcodes matching name, sku or barcode`)`.

```rust
pub struct SaleDetail {
    pub receipt: ReceiptData,           // reuse the existing receipt(sale_id) builder
    pub payments: Vec<PaymentRow>,      // method, amount, reference, occurred_at, direction
    pub credit_paisa: i64,              // khata part (party_ledger entry_type 'sale' with source_doc = doc_no)
    pub returns: Vec<ReturnSummary>,    // doc_no, refund_paisa, created_at
    pub revisions: Vec<RevisionRow>,    // revision, reason, edited_by name, edited_at
    pub can_edit: bool,
    pub edit_blocked_reason: Option<String>, // why editing is not allowed (see 4.2)
}

pub fn sale_detail(&self, sale_id: &str) -> Result<SaleDetail>;
pub fn sale_revision(&self, sale_id: &str, revision: i64) -> Result<serde_json::Value>; // view an old version
```

**Payments for a sale**
- Today, cash and other tenders are stored in `payments` with `reference` starting with the sale's `doc_no` (for example `"SAL-12 (received …, change …)"`, or the tender reference, or the doc_no).
- Match payments by `reference LIKE doc_no || '%'`. After this feature, edit settlements will also use references that start with the doc_no (see 4.3), so the same match keeps working.
- Credit is the `party_ledger` row with `entry_type = 'sale'` and `source_doc = doc_no`.

**Permissions**
- View: `SalesCreate` **or** `SalesReturn`, so Cashiers can view (see decision D1).
- `can_edit` is true only if the session has `SalesVoid` (Owner/Manager) **and** no block applies (4.2).
- The existing `recent_sales` stays as it is.

### 3.2 Frontend

- Add a new top-level tab **"Sale history"** in `App.tsx`.
  - Tab key `"sales"`.
  - `TAB_PERMS.sales = ["SalesCreate", "SalesReturn"]`.
  - Place it right after the POS button.
- New component `apps/desktop/src/components/SaleHistoryView.tsx`.

**Layout**
1. **Top bar**
   - From / To date boxes, the same look and behaviour as `ReportsView`.
   - Quick keys: `Alt+T` today, `Alt+Y` yesterday, `Alt+W` this week, `Alt+M` this month.
   - A **search box** that is focused on open (`F2` focuses it again). Search runs as you type, with a 250 ms debounce.
2. **Table**
   - Columns: Date/time, Receipt no., Customer, Salesman, Items, Total, Paid, Status badges ("Edited", "Returned", "Voided").
   - Navigation: `↑/↓` moves the highlighted row; `Enter` opens it; `PageDown` loads more rows.
3. **Receipt panel** (right side, or full screen on narrow windows)
   - Shows the receipt exactly as `ReceiptModal` renders it. Reuse its receipt markup: extract it into a `ReceiptView` component used by both, without changing how `ReceiptModal` looks.
   - Under the receipt: the payments list, returns list and edit history.
   - Keys:
     - `P`: **Print**, using the same print path as `ReceiptModal` (raw ESC/POS or `printElement('#receipt-print')` according to `printerPrefs()`).
     - `E`: **Edit**, only when `can_edit`; otherwise show `edit_blocked_reason`.
     - `R`: **Return**. Opens the existing sale-return flow with this receipt number (`SaleReturnsModal`). Only if the user has `SalesReturn`.
     - `Esc`: back to the list.
   - Clicking an edit-history row shows that old version, read-only, with a clear "OLD VERSION, rev N" label.

---

## 4. Feature A2: Editing a sale

### 4.1 Approach: "reverse and repost" inside one transaction

The sale keeps its **id, doc_no and original date** (`created_at`). Internally the old effects are reversed and the new version is posted, all inside one transaction:

1. **Save a snapshot.** Load the current sale (header, lines, payments, credit). Insert it as JSON into `document_revisions` with `revision = sales.revision` and the reason.
2. **Reverse old stock.** For every old line that is not a service:
   - Call `record_movement` with `+base_qty` (the qty converted with `unit_factor`).
   - Use `movement_type = "sale_edit_reversal"`, `source_doc = doc_no`, and `unit_cost = sale_lines.unit_cost_snapshot_paisa`.
   - If a line has a `serial_id`, see 4.2.
3. **Replace the lines.** Delete the old `sale_lines` rows. This is safe because sales with returns cannot be edited, so nothing references them. Insert the new lines.
4. **Post new stock and line costs.** Use the **same rules as `post_sale`**:
   - unit conversion;
   - price floor (`min_sale_price`, no price below wholesale unless approved);
   - tax;
   - discount;
   - services take no stock;
   - `unit_cost_snapshot` and `cogs` at the current average cost;
   - negative-stock policy;
   - a `price_override` audit row for each changed price.

   Each new stock row is `record_movement(-base_qty, "sale_edit", source_doc = doc_no)`.

   **Do not copy-paste `post_sale`.** Refactor the line-building and validation part of `SaleRepo::post_sale` into a shared function, for example `SaleRepo::build_and_insert_lines(tx, sale_id, doc_no, lines, user_id, movement_type)`. Use it from both `post_sale` and `edit_sale`. All existing sale tests must still pass unchanged.
5. **Update the header.** Update the `sales` row: `subtotal_paisa`, `discount_paisa`, `tax_paisa`, `total_paisa`, `party_id`, `revision = revision + 1`, `edited_at`, `edited_by`.
6. **Settle the money** (section 4.3).
7. **Audit and sync.**
   - Audit row: `action = "sale_edited"`, `entity = "sale"`, `entity_id = sale_id`, `reason`, and details JSON `{doc_no, old_total, new_total, revision}`.
   - Add a `sync_outbox` event `sale_edited`.
8. **Commit** and return the new `ReceiptData`.

### 4.2 When editing is NOT allowed

Return a `PosError::BusinessRule` with a plain message in these cases. `sale_detail` must report the same reason in `edit_blocked_reason`.

| Situation | Message |
|-----------|---------|
| Sale `status` is not `posted` (voided or held) | "This sale is voided/held and cannot be edited." |
| The sale has any `sale_returns` row | "Items from this receipt were returned. Use Return instead of Edit." |
| A line has a `serial_id` and that line's item or qty would change | "Serial/IMEI items cannot be changed by edit. Return them instead." Price change on such a line is allowed. |
| New khata (credit) amount is less than what was already received against this sale in `invoice_allocations` | "Rs X was already received against this receipt on khata. The new khata amount cannot be lower." |
| The user lacks `SalesVoid` and gives no Owner/Manager approval | "Editing a receipt needs Owner/Manager approval." Allow the same `ApprovalInput` flow `checkout` uses (`verify_approval`). |
| Zero lines left | "A receipt needs at least one item." |
| The customer is changed, the old sale had a khata part, and the new customer is empty | "Select a customer for the khata part." |

### 4.3 Money settlement (the difference)

`old_total` is the sale total before the edit and `new_total` the total after it; `diff = new_total - old_total`. The edit screen shows the difference and asks how to settle it.

**`diff > 0` (customer pays more)**
- Tenders work like checkout: cash, card, jazzcash, easypaisa, raast, bank, cheque, or `credit` (khata).
- Insert new `payments` rows:
  - `direction = 'inbound'`;
  - `reference = "<doc_no> edit rev <n>"`;
  - `cash_session_id` = the **editor's current open shift**.
- The credit part becomes a new `party_ledger` row:
  - `entry_type = 'sale_edit'`, `debit = amount`, `source_doc = doc_no`;
  - the balance is computed with `KhataRepo::get_balance`;
  - check the credit limit as `checkout` does.

**`diff < 0` (shop gives money back)**
- The user chooses one of two ways:
  - **Cash refund:** a `payments` row with `direction = 'outbound'`, `method = 'cash'`, the reference above, and the current shift.
  - **Reduce khata** (only if a customer is set): a `party_ledger` row with `entry_type = 'sale_edit'`, `credit = |diff|`.

**`diff == 0`**
- No money rows.

**Rules**
- Any cash moving in or out needs an **open shift** for the editor. Otherwise: "Start your shift before an edit that moves cash."
- Old payment rows are **never** changed. Closed shifts' Z-reports stay exactly as they were.

**Customer changed**
- If the old sale had a khata part K:
  - post `credit = K` on the **old** customer (`entry_type 'sale_edit'`, reversing it);
  - post `debit = K` on the **new** customer.
- Then apply the diff as above, against the new customer.

**How it shows in reports**
- Sales reports use `sales.created_at`, so the edited sale stays on its **original date** with the **new** amounts.
- The cash difference appears on the **edit date** through the payments table.
- Write this behaviour in the code comment of `edit_sale`.

### 4.4 Commands

```rust
pub struct EditSaleInput {
    pub sale_id: String,
    pub expected_revision: i64,              // reject if sales.revision differs (someone else edited)
    pub customer_id: Option<String>,
    pub lines: Vec<CheckoutLineInput>,       // same struct checkout uses
    pub global_discount_paisa: i64,
    pub settlement: Vec<TenderInput>,        // how the difference is paid/refunded (empty when diff == 0)
    pub refund_to_khata: bool,               // when diff < 0: true = reduce khata, false = cash out
    pub reason: String,                      // required, min 3 characters
    pub approval: Option<ApprovalInput>,
}
pub fn quote_sale_edit(&self, input: &EditSaleInput) -> Result<SaleEditPreview>; // old/new totals, diff, stock warnings; writes nothing
pub fn edit_sale(&mut self, input: EditSaleInput) -> Result<ReceiptData>;
```

- On a wrong `expected_revision`, return: "This receipt was changed by someone else. Reopen it."
- Dispatch names: `list_sales`, `sale_detail`, `sale_revision`, `quote_sale_edit`, `edit_sale`.

### 4.5 Edit screen (frontend)

- New component `SaleEditView.tsx`, opened from the receipt panel with `E`.
- It looks and works like `CheckoutView`, prefilled with the sale. Reuse `ItemSearch`, `PartyTypeAhead`, `CellInput` and `focusCell` from `entry/keyboard.tsx`.

**Keys**

| Key | Action |
|-----|--------|
| `F2` | Add item |
| `F3` | Customer |
| `Enter` | Move through Qty → Rate → Disc |
| `Ctrl+Del` | Remove line |
| `F6` | Bill discount |
| `F9` | Save (opens the confirm dialog) |
| `Esc` | Cancel; ask "Discard changes?" if anything changed |

**Header**
- A yellow bar: "Editing receipt SAL-123 (original date …)".

**Live summary** (from `quote_sale_edit`)
- Old total, New total, Difference.
- Below it, the settlement boxes:
  - **diff > 0:** "Cash received", "Other (method box, typed: card/jazzcash/…)", "To khata".
  - **diff < 0:** "Give back cash" or "Reduce khata". Toggle with `Alt+1` / `Alt+2`. Type-in only, no dropdown.

**Confirm dialog (F9)**
- Shows the old → new lines difference, the money difference and how it is settled.
- Has a required **Reason** box. Enter saves.
- If approval is needed, open the existing `ApprovalDialog`.

**After saving**
- Show the updated receipt.
- Offer `P` to print, and mark the receipt "Edited (rev N)".

**Receipt label**
- Receipts of edited sales print a small line "Edited rev N · <date>". Add it in the shared `ReceiptView` and in `receipt_payload` (ESC/POS) in `app.rs`.

---

## 5. Feature B: Purchase History and purchase editing

### 5.1 Backend

```rust
pub struct PurchaseListQuery { pub from: String, pub to: String, pub offset_min: i32, pub query: Option<String>, pub limit: Option<usize>, pub offset: Option<usize> }
pub struct PurchaseListRow { id, doc_no, created_at, vendor_name, vendor_invoice_no, item_count, freight_paisa, total_paisa, status, revision, returned_paisa /* purchase_returns with purchase_id */, entered_by: Option<String> }
pub fn list_purchases_filtered(&self, q: PurchaseListQuery) -> Result<Vec<PurchaseListRow>>;

pub struct PurchaseDetail { pub invoice: PurchaseInvoice, pub returns: Vec<…>, pub paid_paisa: i64 /* invoice_allocations */, pub revisions: Vec<RevisionRow>, pub can_edit: bool, pub edit_blocked_reason: Option<String> }
pub fn purchase_detail(&self, purchase_id: &str) -> Result<PurchaseDetail>;
pub fn purchase_revision(&self, purchase_id: &str, revision: i64) -> Result<serde_json::Value>;

pub struct EditPurchaseInput { pub purchase_id: String, pub expected_revision: i64, pub vendor_id: String, pub vendor_invoice_no: Option<String>, pub freight_paisa: i64, pub lines: Vec<CreatePurchaseLineInput>, pub reason: String }
pub fn quote_purchase_edit(&self, input: &EditPurchaseInput) -> Result<PurchaseEditPreview>;
pub fn edit_purchase(&mut self, input: EditPurchaseInput) -> Result<PurchaseInvoice>;
```

- Search matches doc no, vendor name or phone, vendor bill no., and product name/sku/barcode.
- `PurchaseInvoice` must also carry the `revision` field, so the UI can label edited purchases.
- The existing `list_purchases` stays.

**Permissions**
- View: `PurchaseEntry`.
- Edit: `PurchaseEntry` **and** `PriceEdit`. Owner and Manager have both; a Stock Keeper can view but not edit (see decision D2).

### 5.2 Edit algorithm (one transaction)

1. **Snapshot.** Save the current purchase into `document_revisions`.
2. **Reverse each old line.** Call `record_movement(-received_qty, "purchase_edit_reversal", source_doc = doc_no, unit_cost = purchase_lines.unit_cost_paisa)`. That column already holds the effective landed cost.
   - The negative-stock check applies. If the goods were already sold, the reversal fails with the normal "Not enough stock" message. Map it to: "<Item>: N already sold from this purchase. You can lower qty by at most M."
3. **Fix the average cost after the reversal.** With `on_hand` and `avg` read *before* this line's reversal, `q = old qty` and `c = old effective cost`:
   - If `on_hand - q > 0`: `new_avg = max(0, (on_hand*avg - q*c) / (on_hand - q))`.
   - Otherwise keep `avg` unchanged.
   - Use integer math, as `calculate_new_avg_cost` does. Apply it with `InventoryRepo::update_avg_cost`.
4. **Replace the lines.** Delete the old `purchase_lines` rows and insert the new ones.
   - Recompute landed cost with `PurchaseRepo::allocate_landed_cost`, so freight changes are spread again.
   - Post inbound movements `"purchase_edit"` and the new average cost with `calculate_new_avg_cost`.
   - As with sales, **refactor** the line part of `post_purchase` into a shared helper rather than copying it.
   - Services are rejected, as in `post_purchase`.
5. **Update the header.** Set `vendor_id`, `vendor_invoice_no`, `freight_paisa`, `total_paisa`, `revision + 1`, `edited_at` and `edited_by` on the `purchases` row.
6. **Vendor khata.**
   - Same vendor: one `party_ledger` row with `entry_type = 'purchase_edit'`.
     - New total higher: `credit = diff` (we owe more).
     - New total lower: `debit = |diff|`.
   - Vendor changed:
     - post `debit = old_total` on the old vendor;
     - post `credit = new_total` on the new vendor.
7. **Audit and sync.** Audit `purchase_edited` with the reason and old/new totals. Add a `sync_outbox` event `purchase_edited`.

### 5.3 When purchase editing is NOT allowed

| Situation | Message |
|-----------|---------|
| `status` is not `received` | "This purchase is not received/active and cannot be edited." |
| A `purchase_returns` row has this `purchase_id` | "Items of this purchase were returned to the vendor. It cannot be edited." |
| New total is less than the amount already paid against it in `invoice_allocations` | "Rs X was already paid on this bill. The new total cannot be lower." |
| Reversal would make stock negative | The message from step 2 |
| Zero lines | "A purchase needs at least one item." |

**Known, accepted limit:** sales made *after* this purchase keep the cost (COGS) they were saved with; edits do not change past profit. Write this in a code comment, and in the confirm dialog as a short note: "Profit of sales already made is not recalculated."

### 5.4 Frontend

- In `PurchasingView.tsx`, replace the basic `History` sub-view with a full **PurchaseHistory** component. Mirror `SaleHistoryView`:
  - date range, quick keys, search;
  - keyboard table;
  - detail panel showing the invoice (vendor, bill no., lines, freight, total, paid, returns, edit history).
- Panel keys:
  - `P`: print on A4 with `printElement` and `A4_PAGE`;
  - `E`: edit;
  - `Esc`: back.
- **Edit** reuses `PurchaseEntry` in a new `mode="edit"`, prefilled with the purchase:
  - same keys (F2 item, F3 vendor, F6 freight, F9 save);
  - a yellow "Editing PUR-… " bar;
  - F9 opens a confirm dialog with old → new total, the vendor khata effect, a required **Reason** box and the profit note.
- Keep the "New purchase" and "Return to vendor" modes working exactly as now.

---

## 6. Feature C: Full product edit

### 6.1 Backend

Add `CatalogRepo::get_detail(conn, product_id)` and `PosApp::product_detail(product_id) -> ProductDetail`. It returns every editable field:

- sku, name, name_ur, category_id/name, brand_id/name, base unit, barcode(s) with their kind, retail and wholesale price of the base unit;
- the packaging unit (unit, factor, barcode, retail price);
- tax_rate_id, reorder_level_milli (low stock alert), is_service, track_mode, active;
- plus read-only facts used for the rules below: `on_hand_milli`, `has_movements`, `has_sales`, `has_purchases`, `serial_count`.

Add `PosApp::update_product(input: UpdateProductInput) -> Result<ProductSearchResult>`:
- Permission `PriceEdit`.
- One transaction.
- `products.updated_at` is set.
- Audit `product_updated` with a JSON list of changed fields `{field: [old, new]}`.
- Only fields that actually changed are written.

```rust
pub struct UpdateProductInput {
    pub product_id: String,
    pub sku: String,
    pub name: String,
    pub name_ur: Option<String>,
    pub category_id: Option<String>,
    pub brand_id: Option<String>,
    pub base_unit_id: String,
    pub barcode: Option<String>,               // main barcode; empty = remove
    pub retail_price_paisa: i64,
    pub wholesale_price_paisa: Option<i64>,
    pub tax_rate_id: Option<String>,
    pub reorder_level_milli: i64,
    pub is_service: bool,
    pub active: bool,
    pub packaging_unit: Option<UpdatePackagingUnit>, // None = no pack unit
}
pub struct UpdatePackagingUnit { pub unit_id: String, pub factor_to_base: i64, pub barcode: Option<String>, pub retail_price_paisa: Option<i64> }
```

**Rules (with plain error messages)**

*Basic fields*
- Name and SKU cannot be empty.
- SKU must be unique among products. Also update the default `product_variants.sku` to match.

*Barcode*
- Must be unique in `barcodes.value`. If it is already used, give the other product's name: "Barcode 123… is already on <Product>".
- Changing the main barcode updates the `barcodes` row and `variant_units.barcode` of the base unit.
- In-store barcodes made by `assign_barcode` stay valid.

*Prices*
- Retail must be > 0. Wholesale must be ≤ retail.
- Reuse `update_price` logic. It logs `price_changed`, so call the same internal code or keep the same audit.

*Base unit*
- Can change only if the product has **no** stock movements and no sale/purchase lines. Otherwise: "Unit cannot change after stock or sales exist."

*Packaging unit*
- Add, change barcode or price: always allowed.
- Change `factor_to_base` or remove it: only if no `sale_lines` / `purchase_lines` / `purchase_return_lines` use that unit. Otherwise: "This pack size is used in old bills. Add a new pack unit instead."

*Product ↔ Service*
- Product → Service: only when `on_hand_milli == 0`. Otherwise: "Stock is not zero. Adjust stock to 0 first."
- Service → Product: always allowed (stock starts at 0).
- When a product becomes a service, set `reorder_level_milli` to 0.

*Active*
- `active = false` hides the product from POS search and scan. It stays in reports and history.
- Check that `search_sellable` and `scan` already filter `active = 1`. If not, add that filter. This is the only change allowed there.

*Not editable here*
- `track_mode` (serial) is not editable by this screen. Show it read-only.

**Old receipts:** receipts read the product name live, so old receipts will show the **new** name. This is expected; do not add name snapshots.

Dispatch names: `product_detail`, `update_product`.

### 6.2 Frontend

- `ProductFormModal.tsx` already has `initialData` and `id` fields. Add an **edit mode**:
  - Title "Edit product".
  - Fields are prefilled from `api.productDetail(id)`.
  - Every field is editable except where the rules above lock it. Locked fields are shown greyed out with the reason as small text (for example "locked: stock exists").
  - Add an **Active** toggle (`Alt+A`).
  - `F9` or Enter on the last field saves.
- `CatalogView.tsx`:
  - On a selected row, `Enter` or `F4` opens **Edit**.
  - Keep the existing quick price edit.
  - After a save, refresh the row.
- Keep the add-product flow exactly as now. The form must still reset on open and close (this was a past bug: the form kept the old values).

---

## 7. API additions (`api.ts`), with types matching the Rust structs

```ts
listSales(q: SaleListQuery): Promise<SaleListRow[]>
saleDetail(sale_id: string): Promise<SaleDetail>
saleRevision(sale_id: string, revision: number): Promise<any>
quoteSaleEdit(input: EditSaleInput): Promise<SaleEditPreview>
editSale(input: EditSaleInput): Promise<ReceiptData>

listPurchasesFiltered(q: PurchaseListQuery): Promise<PurchaseListRow[]>
purchaseDetail(purchase_id: string): Promise<PurchaseDetail>
purchaseRevision(purchase_id: string, revision: number): Promise<any>
quotePurchaseEdit(input: EditPurchaseInput): Promise<PurchaseEditPreview>
editPurchase(input: EditPurchaseInput): Promise<PurchaseInvoice>

productDetail(product_id: string): Promise<ProductDetail>
updateProduct(input: UpdateProductInput): Promise<ProductRow>
```

Register every command in `main.rs` `invoke_handler`. **Do not** add any of them to `PHONE_COMMANDS`.

---

## 8. Tests to write (Rust, `crates/pos-core/tests/history_editing_tests.rs`)

Use the helpers from `ops_reports_tests.rs` and `sale_posting_tests.rs`.

**Sale edit**
1. **Qty increase:**
   - stock goes down by the extra qty;
   - `sales.total` updated, revision = 1;
   - a `document_revisions` row exists;
   - cash difference saved as an inbound payment in the current shift;
   - audit row exists.
2. **Line removed, cash refund:**
   - stock comes back;
   - an outbound cash payment row exists;
   - the shift's expected cash drops by that amount.
3. **Khata changes:**
   - khata sale edited down: customer balance decreases by the difference (`sale_edit` credit row);
   - edited up: balance increases.
4. **Customer changed** on a khata sale: the old customer's balance returns to its previous value and the new customer is debited.
5. **Price floor:** a price below wholesale is rejected without approval; nothing changed (check stock, ledger and payments are untouched).
6. **Blocked edits:** a sale with a return, and a stale `expected_revision`, are both blocked.
7. **Serial line:** changing the qty of a serial line is blocked; changing its price is allowed.
8. **Services:** lines with services never create stock movements.
9. **Reports:** the sales report for the original date shows the new total, and profit uses the new COGS.

**Purchase edit**

10. **Qty increase:**
    - stock up;
    - vendor balance up by the difference (`purchase_edit` credit row);
    - average cost recalculated correctly (assert exact paisa values);
    - revision = 1.
11. **Qty decrease below what was already sold:** blocked with the "already sold" message; nothing changed.
12. **Freight change:** landed cost spread again; average cost correct.
13. **Vendor changed:** old vendor balance back to before; new vendor credited.
14. **Blocked edits:** a purchase with a `purchase_return` is blocked.

**Product edit**

15. All fields saved; audit lists the changed fields.
16. A duplicate barcode or SKU is rejected with the other product's name.
17. A base unit change with existing stock is blocked.
18. Product → service with stock is blocked; service → product works.
19. An inactive product disappears from `search_sellable` and `scan`, but still shows in reports.
20. Changing a pack factor that old bills use is blocked.

**Migration**

21. A V10 database with data migrates to V11; old sales show revision 0.

**Permissions**

22. A Cashier can list and view sales but cannot `edit_sale` without approval. A Stock Keeper cannot `edit_purchase`. Neither can `update_product`.

All **existing** tests must keep passing (currently 125 with `--features lan-hub`).

---

## 9. How to check before saying "done"

Run these from the project root (`D:\Anti Gravity\Tools\pos`):

```bat
cargo test -p pos-core --features lan-hub
cargo build -p desktop
cd apps\desktop
npx tsc --noEmit
npm run build
```

Then test by hand in the browser test mode (`dev-agentation.bat` starts the test server on 127.0.0.1:4848 with **test data only**, plus Vite):

**Sale history**
1. Make 3 sales: cash, khata and mixed. Include one service item.
2. Open **Sale history** and search each sale by receipt no., customer name and product name.
3. Open a receipt with the keyboard only and print it with `P`. Only the receipt must print, not the screen.

**Sale edit**
4. Edit the cash sale: add 1 item and settle with cash.
   - The receipt shows "Edited rev 1".
   - The stock report shows the extra item gone.
   - Close shift: the Z-report expected cash includes the extra cash.
5. Edit the khata sale down. The customer's khata statement shows the `sale_edit` reduction.
6. Try to edit a sale that has a return. It must be blocked with the message.

**Purchase**
7. Make a purchase and edit its qty and freight. Check:
   - the vendor khata;
   - the stock;
   - the cost in the stock report.
8. Make a sale from that purchase, then try to lower the purchase qty below the sold qty. It must be blocked.

**Products**
9. Edit a product's name, barcode, prices, low-stock alert, category, brand and pack unit. Check that POS scan finds the new barcode.
10. Make a product inactive. It must disappear from POS search and still appear in reports.

**General**
11. Everything above must work without the mouse.

**Delivery rules**
- Before changing a file, copy it to `_backup_<date>_history_editing\` with the same folder structure.
- Commit to git with a clear message. Never commit `.nextpos_signing\` (check with `git log --all --oneline -- .nextpos_signing`; it must be empty).
- Final build for the owner:
  ```bat
  cd apps\desktop
  npm install
  npm run tauri build
  ```
  The installer appears in `target\release\bundle\nsis\`. The database migrates to V11 by itself on first start.

---

## 10. Decisions for the owner (ask before starting; the default is used if there is no answer)

| # | Question | Default |
|---|----------|---------|
| D1 | Who can **see** Sale history? | Everyone who can sell or return (Cashier too). Cashier edits only with Owner/Manager approval. |
| D2 | Who can **edit** purchases? | Owner and Manager only. Stock Keeper can only view. |
| D3 | Time limit for editing a sale (for example only the same day)? | No time limit. |
| D4 | Should edits be allowed after that day's shift is closed? | Yes. Money differences go into the editor's current shift. |
| D5 | Should a sale also be **cancelled/voided completely** from history? | **Not part of this work.** Do not build it unless the owner asks. |
| D6 | Should the reason box be optional? | Required. |
