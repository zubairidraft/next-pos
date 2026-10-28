---
phase: NEXTPOS-01-foundation-data-engine-architecture
plan: 02
subsystem: money
tags: [rust, money, paisa, qty, rounding, proptest]

requires:
  - phase: 01-01
    provides: Cargo workspace and pos-core crate
provides:
  - Integer Paisa(i64) currency type
  - Integer Qty(i64) milli-unit quantity type
  - Basis point RateBp(i32) tax rate type
  - Half-up rounding line total and tax calculation engine
affects: [purchasing, sales, khata, reports]

actuals:
  tokens: 1800
  tasks: 2
  commits: 1

tech-stack:
  added: [proptest]
  patterns: [Strict integer precision arithmetic without any floating point types]

key-files:
  created:
    - crates/pos-core/src/money.rs
    - crates/pos-core/tests/money_tests.rs

key-decisions:
  - "Banned f32 and f64 everywhere in business logic to prevent floating point drift and currency discrepancies"
  - "Standardized on half-up rounding using i128 intermediates for tax and line total computations"

patterns-established:
  - "Monetary calculation pattern: all prices stored as integer Paisa, quantities as milli-units (3 decimals)"

requirements-completed: [NUM-01]

coverage:
  - id: D1
    description: "Integer Paisa and Qty calculations pass property and unit tests with zero float usage"
    requirement: "NUM-01"
    verification:
      - kind: unit
        ref: "crates/pos-core/tests/money_tests.rs"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-28
---

# Plan 01-02 Summary: Precision Integer Money & Quantity Engine

Plan 01-02 implemented the core precision arithmetic engine for Next POS.

## Accomplishments
- Implemented `Paisa(i64)` with saturating addition, subtraction, negation, and PKR formatting (`PKR 125.50`).
- Implemented `Qty(i64)` in milli-units (1.000 = 1000) allowing exact decimal measurements up to 3 decimal places without floats.
- Implemented `RateBp(i32)` for tax and discounts in basis points (18% = 1800 bp).
- Implemented `calc_line_total`, `calc_tax_exclusive`, and `calc_tax_inclusive` using half-up rounding.
- Added comprehensive unit tests and `proptest` test suites proving associativity, non-negativity, and exact tax reconciliation (`net + tax == gross`).
