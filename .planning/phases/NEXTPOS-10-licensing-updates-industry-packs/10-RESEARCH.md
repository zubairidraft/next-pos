# Phase 10 Research: Offline Licensing, Hardware Fingerprint & Industry Packs

## Objectives & Technical Specifications
Phase 10 delivers air-gapped commercial licensing and specialized vertical retail capabilities:
1. **Air-Gapped Ed25519 Licensing**:
   - Cryptographic verification using public key compiled directly into binary.
   - License key file containing Base64-encoded JSON payload + Ed25519 signature.
   - Payload specifies: Licensed Shop Name, Machine Fingerprint, Expiry Date (or Perpetual), Feature Flags (`grocery_pack`, `electronics_pack`, `multi_till`).
   - 14-day full-featured offline trial grace period with tamper-resistant monotonic timestamp tracking.
2. **Windows Hardware Fingerprinting**:
   - Stable machine identifier derived from Windows motherboard UUID, BIOS serial, and CPU identifier.
   - Resistant to simple clock rollback or cloning.
3. **Grocery & Supermarket Pack**:
   - In-store deli/vegetable weight scale barcodes (EAN-13 prefix `20` to `29`).
   - Automatically decomposes barcode into: `Item SKU` (4 or 5 digits) and `Price / Weight` (5 digits).
   - Instant cart item addition with calculated weight and unit price.
4. **Electronics & Mobile Shop Pack**:
   - IMEI and serial number tracking: required input on purchase entry and sale scan.
   - Prevents selling duplicate or untracked IMEIs.
   - Prints IMEI and warranty terms directly on thermal receipt.
5. **Apparel & Footwear Pack**:
   - Matrix variant attributes (Size: S/M/L/XL, Color: Red/Blue/Black) mapped to individual child SKUs with shared parent product definition.
