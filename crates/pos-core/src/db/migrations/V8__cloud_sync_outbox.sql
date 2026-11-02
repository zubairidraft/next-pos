-- V8: Cloud Sync Outbox for Multi-Store Event Synchronization
CREATE TABLE IF NOT EXISTS sync_outbox (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_unsynced ON sync_outbox(synced_at) WHERE synced_at IS NULL;
