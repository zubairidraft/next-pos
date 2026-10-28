# Phase 1: Foundation, Data Engine & Architecture - Research

**Date:** 2026-10-28  
**Phase:** 1 of 12  
**Requirements:** ARCH-01, DB-01, NUM-01  

---

## 1. Executive Summary & Architecture Overview

Phase 1 establishes the bedrock of **Next POS**, an offline-first Windows desktop POS system. Because the application must run smoothly on low-spec hardware (Windows 10, Core i3 4th-gen, 4 GB RAM) and endure frequent power outages (load shedding), the core architecture decouples business logic, storage, and presentation:
- **Rust Core (`crates/pos-core`)**: A pure Rust library housing all domain models, money arithmetic, posting rules, and database schema migrations. Possesses zero UI or Tauri OS dependencies, ensuring fast headless unit and property testing.
- **Encrypted Local Storage (SQLCipher + rusqlite)**: Encrypted at rest using 256-bit AES. Runs in WAL mode with synchronous NORMAL/FULL to guarantee ACID atomicity during power cuts. Migration management is controlled via `refinery`.
- **Integer Arithmetic Engine (`src/money.rs`)**: Float arithmetic (`f64`/`f32`) is strictly forbidden. Monetary amounts are stored as integer `Paisa(i64)` (1 PKR = 100 Paisa). Inventory quantities are stored as integer milli-units `Qty(i64)` (1.000 kg = 1000 milli-units). Tax rates are defined in basis points (18% = 1800 bp).
- **Desktop Shell (`apps/desktop`)**: Tauri 2 with a React 18+ / TypeScript / Vite UI. Employs `specta` or `ts-rs` to export type definitions from Rust to TypeScript, eliminating IPC payload drift.

---

## 2. Key Technical Decisions & Dependencies

### 2.1 Workspace Structure
```
pos/
├── Cargo.toml                  # Workspace root
├── crates/
│   └── pos-core/              # Pure business & data crate
│       ├── Cargo.toml
│       ├── src/
│       │   ├── lib.rs
│       │   ├── money.rs       # Paisa, Qty, rounding, basis point tax
│       │   ├── domain/        # Entities (products, units, settings)
│       │   ├── db/            # rusqlite connection, cipher init, migrations
│       │   │   ├── mod.rs
│       │   │   ├── migrations/
│       │   │   └── repo/
│       │   └── error.rs
│       └── tests/             # Unit, proptest & integration suites
├── apps/
│   └── desktop/               # Tauri 2 app
│       ├── package.json
│       ├── vite.config.ts
│       ├── src/               # React UI
│       └── src-tauri/         # Tauri 2 backend linking pos-core
└── .planning/
```

### 2.2 SQLCipher Integration on Windows
- **Crate**: `rusqlite` with `bundled-sqlcipher` feature or linked SQLCipher amalgamation.
- **Key Derivation & Protection**: Windows Data Protection API (DPAPI via `windows` crate / `dpapi`) creates and protects a 256-bit random database encryption master key stored in local AppData. An ASCII-armored owner recovery code is generated at initial database creation for emergency disaster recovery.
- **Pragmas**:
  - `PRAGMA key = '...';` (must be executed immediately after opening connection before any other statement)
  - `PRAGMA journal_mode = WAL;` (critical for concurrency and power failure resilience)
  - `PRAGMA synchronous = NORMAL;` (optimal balance of speed and safety in WAL mode)
  - `PRAGMA foreign_keys = ON;` (mandatory for relational integrity)

### 2.3 Integer Precision Arithmetic (`src/money.rs`)
- `Paisa(i64)`: Supports values up to $\approx \pm 9.2 \times 10^{16}$ Paisa (920 trillion PKR), precluding integer overflow.
- `Qty(i64)`: 3 decimal places (1 unit = 1,000 milli-units; 1.250 kg = 1,250).
- Rounding: Standard Bankers' rounding or Half-Up to the nearest Paisa, centralized exclusively in `src/money.rs`.
- Rates: Basis points (`RateBp(i32)` where 1800 = 18.00%).

---

## 3. Plan Decomposition (Wave Breakdown)

To maintain disciplined vertical delivery, Phase 1 is decomposed into four sequential execution plans:

1. **Plan 01-01 (Wave 1)**: Cargo workspace setup, `crates/pos-core` library crate skeleton, `apps/desktop` Tauri 2 + React + Vite skeleton, and build validation.
2. **Plan 01-02 (Wave 2)**: Precise arithmetic engine in `pos-core/src/money.rs` with `Paisa(i64)`, `Qty(i64)`, basis point tax, and comprehensive `proptest` suites.
3. **Plan 01-03 (Wave 3)**: SQLCipher integration with rusqlite, Windows DPAPI key generation, WAL configuration, and refinery database migration harness for baseline schema.
4. **Plan 01-04 (Wave 4)**: Tauri 2 typed IPC commands connecting desktop UI to `pos-core`, status probe, and walking skeleton verification.
