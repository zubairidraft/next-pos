# Phase 4 Plan 3 Summary: Negative Stock Policy Enforcement & Vendor Directory

## Delivered Work
1. **Strict Negative Stock Enforcement (`Block`)**:
   - Added `PosError::NegativeStockBlocked { variant_id, requested_milli, available_milli }`.
   - Inspects `stock_policy` in `business_settings`.
   - When set to `Block`, any outbound inventory deduction exceeding on-hand balance is immediately rejected before transaction commit, preventing inventory debt.
2. **Vendor Directory**:
   - Implemented `PartyRepo` in `crates/pos-core/src/domain/party.rs`.
   - Manages vendors with English name, Urdu Nastaliq name, phone number, NTN, credit limits, and opening balances.
3. **Verification**:
   - Automated tests in `crates/pos-core/tests/negative_stock_tests.rs` verified that attempting to deduct more stock than available triggers `NegativeStockBlocked`, while permitted deductions proceed smoothly.
