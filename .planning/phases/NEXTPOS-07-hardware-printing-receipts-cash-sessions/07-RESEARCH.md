# Phase 7 Research: Hardware Printing, Receipts & Cash Sessions

## Objectives & Technical Specifications
Phase 7 delivers physical retail hardware integration:
1. **ESC/POS Thermal Printing with 1-Bit Urdu Raster**:
   - 58mm (384 dots width) and 80mm (576 dots width) thermal paper support.
   - Standard ESC/POS commands: initialize (`ESC @`), cut (`GS V 66 0`), align (`ESC a`).
   - Native Urdu rendering: Since thermal printers lack Nastaliq ROM glyphs, Urdu receipt headers and item lines are rendered to 1-bit monochrome bitmaps in Rust and transmitted via `GS v 0` raster bitmap commands.
2. **Cash Drawer Pulse Control**:
   - Sends solenoid kick pulse `ESC p 0 25 250` via printer RJ11 port automatically when tendering cash or clicking "Open Drawer".
3. **Cashier Shifts & Z-Reports**:
   - `cash_sessions`: Opening float, expected cash from sales, manual cash in/out, counted cash at close, and variance calculation.
   - Generates complete Shift Summary / Z-Report receipt printed directly at shift termination.
4. **Sales Returns Workflow**:
   - Reference original sale invoice, select return lines, restore stock via `return` movement, and record tender refund.
