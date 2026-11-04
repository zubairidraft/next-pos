# Phase 17 Plan 1 Summary: Encrypted Backups & Offline Licensing

**Plan ID:** `17-01`  
**Phase:** `NEXTPOS-17-encrypted-backups-offline-licensing`  
**Execution Status:** Completed  

## Delivered Components
1. **Live Snapshots & Encrypted Backups**:
   - `create_live_snapshot`: Runs non-blocking `VACUUM INTO` live snapshots.
   - `list_database_snapshots`: Enumerates existing `.kdb` replicas.
   - `export_backup`: Generates AES encrypted standalone `.kpos` packages protected by Argon2id password hashing.
   - `restore_backup`: Verifies SHA-256 and HMAC-SHA512 checksums before restoring, retaining `.pre_restore_safety` copies.
2. **Machine Fingerprinting & Ed25519 Offline Licensing**:
   - `LicenseView.tsx` reads machine hardware fingerprint (`KPOS-XXXX-XXXX-XXXX-XXXX`) from Windows registry and system disk serial.
   - Evaluates offline trial status, perpetual license activation, and allows activating signed offline license tokens.
