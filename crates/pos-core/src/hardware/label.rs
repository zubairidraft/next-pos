use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LabelSize {
    /// 38mm x 25mm (Standard retail shelf & small product sticker)
    Size38x25,
    /// 50mm x 30mm (Supermarket & apparel standard sticker)
    Size50x30,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelPayload {
    pub store_name: String,
    pub item_name: String,
    pub item_name_ur: Option<String>,
    pub barcode: String,
    pub price_paisa: i64,
    pub size: LabelSize,
    pub copies: usize,
}

pub struct LabelGenerator;

impl LabelGenerator {
    /// Generates raw TSPL (Taiwan Semiconductor / TSC / Xprinter / Rongta) thermal label commands.
    pub fn generate_tspl(payload: &LabelPayload) -> Vec<u8> {
        let mut commands = String::new();

        let (width_mm, height_mm, bc_height, x_offset) = match payload.size {
            LabelSize::Size38x25 => (38, 25, 48, 16),
            LabelSize::Size50x30 => (50, 30, 64, 24),
        };

        let price_formatted = format!(
            "PKR {:.2}",
            payload.price_paisa as f64 / 100.0
        );

        // Header and setup
        commands.push_str(&format!("SIZE {} mm, {} mm\r\n", width_mm, height_mm));
        commands.push_str("GAP 2 mm, 0 mm\r\n");
        commands.push_str("DIRECTION 1\r\n");
        commands.push_str("CLS\r\n");

        // Store header
        commands.push_str(&format!(
            "TEXT {}, 16, \"2\", 0, 1, 1, \"{}\"\r\n",
            x_offset, payload.store_name
        ));

        // Item name (truncate if too long for label width)
        let max_len = if payload.size == LabelSize::Size38x25 { 22 } else { 30 };
        let clean_name: String = payload.item_name.chars().take(max_len).collect();
        commands.push_str(&format!(
            "TEXT {}, 40, \"2\", 0, 1, 1, \"{}\"\r\n",
            x_offset, clean_name
        ));

        // Code128 Barcode: BARCODE X, Y, "128", height, readable, rotation, narrow, wide, "code"
        let bc_y = match payload.size {
            LabelSize::Size38x25 => 68,
            LabelSize::Size50x30 => 76,
        };
        commands.push_str(&format!(
            "BARCODE {}, {}, \"128\", {}, 1, 0, 2, 2, \"{}\"\r\n",
            x_offset, bc_y, bc_height, payload.barcode
        ));

        // Price
        let price_y = bc_y + bc_height + 26;
        commands.push_str(&format!(
            "TEXT {}, {}, \"3\", 0, 1, 1, \"{}\"\r\n",
            x_offset, price_y, price_formatted
        ));

        // Print copies
        let copies = if payload.copies == 0 { 1 } else { payload.copies };
        commands.push_str(&format!("PRINT {}, 1\r\n", copies));

        commands.into_bytes()
    }
}
