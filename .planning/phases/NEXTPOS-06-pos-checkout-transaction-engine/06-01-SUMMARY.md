# Plan 06-01 Summary: Cart State Machine & Persistent Parked Carts

## Accomplishments
- Implemented `crates/pos-core/src/domain/cart.rs` providing:
  - `Cart` state machine with `CartLine` representing line item details (variant, quantity in milli-units, unit price in Paisa, discount, and tax).
  - Accurate financial calculations with integer precision (`subtotal_paisa`, `discount_paisa`, `tax_paisa`, `grand_total_paisa`).
  - `CartRepo` with crash-proof persistence in SQLite `parked_carts` table (`V4__parked_carts.sql`).
  - Cart parking (`park_cart`), retrieval (`list_parked_carts`), and restoration (`recall_cart`, `delete_parked_cart`).
- Added comprehensive unit tests in `crates/pos-core/tests/cart_tests.rs`:
  - `test_cart_calculations`: Verifies subtotal, discount, tax, and grand total calculations.
  - `test_park_and_recall_cart_persistence`: Verifies SQLite roundtrip of held carts and line restoration across processes.
- All tests passing cleanly.
