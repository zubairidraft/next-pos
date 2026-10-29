use pos_core::hardware::{PrinterManufacturer, PrinterProfile, ScannerProfile};

#[test]
fn test_printer_profiles_and_diagnostic_streams() {
    // 1. Epson TM-T20 80mm Profile
    let epson_80 = PrinterProfile::preset(PrinterManufacturer::Epson, 80);
    assert_eq!(epson_80.columns, 48);
    assert_eq!(epson_80.paper_width_mm, 80);
    assert_eq!(epson_80.drawer_pulse_code, [0x1B, 0x70, 0x00, 0x19, 0xFA]);

    let epson_stream = epson_80.generate_diagnostic_receipt("Al-Madina Mart");
    assert!(!epson_stream.is_empty());
    // Must begin with ESC @ (0x1B, 0x40)
    assert_eq!(&epson_stream[0..2], &[0x1B, 0x40]);
    // Must end with paper cut (0x1D, 0x56, 0x00)
    let len = epson_stream.len();
    assert_eq!(&epson_stream[len - 3..len], &[0x1D, 0x56, 0x00]);

    // 2. Xprinter 58mm Profile
    let xprinter_58 = PrinterProfile::preset(PrinterManufacturer::Xprinter, 58);
    assert_eq!(xprinter_58.columns, 32);
    assert_eq!(xprinter_58.density_level, 4);
    let xprinter_stream = xprinter_58.generate_diagnostic_receipt("Bismillah Bakery");
    assert!(!xprinter_stream.is_empty());

    // 3. Black Copper 80mm Profile
    let bc_80 = PrinterProfile::preset(PrinterManufacturer::BlackCopper, 80);
    assert_eq!(bc_80.columns, 48);
    let bc_stream = bc_80.generate_diagnostic_receipt("Super Store Lahore");
    assert!(!bc_stream.is_empty());
}

#[test]
fn test_scanner_input_normalization() {
    // Standard barcode with trailing Windows CR LF (\r\n) from HID scanner
    let raw1 = "8961011002231\r\n";
    assert_eq!(ScannerProfile::normalize_scanner_input(raw1), "8961011002231");

    // Scanner with trailing Tab (\t)
    let raw2 = "TEA-TAPAL-400\t";
    assert_eq!(ScannerProfile::normalize_scanner_input(raw2), "TEA-TAPAL-400");

    // Scanner with leading/trailing spaces and newlines
    let raw3 = "  \n\r8964000010001\r\n  ";
    assert_eq!(ScannerProfile::normalize_scanner_input(raw3), "8964000010001");
}
