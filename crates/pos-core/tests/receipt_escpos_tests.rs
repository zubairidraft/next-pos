use pos_core::hardware::{
    EscPosAlign, EscPosGenerator, ReceiptLineItem, ReceiptPayload, ReceiptWidth,
};

#[test]
fn test_escpos_receipt_generation_58mm() {
    let mut gen = EscPosGenerator::new(ReceiptWidth::Width58mm);

    let payload = ReceiptPayload {
        store_name: "Al-Madina Superstore".to_string(),
        store_name_ur: Some("المدینہ سپر اسٹور".to_string()),
        store_address: Some("Main Commercial Market, Rawalpindi".to_string()),
        store_phone: Some("051-4455667".to_string()),
        ntn: Some("1234567-8".to_string()),
        invoice_no: "INV-202610-0042".to_string(),
        date_time: "2026-10-29 15:30".to_string(),
        cashier_name: "Tariq M.".to_string(),
        customer_name: None,
        items: vec![
            ReceiptLineItem {
                name: "Tapal Danedar Tea 450g".to_string(),
                name_ur: Some("ٹپال دانے دار چائے".to_string()),
                qty_display: "2".to_string(),
                unit_price_paisa: 62000,
                total_paisa: 124000,
            },
            ReceiptLineItem {
                name: "Dalda Oil 1L".to_string(),
                name_ur: None,
                qty_display: "1".to_string(),
                unit_price_paisa: 54000,
                total_paisa: 54000,
            },
        ],
        subtotal_paisa: 178000,
        discount_paisa: 8000,
        tax_paisa: 0,
        grand_total_paisa: 170000,
        payments: vec![("cash".to_string(), 200000)],
        change_paisa: 30000,
        footer_note: Some("Thank you for shopping with us!".to_string()),
        footer_note_ur: Some("تشریف آوری کا شکریہ".to_string()),
    };

    let bytes = gen.generate_sale_receipt(&payload);
    assert!(!bytes.is_empty());

    // Verify ESC @ (init) is present
    assert_eq!(&bytes[0..2], &[0x1B, 0x40]);

    // Verify cash drawer kick pulse is included: ESC p 0 25 250
    let kick_bytes = [0x1B, 0x70, 0x00, 0x19, 0xFA];
    assert!(
        bytes.windows(kick_bytes.len()).any(|w| w == kick_bytes),
        "Receipt must include cash drawer kick pulse sequence"
    );

    // Verify paper cut command is included: GS V 66 0
    let cut_bytes = [0x1D, 0x56, 0x42, 0x00];
    assert!(
        bytes.windows(cut_bytes.len()).any(|w| w == cut_bytes),
        "Receipt must include paper cut sequence"
    );

    // Verify invoice number is embedded
    let text_content = String::from_utf8_lossy(bytes);
    assert!(text_content.contains("INV-202610-0042"));
    assert!(text_content.contains("TOTAL:"));
    assert!(text_content.contains("1700.00"));
}

#[test]
fn test_escpos_receipt_generation_80mm() {
    let mut gen = EscPosGenerator::new(ReceiptWidth::Width80mm);

    let payload = ReceiptPayload {
        store_name: "HyperMart Karachi".to_string(),
        store_name_ur: None,
        store_address: None,
        store_phone: None,
        ntn: None,
        invoice_no: "INV-202610-0099".to_string(),
        date_time: "2026-10-29 16:00".to_string(),
        cashier_name: "Ali Raza".to_string(),
        customer_name: Some("Rashid Ahmed".to_string()),
        items: vec![ReceiptLineItem {
            name: "Basmati Rice 5kg Special Premium".to_string(),
            name_ur: None,
            qty_display: "2".to_string(),
            unit_price_paisa: 175000,
            total_paisa: 350000,
        }],
        subtotal_paisa: 350000,
        discount_paisa: 0,
        tax_paisa: 0,
        grand_total_paisa: 350000,
        payments: vec![("card".to_string(), 350000)],
        change_paisa: 0,
        footer_note: None,
        footer_note_ur: None,
    };

    let bytes = gen.generate_sale_receipt(&payload);
    assert!(!bytes.is_empty());
    let text_content = String::from_utf8_lossy(bytes);
    assert!(text_content.contains("HyperMart Karachi"));
    assert!(text_content.contains("3500.00"));
}

#[test]
fn test_escpos_1bit_raster_bitmap() {
    let mut gen = EscPosGenerator::new(ReceiptWidth::Width58mm);
    let dummy_bitmap = vec![0xFF, 0x00, 0xAA, 0x55]; // 4 bytes = 32 pixels wide x 1 row

    gen.align(EscPosAlign::Center);
    gen.raster_bitmap(32, 1, &dummy_bitmap);

    let bytes = gen.as_bytes();
    // GS v 0 0 xL xH yL yH d1..dk
    // xL=4, xH=0, yL=1, yH=0
    let expected_header = [0x1D, 0x76, 0x30, 0x00, 0x04, 0x00, 0x01, 0x00];
    assert!(
        bytes.windows(expected_header.len()).any(|w| w == expected_header),
        "Raster bitmap header matches ESC/POS specification"
    );
}
