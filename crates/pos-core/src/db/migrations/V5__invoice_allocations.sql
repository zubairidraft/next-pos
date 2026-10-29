-- Invoice payment allocations (FIFO tracking)
CREATE TABLE IF NOT EXISTS invoice_allocations (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
    purchase_id TEXT REFERENCES purchases(id) ON DELETE CASCADE,
    allocated_paisa INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocations_payment ON invoice_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_sale ON invoice_allocations(sale_id);
CREATE INDEX IF NOT EXISTS idx_allocations_purchase ON invoice_allocations(purchase_id);
