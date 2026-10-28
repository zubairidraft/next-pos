-- Next POS Baseline Database Schema (V1)
-- All primary keys use ULID (26 uppercase ASCII characters)
-- Monetary values stored in integer Paisa (1 PKR = 100 Paisa)
-- Quantities stored in integer milli-units (1.000 = 1000)

-- Core master settings
CREATE TABLE IF NOT EXISTS business_settings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ur TEXT,
    address TEXT,
    phone TEXT,
    ntn TEXT,
    strn TEXT,
    currency TEXT NOT NULL DEFAULT 'PKR',
    time_zone TEXT NOT NULL DEFAULT 'Asia/Karachi',
    tax_mode TEXT NOT NULL DEFAULT 'inclusive',
    negative_stock_policy TEXT NOT NULL DEFAULT 'Block',
    enabled_packs TEXT NOT NULL DEFAULT '["grocery", "electronics"]',
    fbr_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Users & permissions
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Master data categories, brands, units
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ur TEXT,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ur TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    decimals_allowed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_rates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rate_bp INTEGER NOT NULL, -- basis points (1800 = 18.00%)
    inclusive INTEGER NOT NULL DEFAULT 1,
    fbr_code TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_lists (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

-- Parties (Customers, Vendors)
CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    party_type TEXT NOT NULL CHECK(party_type IN ('customer', 'vendor', 'both')),
    name TEXT NOT NULL,
    name_ur TEXT,
    phone TEXT,
    cnic TEXT,
    ntn TEXT,
    credit_limit_paisa INTEGER NOT NULL DEFAULT 0,
    opening_balance_paisa INTEGER NOT NULL DEFAULT 0,
    price_list_id TEXT REFERENCES price_lists(id),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Products & Variants
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_ur TEXT,
    category_id TEXT REFERENCES categories(id),
    brand_id TEXT REFERENCES brands(id),
    base_unit_id TEXT NOT NULL REFERENCES units(id),
    hs_code TEXT,
    tax_rate_id TEXT REFERENCES tax_rates(id),
    track_mode TEXT NOT NULL DEFAULT 'none' CHECK(track_mode IN ('none', 'batch', 'serial')),
    has_variants INTEGER NOT NULL DEFAULT 0,
    reorder_level_milli INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attributes_json TEXT NOT NULL DEFAULT '{}',
    sku TEXT UNIQUE NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS variant_units (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    unit_id TEXT NOT NULL REFERENCES units(id),
    factor_to_base INTEGER NOT NULL DEFAULT 1000, -- in milli-units (e.g. carton of 24 = 24000)
    barcode TEXT,
    is_sale_unit INTEGER NOT NULL DEFAULT 1,
    is_purchase_unit INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS barcodes (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    value TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manufacturer' CHECK(kind IN ('manufacturer', 'in-store', 'scale-prefix')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
    id TEXT PRIMARY KEY,
    price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    unit_id TEXT NOT NULL REFERENCES units(id),
    price_paisa INTEGER NOT NULL,
    valid_from TEXT NOT NULL,
    UNIQUE(price_list_id, variant_id, unit_id)
);

-- Cashier Shifts & Cash Sessions
CREATE TABLE IF NOT EXISTS cash_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    opening_float_paisa INTEGER NOT NULL DEFAULT 0,
    expected_cash_paisa INTEGER NOT NULL DEFAULT 0,
    counted_cash_paisa INTEGER,
    variance_paisa INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    opened_at TEXT NOT NULL,
    closed_at TEXT
);

-- Sales & Returns
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('held', 'posted', 'voided')),
    party_id TEXT REFERENCES parties(id),
    cash_session_id TEXT REFERENCES cash_sessions(id),
    subtotal_paisa INTEGER NOT NULL,
    discount_paisa INTEGER NOT NULL DEFAULT 0,
    tax_paisa INTEGER NOT NULL DEFAULT 0,
    total_paisa INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_lines (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    qty_milli INTEGER NOT NULL,
    unit_price_paisa INTEGER NOT NULL,
    discount_paisa INTEGER NOT NULL DEFAULT 0,
    tax_paisa INTEGER NOT NULL DEFAULT 0,
    total_paisa INTEGER NOT NULL,
    unit_cost_snapshot_paisa INTEGER NOT NULL,
    cogs_paisa INTEGER NOT NULL,
    batch_id TEXT,
    serial_id TEXT
);

CREATE TABLE IF NOT EXISTS sale_returns (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    original_sale_id TEXT REFERENCES sales(id),
    refund_paisa INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_return_lines (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    original_sale_line_id TEXT REFERENCES sale_lines(id),
    qty_milli INTEGER NOT NULL,
    refund_paisa INTEGER NOT NULL,
    restock_type TEXT NOT NULL DEFAULT 'sellable' CHECK(restock_type IN ('sellable', 'damaged'))
);

-- Purchases & Stock
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES parties(id),
    vendor_invoice_no TEXT,
    status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('draft', 'received', 'voided')),
    freight_paisa INTEGER NOT NULL DEFAULT 0,
    total_paisa INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_lines (
    id TEXT PRIMARY KEY,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    received_qty_milli INTEGER NOT NULL,
    unit_cost_paisa INTEGER NOT NULL,
    total_paisa INTEGER NOT NULL
);

-- Stock movement ledger & Cached balances
CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    qty_signed_milli INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    source_doc TEXT NOT NULL,
    source_line TEXT,
    unit_cost_paisa INTEGER NOT NULL,
    value_delta_paisa INTEGER NOT NULL,
    batch_id TEXT,
    serial_id TEXT,
    occurred_at TEXT NOT NULL,
    user_id TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
    variant_id TEXT PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    on_hand_milli INTEGER NOT NULL DEFAULT 0,
    avg_cost_paisa INTEGER NOT NULL DEFAULT 0,
    last_rebuilt_at TEXT NOT NULL
);

-- Khata / Ledgers
CREATE TABLE IF NOT EXISTS party_ledger (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,
    debit_paisa INTEGER NOT NULL DEFAULT 0,
    credit_paisa INTEGER NOT NULL DEFAULT 0,
    balance_paisa INTEGER NOT NULL DEFAULT 0,
    source_doc TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    party_id TEXT REFERENCES parties(id),
    direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
    method TEXT NOT NULL CHECK(method IN ('cash', 'card', 'jazzcash', 'easypaisa', 'raast', 'bank', 'cheque')),
    amount_paisa INTEGER NOT NULL,
    reference TEXT,
    cash_session_id TEXT REFERENCES cash_sessions(id),
    occurred_at TEXT NOT NULL
);

-- Supporting system tables
CREATE TABLE IF NOT EXISTS document_sequences (
    doc_type TEXT PRIMARY KEY,
    prefix TEXT NOT NULL,
    next_no INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    reason TEXT,
    details_json TEXT,
    occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_history (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('local', 'usb', 'cloud')),
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Initial Document Sequences Seed
INSERT OR IGNORE INTO document_sequences (doc_type, prefix, next_no) VALUES 
('sale', 'INV-', 1),
('return', 'RET-', 1),
('purchase', 'PUR-', 1),
('payment', 'PAY-', 1);
