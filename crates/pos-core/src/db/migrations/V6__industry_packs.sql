-- V6: Industry Packs (Electronics IMEI Tracking & Apparel Matrix)

CREATE TABLE IF NOT EXISTS product_serials (
    id TEXT PRIMARY KEY NOT NULL,
    variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    imei_or_serial TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('in_stock', 'sold', 'returned', 'defective')),
    purchase_doc TEXT,
    sale_doc TEXT,
    warranty_months INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_serials_unique_active 
ON product_serials(variant_id, imei_or_serial) 
WHERE status = 'in_stock';

CREATE INDEX IF NOT EXISTS idx_serials_lookup 
ON product_serials(imei_or_serial);

CREATE TABLE IF NOT EXISTS apparel_matrices (
    id TEXT PRIMARY KEY NOT NULL,
    style_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_ur TEXT,
    created_at TEXT NOT NULL
);

-- Performance & Resilience Indexes
CREATE INDEX IF NOT EXISTS idx_party_ledger_party_time 
ON party_ledger(party_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sales_status_created 
ON sales(status, created_at);

