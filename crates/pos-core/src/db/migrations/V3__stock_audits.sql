-- Stock Count Sessions and Audits
CREATE TABLE IF NOT EXISTS stock_count_sessions (
    id TEXT PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed', 'cancelled')),
    notes TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    approved_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    expected_qty_milli INTEGER NOT NULL,
    counted_qty_milli INTEGER NOT NULL,
    variance_qty_milli INTEGER NOT NULL,
    unit_cost_paisa INTEGER NOT NULL,
    variance_value_paisa INTEGER NOT NULL,
    notes TEXT
);

INSERT OR IGNORE INTO document_sequences (doc_type, prefix, next_no) VALUES 
('count', 'CNT-', 1),
('adjustment', 'ADJ-', 1);
