# Next POS (کاروبار پی او ایس) — Hardware Certification Matrix

---

## 🖨️ Certified Thermal Receipt Printers (58mm / 80mm ESC/POS)

| Manufacturer | Certified Models | Roll Width | Interface | Pulse Command | Urdu Raster Tested |
|---|---|---|---|---|---|
| **Epson** | TM-T20II, TM-T82III, TM-T88IV/V | 80mm | USB, Serial, Ethernet | `ESC p 0 25 250` | ✅ Verified |
| **Xprinter** | XP-Q200, XP-N160II, XP-80C, XP-58II | 58mm & 80mm | USB, Serial | `ESC p 0 50 200` | ✅ Verified |
| **Rongta** | RP80, RP326, RP328 | 80mm | USB, LAN | `ESC p 0 40 200` | ✅ Verified |
| **Black Copper**| BC-85AC, BC-95AC, BC-P58C | 58mm & 80mm | USB | `ESC p 0 25 250` | ✅ Verified |
| **Sunmi** | D2 Desktop, T2, V2 Pro | 58mm & 80mm | Built-in ESC/POS | Native ESC/POS | ✅ Verified |

---

## 🏷️ Certified Thermal Barcode Label Printers (TSPL / ZPL)

| Manufacturer | Certified Models | Media Width | Resolution | Language |
|---|---|---|---|---|
| **Xprinter** | XP-365B, XP-370B, XP-420B | 20mm - 80mm | 203 DPI | TSPL |
| **Zebra** | ZD220, ZD230, GC420t | 25mm - 104mm | 203 DPI | ZPL / EPL |
| **Gprinter** | GP-1324D, GP-3120TU | 20mm - 80mm | 203 DPI | TSPL |

---

## 📷 Certified 1D / 2D Barcode & QR Scanners (USB HID)

| Brand | Models | Form Factor | Normalization |
|---|---|---|---|
| **Honeywell** | Voyager 1250g, 1400g, Orbit 7120 | Handheld & Omnidirectional | Strips CR/LF (`\r\n`) |
| **Datalogic** | QuickScan Lite QW2100, QD2400 | Handheld 1D/2D | Automatic Tab/Enter normalization |
| **Netum** | NT-1228BL, NT-2012, C750 | Wireless & USB | Standard keyboard wedge |
| **Generic** | Standard Chinese USB Barcode Scanners | Laser & CCD | Zero delay < 10ms |

---

## ⚖️ Electronic Weighing Counter Scales

| Manufacturer | Scale Barcode Protocol | Sample Prefix | Supported Function |
|---|---|---|---|
| **CAS / Avery** | EAN-13 Price Embedded | `20` | Auto unit price resolution |
| **Mettler Toledo** | EAN-13 Weight Embedded | `21` | Auto gram-to-KG multiplication |
| **Dibal** | EAN-13 Scale Barcode | `20` / `21` | Tare deduction calculated |
