# Phase 5 Research: Stock Audits, Discrepancies & Label Designer

## Objectives & Technical Specifications
Phase 5 equips retailers with audit rigor and physical inventory management:
1. **Cache Rebuild Engine (Zero Ledger Drift Guarantee)**:
   - Recalculates `inventory_balances` strictly from raw `stock_movements`.
   - Wipes and reconstructs in memory, verifies identical matching on 100,000+ movement records.
2. **Physical Stock Audits & Discrepancies**:
   - Stock count sessions: expected system stock vs physical count scanned on floor.
   - Variance analysis ($Variance = Counted - Expected$) with manager approval gate.
   - Automatic posting of audit adjustments into `stock_movements`.
3. **Thermal Barcode Label Generator**:
   - TSPL / ESC/POS commands for standard retail adhesive labels (38x25mm and 50x30mm).
   - Generates Code128 barcodes, bilingual English and Nastaliq Urdu item names, and retail price in PKR.
