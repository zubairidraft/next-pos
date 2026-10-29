//! Certified hardware profiles for Pakistani market thermal printers and barcode scanners.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrinterManufacturer {
    StandardEscPos,
    Epson,
    Xprinter,
    Rongta,
    BlackCopper,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterProfile {
    pub manufacturer: PrinterManufacturer,
    pub model_name: String,
    pub paper_width_mm: u32,
    pub columns: u32,
    pub raster_chunk_size: usize,
    pub drawer_pulse_code: [u8; 5],
    pub density_level: u8, // 1 to 5
}

impl PrinterProfile {
    /// Factory constructor for market-standard printer profiles
    pub fn preset(manufacturer: PrinterManufacturer, paper_width_mm: u32) -> Self {
        let columns = if paper_width_mm <= 58 { 32 } else { 48 };

        match manufacturer {
            PrinterManufacturer::Epson => Self {
                manufacturer,
                model_name: "Epson TM-T20 / TM-T88".to_string(),
                paper_width_mm,
                columns,
                raster_chunk_size: 1024,
                drawer_pulse_code: [0x1B, 0x70, 0x00, 0x19, 0xFA], // ESC p 0 25 250
                density_level: 3,
            },
            PrinterManufacturer::Xprinter => Self {
                manufacturer,
                model_name: "Xprinter XP-Q200 / XP-N160II".to_string(),
                paper_width_mm,
                columns,
                raster_chunk_size: 512,
                drawer_pulse_code: [0x1B, 0x70, 0x00, 0x32, 0xC8], // ESC p 0 50 200
                density_level: 4,
            },
            PrinterManufacturer::Rongta => Self {
                manufacturer,
                model_name: "Rongta RP80 / RP326".to_string(),
                paper_width_mm,
                columns,
                raster_chunk_size: 512,
                drawer_pulse_code: [0x1B, 0x70, 0x00, 0x28, 0xC8],
                density_level: 3,
            },
            PrinterManufacturer::BlackCopper => Self {
                manufacturer,
                model_name: "Black Copper BC-85AC / BC-95AC".to_string(),
                paper_width_mm,
                columns,
                raster_chunk_size: 512,
                drawer_pulse_code: [0x1B, 0x70, 0x00, 0x19, 0xFA],
                density_level: 4,
            },
            PrinterManufacturer::StandardEscPos => Self {
                manufacturer,
                model_name: "Generic ESC/POS Thermal".to_string(),
                paper_width_mm,
                columns,
                raster_chunk_size: 512,
                drawer_pulse_code: [0x1B, 0x70, 0x00, 0x19, 0xFA],
                density_level: 3,
            },
        }
    }

    /// Generate an exhaustive diagnostic test page testing alignment, fonts, and cutting
    pub fn generate_diagnostic_receipt(&self, store_name: &str) -> Vec<u8> {
        let mut out = Vec::with_capacity(512);

        // 1. Initialize Printer (ESC @)
        out.extend_from_slice(&[0x1B, 0x40]);

        // 2. Set print density (GS ( K)
        out.extend_from_slice(&[0x1D, 0x28, 0x4B, 0x02, 0x00, 0x31, self.density_level]);

        // 3. Center Alignment & Header
        out.extend_from_slice(&[0x1B, 0x61, 0x01]);
        out.extend_from_slice(&[0x1B, 0x21, 0x20]); // Double width
        out.extend_from_slice(store_name.as_bytes());
        out.push(b'\n');
        out.extend_from_slice(&[0x1B, 0x21, 0x00]); // Reset font
        out.extend_from_slice(b"--- HARDWARE CERTIFICATION TEST ---\n");

        // 4. Model details
        out.extend_from_slice(&[0x1B, 0x61, 0x00]); // Left align
        let info = format!(
            "Printer:  {}\nWidth:    {} mm ({} Columns)\nDensity:  Level {}\n",
            self.model_name, self.paper_width_mm, self.columns, self.density_level
        );
        out.extend_from_slice(info.as_bytes());

        // 5. Column Ruler Check
        out.extend_from_slice(b"Width Ruler Check:\n");
        let ruler = if self.columns == 32 {
            "12345678901234567890123456789012\n"
        } else {
            "123456789012345678901234567890123456789012345678\n"
        };
        out.extend_from_slice(ruler.as_bytes());

        // 6. Footer & Paper Feed Cut
        out.extend_from_slice(&[0x1B, 0x61, 0x01]); // Center
        out.extend_from_slice(b"Next POS - 100% Offline Ready\n");
        out.extend_from_slice(&[0x1B, 0x64, 0x04]); // Feed 4 lines
        out.extend_from_slice(&[0x1D, 0x56, 0x00]); // Full Cut (GS V 0)

        out
    }
}

pub struct ScannerProfile;

impl ScannerProfile {
    /// Normalize raw scanner string by stripping hardware prefixes, suffixes (CR, LF, Tab, ESC), and whitespace
    pub fn normalize_scanner_input(raw: &str) -> String {
        raw.trim()
            .trim_matches(|c: char| c == '\r' || c == '\n' || c == '\t' || c == '\x1B' || c == '\0')
            .trim()
            .to_string()
    }
}
