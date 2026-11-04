# Phase 14 Plan 2 Summary: Expose Printer Tauri Commands and Update api.ts

**Plan ID:** `14-02`  
**Phase:** `NEXTPOS-14-hardware-peripherals-escpos-printing`  
**Execution Status:** Completed  

## Delivered Components
1. **Tauri IPC Command Registrations in `main.rs`**:
   - `list_system_printers`: Returns string array of available system printers.
   - `print_raw_escpos`: Streams raw byte buffers to designated printer or default.
   - `kick_cash_drawer`: Sends hardware kick pulse to RJ11 cash drawer port.
   - `cut_printer_paper`: Sends hardware cut paper sequence.
   - `print_sale_receipt`: Accepts `ReceiptPayload` and `ReceiptWidth` ("58mm" | "80mm"), compiles ESC/POS bytecode, and spools silently to printer.
2. **TypeScript Typed API Layer (`api.ts`)**:
   - Added `ReceiptLineItem` and `ReceiptPayload` TypeScript interfaces.
   - Added typed methods on `api`: `listSystemPrinters`, `printRawEscpos`, `kickCashDrawer`, `cutPrinterPaper`, `printSaleReceipt`.
   - Included web fallbacks for browser testing without crashing desktop environments.
3. **Core Serde Derives**:
   - Added `Serialize, Deserialize` to `ReceiptWidth`, `ReceiptLineItem`, and `ReceiptPayload` in `crates/pos-core/src/hardware/escpos.rs`.
