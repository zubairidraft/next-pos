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
