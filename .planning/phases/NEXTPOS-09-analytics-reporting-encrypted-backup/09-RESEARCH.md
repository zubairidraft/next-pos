# Phase 9 Research: Offline Analytics, Financial Reports & Encrypted Backup

## Objectives & Technical Specifications
Phase 9 delivers offline intelligence and disaster recovery:
1. **Offline Analytics & Financial Reporting**:
   - Daily, weekly, monthly sales aggregation by cashier, category, and payment tender.
   - Gross profit calculations: `Revenue - COGS` derived directly from moving-average inventory cost (`Paisa`).
   - Fast-moving vs. slow-moving stock analysis (velocity ranking).
   - End-of-day Z-Report reconciliation archive.
2. **Automated 30-Minute SQLite WAL Snapshots**:
   - Background thread in `pos-core` executing periodic SQLite online backup API (`sqlite3_backup_step`) or safe checkpointed snapshot.
   - Guaranteed consistency without locking the active POS checkout thread.
   - Rolling snapshot retention (keep hourly snapshots for 24h, daily snapshots for 7 days).
3. **AES-256 Encrypted Removable Backup**:
   - Single-click backup to USB flash drives or external storage.
   - AES-256-GCM encryption with key derived via Argon2id or Windows DPAPI machine secret.
   - Integrity checksum (SHA-256) embedded in backup header to detect bit-rot or media corruption.
4. **Disaster Recovery & Verified Restore Wizard**:
   - Pre-restore validation: validates SQLite header integrity, schema version compatibility, and checksum.
   - Safe backup of current active database before initiating restore.
   - Automatic database file swap and connection pool reload.
