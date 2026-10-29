# Plan 07-03 Summary: Sale Returns & Refund Posting Engine

## Accomplishments
- Implemented `crates/pos-core/src/domain/refund.rs`:
  - `ReturnRepo::post_return`: Atomic return posting enforcing that returned item quantities cannot exceed originally purchased minus already returned items.
  - Generates sequential document numbers (`RET-XXXX`) from `document_sequences`.
  - Conditional restock: If `restock_type == "sellable"`, automatically appends positive inbound `stock_movements` with `movement_type = "return"` and restores `inventory_balances` cached on-hand quantities. If `damaged`, writes off without replenishing available inventory.
  - Refund settlements: Issues cash refunds via outbound payment records or credits the customer's Khata account in `party_ledger`.
- Added test suite in `crates/pos-core/tests/return_posting_tests.rs`:
  - `test_sale_return_restores_stock_and_prevents_excess_returns`: Verifies successful return, stock restoration to 7 units, outbound cash payment, and blocks excess return attempts.
- All tests passing cleanly (total 39 tests passing across `pos-core`).
