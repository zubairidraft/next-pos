# Phase 4 Research: Purchasing, Costing & Stock Ledger

## Objectives & Technical Specifications
Phase 4 implements the inventory heart of Next POS:
1. **Immutable Stock Movement Ledger**:
   - `stock_movements` is append-only. No UPDATE or DELETE permitted.
   - Movements record `qty_milli: i64` (positive for intake, negative for deduction) and `unit_cost_paisa: i64`.
   - Every movement links to a verified document (`purchase`, `opening`, `sale`, `adjustment`).
2. **Weighted-Average Cost (WAC) Engine**:
   - Recalculation on every inbound purchase invoice:
     $$NewAvgCost = \frac{(CurrentQty \times CurrentCost) + (InboundQty \times LandedCost)}{CurrentQty + InboundQty}$$
   - Landed freight & expenses allocated across lines proportionally based on value.
   - All arithmetic uses integer precision (`Paisa` and `Qty`).
3. **Negative Stock Policy Enforcement**:
   - Setting `stock_policy` checked before deducting stock.
   - When set to `Block`, deductions exceeding on-hand stock reject with `PosError::NegativeStockBlocked`.
4. **Fast Materialized Balance Cache**:
   - `inventory_balances` table updated in the same atomic transaction as `stock_movements`.
   - Guaranteed consistency with zero floating point drift.
