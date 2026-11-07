-- V10: service items, who made each sale, purchase returns, claims.

-- Services (repair, fitting, delivery...) are sold like products but have no stock.
ALTER TABLE products ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0;

-- The user who made the sale (salesman). Older sales use the shift's user.
ALTER TABLE sales ADD COLUMN user_id TEXT REFERENCES users(id);

-- Goods sent back to a vendor: stock goes out, the vendor's balance goes down.
CREATE TABLE IF NOT EXISTS purchase_returns (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    vendor_id TEXT NOT NULL REFERENCES parties(id),
    purchase_id TEXT REFERENCES purchases(id),
    reason TEXT,
    total_paisa INTEGER NOT NULL,
    user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id TEXT PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    qty_milli INTEGER NOT NULL,
    unit_cost_paisa INTEGER NOT NULL,
    total_paisa INTEGER NOT NULL
);

-- Claims: a customer's item under warranty, or damaged / expired stock,
-- sent to the company or vendor for repair, replacement or credit.
CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('warranty', 'damaged', 'expired')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'sent', 'replaced', 'credited', 'rejected', 'closed')),
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    qty_milli INTEGER NOT NULL,
    customer_id TEXT REFERENCES parties(id),
    vendor_id TEXT REFERENCES parties(id),
    serial TEXT,
    sale_doc TEXT,
    notes TEXT,
    value_paisa INTEGER NOT NULL DEFAULT 0,
    credit_paisa INTEGER NOT NULL DEFAULT 0,
    user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_created ON purchase_returns(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_time ON stock_movements(variant_id, occurred_at);

INSERT OR IGNORE INTO document_sequences (doc_type, prefix, next_no) VALUES
('purchase_return', 'PRT-', 1),
('claim', 'CLM-', 1);
