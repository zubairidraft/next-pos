//! Apparel & footwear size x color matrix variant generator.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApparelMatrixInput {
    pub parent_style_name: String,
    pub parent_style_name_ur: Option<String>,
    pub base_sku: String,
    pub sizes: Vec<String>,
    pub colors: Vec<String>,
    pub cost_price_paisa: i64,
    pub retail_price_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedMatrixVariant {
    pub sku: String,
    pub barcode: String,
    pub name_en: String,
    pub name_ur: Option<String>,
    pub size: String,
    pub color: String,
    pub cost_price_paisa: i64,
    pub retail_price_paisa: i64,
}

pub struct ApparelMatrixService;

impl ApparelMatrixService {
    /// Generate all combinatorial variants across sizes and colors
    pub fn generate_matrix(input: &ApparelMatrixInput) -> Vec<GeneratedMatrixVariant> {
        let mut variants = Vec::new();
        let base_sku_clean = input.base_sku.trim().to_uppercase();

        for size in &input.sizes {
            let size_clean = size.trim().to_uppercase();
            for color in &input.colors {
                let color_clean = color.trim().to_uppercase();

                let variant_sku = format!("{}-{}-{}", base_sku_clean, color_clean, size_clean);
                let barcode = generate_matrix_barcode(&variant_sku);
                let name_en = format!("{} ({} / {})", input.parent_style_name, color, size);
                let name_ur = input.parent_style_name_ur.as_ref().map(|ur| {
                    format!("{} ({} / {})", ur, color, size)
                });

                variants.push(GeneratedMatrixVariant {
                    sku: variant_sku,
                    barcode,
                    name_en,
                    name_ur,
                    size: size.clone(),
                    color: color.clone(),
                    cost_price_paisa: input.cost_price_paisa,
                    retail_price_paisa: input.retail_price_paisa,
                });
            }
        }

        variants
    }
}

/// Generate a synthetic 13-digit EAN-like barcode for apparel variant
fn generate_matrix_barcode(sku: &str) -> String {
    let mut h: u64 = 0x853c49e6748fea9b;
    for (i, b) in sku.bytes().enumerate() {
        h = h.wrapping_add((b as u64).wrapping_mul((i as u64 + 1) * 31));
    }
    let digits = (h % 9000000000) + 1000000000; // 10 digits
    format!("896{}", digits)
}
