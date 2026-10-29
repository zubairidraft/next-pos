# Phase 12 Research: Pilot Hardening, Hardware Certification & Production GA Launch

## Objectives & Technical Specifications
Phase 12 is the final commercialization and deployment milestone of Next POS (کاروبار پی او ایس):
1. **Pilot Shop Feedback Refinements**:
   - Ergonomic tweaks discovered during pilot deployments in Karachi, Lahore, and Rawalpindi retail stores:
     - High-contrast visual theme for glare-heavy counter environments.
     - Enlarge touch target sizes for touch-all-in-one POS monitors (minimum 48x48px).
     - Configurable thermal receipt print density (contrast 1-5) and feed spacing.
     - Rapid barcode multi-scan buffer (prevents dropped scans during fast cashier processing).
2. **Pakistani Hardware Certification Matrix**:
   - Certified support for market-standard ESC/POS 58mm/80mm thermal printers:
     - Xprinter (XP-Q200, XP-N160II, XP-80C)
     - Rongta (RP80, RP326)
     - Black Copper (BC-85AC, BC-95AC)
     - Epson (TM-T20II, TM-T88IV/V)
     - Sunmi desktop & cloud terminals
   - Certified 1D/2D USB HID barcode and QR scanners:
     - Honeywell Voyager, Datalogic QuickScan, Netum, Zebex, generic Chinese laser scanners.
3. **Reseller & Dealer Licensing CLI Tool**:
   - Offline Ed25519 license generator for authorized regional dealers and distributors.
   - Takes hardware fingerprint + merchant name + expiration date -> outputs signed `.lic` file.
4. **Production Windows NSIS Installer**:
   - Tauri 2 NSIS single-executable installer with zero external runtime requirements.
   - Auto-detects or installs Evergreen WebView2 if missing.
   - Desktop icon, Start Menu shortcuts, and uninstaller.
   - Offline-first operation: 100% self-contained binary bundle with embedded fonts and assets.
