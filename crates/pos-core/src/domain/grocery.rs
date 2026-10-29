//! Grocery & supermarket weighing scale barcode parser and tare calculation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScaleBarcodeType {
    PriceEmbedded,  // EAN-13 starting with '20'
    WeightEmbedded, // EAN-13 starting with '21'
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScaleBarcodeResult {
    pub barcode_type: ScaleBarcodeType,
    pub item_sku: String,
    pub embedded_price_paisa: Option<i64>,
    pub embedded_weight_milli: Option<i64>, // in milli-units / grams
}

pub struct GroceryScaleService;

impl GroceryScaleService {
    /// Parse in-store scale generated barcodes (EAN-13 prefix 20 or 21)
    pub fn parse_scale_barcode(barcode: &str) -> Option<ScaleBarcodeResult> {
        let clean = barcode.trim();
        // EAN-13 scale barcodes are exactly 12 or 13 digits
        if clean.len() != 12 && clean.len() != 13 {
            return None;
        }

        let prefix = &clean[0..2];
        let item_sku = format!("SCALE-{}", &clean[2..7]);
        let value_digits = &clean[7..12];

        let num_value: i64 = value_digits.parse().ok()?;

        match prefix {
            // "20": Price Embedded (value in PKR cents/Paisa or Rupees)
            // Format: 20 SSSSS PPPPP C -> PPPPP is price in paisa or whole rupees
            "20" => Some(ScaleBarcodeResult {
                barcode_type: ScaleBarcodeType::PriceEmbedded,
                item_sku,
                embedded_price_paisa: Some(num_value * 100), // PKR to Paisa
                embedded_weight_milli: None,
            }),

            // "21": Weight Embedded (value in Grams / milli-units)
            // Format: 21 SSSSS WWWWW C -> WWWWW is weight in grams (milli-KG)
            "21" => Some(ScaleBarcodeResult {
                barcode_type: ScaleBarcodeType::WeightEmbedded,
                item_sku,
                embedded_price_paisa: None,
                embedded_weight_milli: Some(num_value * 1000), // Grams to milli-units
            }),

            _ => None,
        }
    }

    /// Deduct packaging tare from gross weight (in milli-units)
    pub fn calculate_net_weight_milli(gross_weight_milli: i64, tare_weight_milli: i64) -> i64 {
        if gross_weight_milli <= tare_weight_milli {
            0
        } else {
            gross_weight_milli - tare_weight_milli
        }
    }
}
