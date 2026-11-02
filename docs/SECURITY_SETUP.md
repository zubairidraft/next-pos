# Security setup (Round 2)

## 1. Building on Windows (one-time)

The database now uses **SQLCipher** (AES-256). Its OpenSSL is compiled from source on the
first build, which needs **Strawberry Perl** on Windows:

1. Install Strawberry Perl from https://strawberryperl.com (64-bit MSI).
2. Open a **new** terminal and check: `perl -v` should say "Strawberry Perl".
   (Git for Windows also ships a `perl`; it does NOT work for this build. Strawberry must come
   first in `PATH`.)
3. `cargo test -p pos-core` — the first build takes several minutes; later builds are cached.

If the app ever starts without SQLCipher linked, `open_encrypted_db` refuses to open the
database instead of silently running unencrypted.

## 2. Database key and owner recovery phrase

* `DbKeyManager::load_or_create_key(path)` creates a random 256-bit key on first run and
  stores it **protected with Windows DPAPI** (machine scope). Copying the key file to another
  PC does not work.
* When it returns `created = true`, the first-run wizard must show
  `DbKeyManager::format_recovery_phrase(&key)` **once** and ask the owner to write it down.
  It is the only way to open the shop database on a new PC (`parse_recovery_phrase` +
  `store_key`). Never save it anywhere on the PC.
* Key files from the old version (plain text) are upgraded to DPAPI automatically.

## 3. Licenses

* Only the **dealer** has the private signing key, `license_signing.key`.
  The app contains only the public key (`LicenseManager::PUBLIC_KEY`).
* Keep `license_signing.key` off the shop PCs and out of git (`*.key` is git-ignored), and keep
  an offline backup (USB in a safe). Anyone with this file can issue licenses. If it is lost,
  run `pos-license --keygen --out new.key`, paste the printed public key into `license.rs`,
  rebuild, and re-issue every license.

```
pos-license --fingerprint                         # on the shop PC
pos-license --generate --key license_signing.key --store "Madina Store" --machine KPOS-XXXX-XXXX-XXXX-XXXX --days 365
pos-license --verify NPL1....
```

* A license still works if the shop changes **either** the Windows install **or** the disk
  (one half of the machine ID), but not both.
* After expiry there is a 7-day grace period, then `can_post_sales()` is false. Reports,
  khata and backups stay available.
* Trial: 14 days from first run, stored inside the encrypted DB. Moving the PC clock back more
  than 24 hours gives `ClockTampered`. Trial receipts must show a watermark
  (`requires_receipt_watermark()`).

## 4. Backups (`.kpos`)

* `CryptoBackupService::export_backup(&conn, path, password)` — consistent copy taken from the
  live connection (includes data still in the WAL file), encrypted with a key derived from the
  owner's backup password (Argon2id, 64 MiB). Minimum 8 characters.
* `verify_backup(path, password)` — "Verify" button: checks the file without restoring.
* `restore_backup(path, db_path, password, shop_key)` — **close every DB connection first**.
  The backup is decrypted, checked and re-encrypted into a new file; only then is the current
  database moved aside (`*.pre_restore_<time>`) and replaced. It works on a new PC because the
  data is re-encrypted with that PC's key.
* Old `KPOS_BACKUP_V1` files are not supported (that format was not secure).
* Snapshots (`SnapshotManager::create_snapshot`) are encrypted with the shop key. Call
  `apply_retention(dir, 48, 30)` after each snapshot (last 48 + one per day for 30 days).

## 5. Users and login

* `UserRepo::needs_first_owner` → first-run wizard creates the Owner.
* `login_password` / `login_pin` (quick switch: pick user, then PIN). Five wrong attempts lock
  the account for 5 minutes. Every success, failure and lock is written to `audit_log`.
* `require_permission(session, perm)` must be called by every Tauri command (Round 3).
