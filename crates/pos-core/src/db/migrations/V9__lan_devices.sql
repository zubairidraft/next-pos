-- V9: Android phones paired with this shop PC over the shop WiFi.
CREATE TABLE IF NOT EXISTS lan_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    paired_by TEXT,
    paired_at TEXT NOT NULL,
    last_seen_at TEXT,
    last_ip TEXT,
    revoked_at TEXT
);
