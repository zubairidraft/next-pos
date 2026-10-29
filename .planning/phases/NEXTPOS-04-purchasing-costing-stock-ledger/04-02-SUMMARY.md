# Phase 4 Plan 2 Summary: Purchase Invoices, Landed Cost & Weighted-Average Costing

## Delivered Work
1. **Purchase Invoice Domain & Sequential Document Numbering**:
   - Implemented `PurchaseRepo` in `crates/pos-core/src/domain/purchase.rs`.
   - Generates sequential document numbers from `document_sequences` (`PUR-000001`, `PUR-000002`).
   - Links vendor invoices and multi-line item entries.
2. **Landed Cost Allocation**:
   - Proportional distribution algorithm divides freight & clearance charges across purchase lines based on goods value.
   - Remainder adjustment preserves exact zero-paisa discrepancy on the invoice total.
3. **Moving-Weighted-Average Cost (WAC) Engine**:
   - Pure integer arithmetic recalculates average unit cost:
     $$NewAvgCost = \frac{(CurrentQty \times CurrentCost) + (InboundQty \times LandedCost)}{CurrentQty + InboundQty}$$
   - Automatically posts vendor credit into `party_ledger` to maintain accounts payable equilibrium.
4. **Verification**:
   - Integration tests in `crates/pos-core/tests/purchase_costing_tests.rs` verified proportional freight allocation, moving average calculation, stock movement generation, and vendor Khata ledger credit.
