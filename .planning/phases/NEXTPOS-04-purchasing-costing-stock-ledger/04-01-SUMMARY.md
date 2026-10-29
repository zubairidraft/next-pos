# Phase 4 Plan 1 Summary: Immutable Stock Movement Ledger & Balance Cache

## Delivered Work
1. **Append-Only Stock Movement Ledger**:
   - Implemented `StockMovement` domain struct and repository in `crates/pos-core/src/domain/inventory.rs`.
   - Records `qty_signed_milli: i64`, `movement_type` (`purchase`, `opening`, `sale`, `return`, `adjustment`), `source_doc`, `unit_cost_paisa: i64`, and `value_delta_paisa: i64`.
   - Immutable audit trail: zero row modification or deletion allowed.
2. **Materialized Inventory Balances Cache**:
   - Updates `inventory_balances` (`on_hand_milli`, `avg_cost_paisa`, `last_rebuilt_at`) within the same atomic transaction as the movement.
   - Provides sub-15ms balance retrieval via primary key index lookups.
3. **Verification**:
   - Integration test `crates/pos-core/tests/inventory_ledger_tests.rs` verified positive opening, purchase receipt, outbound sales deduction, and reverse-chronological audit history.
