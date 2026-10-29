-- Persistent Parked Carts for POS Checkout Resilience
CREATE TABLE IF NOT EXISTS parked_carts (
    id TEXT PRIMARY KEY,
    cart_name TEXT NOT NULL,
    customer_id TEXT REFERENCES parties(id),
    payload_json TEXT NOT NULL,
    total_paisa INTEGER NOT NULL,
    item_count INTEGER NOT NULL,
    parked_at TEXT NOT NULL
);
