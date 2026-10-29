# Next POS (کاروبار پی او ایس) — Cashier Desk Quick Reference Card

---

## ⌨️ POS Keyboard Shortcuts (کی بورڈ شارٹ کٹس)

| Key | Action (English) | عمل (اردو) | Notes |
|---|---|---|---|
| **F1** | Search Product Catalog | پروڈکٹ تلاش کریں | Search by Name, Urdu, or SKU |
| **F2** | Hold / Park Active Cart | موجودہ کارٹ ہولڈ کریں | Holds cart during customer delay |
| **F3** | Recall Parked Cart | روکا ہوا کارٹ واپس لائیں | Select from active parked carts |
| **F4** | Change Quantity | مقدار تبدیل کریں | Increments or sets custom qty |
| **F8** | Apply Line / Bill Discount | رعایت / ڈسکاؤنٹ شامل کریں | In PKR Paisa or percentage |
| **F9** | Select Customer / Khata | گاہک یا کھاتہ منتخب کریں | Search by Customer Name / Phone |
| **F11** | Open Cash Drawer (RJ11) | کیش دراز کھولیں | Sends kick solenoid pulse |
| **F12** | Complete Payment & Print | بل وصول کریں اور پرنٹ نکالیں | Opens split-tender payment modal |
| **ESC** | Clear Cart / Cancel Modal | منسوخ کریں / بند کریں | Confirmation required if items in cart |

---

## ⚖️ Supermarket & Vegetable Weighing Scales (سبزی و پھل کا اسکیل بارکوڈ)

- **Price-Embedded Barcodes (Prefix `20`)**:
  - Format: `20` + `SSSSS` (5-digit SKU) + `PPPPP` (5-digit Price in PKR) + `C` (Check digit)
  - Automatically enters calculated unit price.
- **Weight-Embedded Barcodes (Prefix `21`)**:
  - Format: `21` + `SSSSS` (5-digit SKU) + `WWWWW` (5-digit Weight in Grams) + `C` (Check digit)
  - Automatically multiplies weight in grams by catalog rate per KG.

---

## 📱 Mobile Shop IMEI & Serial Numbers (موبائل اور برقی آلات کی آئی ایم ای آئی)

- Each smartphone, tablet, or serialized appliance requires scanning the **15-digit IMEI**.
- System automatically checks that the IMEI is in stock and marks it as sold with the invoice.
- Warranty duration is automatically printed on the customer's thermal receipt.

---

## ⚡ Emergency Power Cut & Load Shedding Protocol (لوڈ شیڈنگ و بجلی کٹوتی کی ہنگامی ہدایات)

1. **Zero Data Loss Guarantee**:
   - Next POS writes transactions using SQLite WAL mode. Every committed sale is immediately durable on disk.
2. **Abrupt Power Loss**:
   - If computer loses power during an active transaction, uncommitted records are automatically rolled back safely.
   - Upon power restoration, reboot Windows and open Next POS; startup recovery completes in under **1.5 seconds**.
   - Check **Held / Parked Carts** (`F3`) if customer was waiting.
3. **Daily Z-Report & Cash Balancing**:
   - At end of shift, navigate to **Shift Balancer** or press `Close Shift`.
   - Count PKR physical notes (Rs. 5000, 1000, 500, 100, 50, 20, 10) in the note counter widget.
   - Print thermal Z-Report and submit drawer balance to manager.
