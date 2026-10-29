use pos_core::domain::grocery::{GroceryScaleService, ScaleBarcodeType};

#[test]
fn test_parse_price_embedded_scale_barcode() {
    // Barcode: 20 + 04512 (SKU) + 00350 (PKR 350) + 7 (Check digit)
    let barcode = "2004512003507";
    let res = GroceryScaleService::parse_scale_barcode(barcode).expect("parsed");

    assert_eq!(res.barcode_type, ScaleBarcodeType::PriceEmbedded);
    assert_eq!(res.item_sku, "SCALE-04512");
    // PKR 350 = 35,000 Paisa
    assert_eq!(res.embedded_price_paisa, Some(35000));
    assert_eq!(res.embedded_weight_milli, None);
}

#[test]
fn test_parse_weight_embedded_scale_barcode() {
    // Barcode: 21 + 08931 (SKU) + 01450 (1,450 Grams) + 4 (Check digit)
    let barcode = "2108931014504";
    let res = GroceryScaleService::parse_scale_barcode(barcode).expect("parsed");

    assert_eq!(res.barcode_type, ScaleBarcodeType::WeightEmbedded);
    assert_eq!(res.item_sku, "SCALE-08931");
    assert_eq!(res.embedded_price_paisa, None);
    // 1450 Grams * 1000 = 1,450,000 milli-units
    assert_eq!(res.embedded_weight_milli, Some(1450000));
}

#[test]
fn test_tare_weight_deduction() {
    // Gross: 1,850g (1,850,000 milli), Tare (Plastic box): 120g (120,000 milli)
    let net = GroceryScaleService::calculate_net_weight_milli(1850000, 120000);
    assert_eq!(net, 1730000); // 1,730g

    // Gross smaller than tare returns 0
    let zero_net = GroceryScaleService::calculate_net_weight_milli(50000, 100000);
    assert_eq!(zero_net, 0);
}

#[test]
fn test_ignore_standard_commercial_barcodes() {
    // Standard retail UPC / EAN not starting with 20 or 21
    assert!(GroceryScaleService::parse_scale_barcode("8961011002231").is_none());
    assert!(GroceryScaleService::parse_scale_barcode("12345").is_none());
}
