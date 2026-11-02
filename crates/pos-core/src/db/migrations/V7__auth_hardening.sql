-- V7: login lockout tracking and the four built-in roles.
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

INSERT OR IGNORE INTO roles (id, name, created_at) VALUES
('owner', 'owner', datetime('now')),
('manager', 'manager', datetime('now')),
('cashier', 'cashier', datetime('now')),
('stock_keeper', 'stock_keeper', datetime('now'));

CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(occurred_at);
