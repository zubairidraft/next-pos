use pos_core::hardware::label::{LabelGenerator, LabelPayload, LabelSize};

#[test]
fn test_tspl_label_generation_38x25() {
    let payload = LabelPayload {
        store_name: "Al-Madina Mart".to_string(),
        item_name: "Shan Biryani Masala 50g".to_string(),
        item_name_ur: Some("شان بریانی مصالحہ".to_string()),
        barcode: "8964000101112".to_string(),
        price_paisa: 14000, // PKR 140.00
        size: LabelSize::Size38x25,
        copies: 3,
    };

    let bytes = LabelGenerator::generate_tspl(&payload);
    let output = String::from_utf8(bytes).expect("Valid UTF-8 string");

    assert!(output.contains("SIZE 38 mm, 25 mm"));
    assert!(output.contains("GAP 2 mm, 0 mm"));
    assert!(output.contains("Al-Madina Mart"));
    assert!(output.contains("Shan Biryani Masala"));
    assert!(output.contains("BARCODE 16, 68, \"128\", 48, 1, 0, 2, 2, \"8964000101112\""));
    assert!(output.contains("PKR 140.00"));
    assert!(output.contains("PRINT 3, 1"));
}

#[test]
fn test_tspl_label_generation_50x30() {
    let payload = LabelPayload {
        store_name: "Super Cash & Carry".to_string(),
        item_name: "Tapal Danedar Tea 400g Pouch".to_string(),
        item_name_ur: Some("ٹپال دانے دار چائے".to_string()),
        barcode: "8961011002231".to_string(),
        price_paisa: 72000, // PKR 720.00
        size: LabelSize::Size50x30,
        copies: 1,
    };

    let bytes = LabelGenerator::generate_tspl(&payload);
    let output = String::from_utf8(bytes).expect("Valid UTF-8 string");

    assert!(output.contains("SIZE 50 mm, 30 mm"));
    assert!(output.contains("Tapal Danedar Tea"));
    assert!(output.contains("PKR 720.00"));
    assert!(output.contains("PRINT 1, 1"));
}
