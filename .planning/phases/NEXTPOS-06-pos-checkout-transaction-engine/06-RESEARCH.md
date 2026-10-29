# Phase 6 Research: POS Checkout & Transaction Engine

## Objectives & Technical Specifications
Phase 6 builds the mission-critical retail checkout pipeline:
1. **High-Speed Scanner & Keyboard-First Checkout**:
   - Sub-100ms scan-to-cart insertion.
   - Dedicated physical shortcut keys: `F1` (Help/Keys), `F2` (Hold Cart), `F3` (Recall Cart), `F4` (Customer Search), `F8` (Quick Cash/Tender), `F9` (Card/Digital), `F12` (Complete Sale).
2. **Parked Carts Resilience**:
   - Up to 10 persistent carts held in local SQLite table `parked_carts`.
   - Survives sudden power cuts; instantly recoverable on restart.
3. **Atomic `BEGIN IMMEDIATE` Sale Posting**:
   - Single atomic SQLite transaction executing:
     - Sale invoice creation (`sales` header & `sale_lines`).
     - Outbound `stock_movements` with strict negative stock check.
     - Cash session / tender ledger recording.
     - Customer balance adjustment (for credit Khata sales).
     - Document sequence `INV-` increment.
4. **Split-Tender Payment Methods**:
   - Cash, Debit/Credit Card, JazzCash, EasyPaisa, Raast bank transfer, and Customer Credit.
   - Change calculation in exact integer `Paisa`.
