//! ESC/POS thermal receipt engine with 1-bit raster graphics & hardware cash drawer kick.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReceiptWidth {
    Width58mm, // 384 dots, ~32 columns
    Width80mm, // 576 dots, ~48 columns
}

impl ReceiptWidth {
    pub fn columns(&self) -> usize {
        match self {
            ReceiptWidth::Width58mm => 32,
            ReceiptWidth::Width80mm => 48,
        }
    }

    pub fn dot_width(&self) -> usize {
        match self {
            ReceiptWidth::Width58mm => 384,
            ReceiptWidth::Width80mm => 576,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EscPosAlign {
    Left = 0,
    Center = 1,
    Right = 2,
}

#[derive(Debug, Clone)]
pub struct ReceiptLineItem {
    pub name: String,
    pub name_ur: Option<String>,
    pub qty_display: String,
    pub unit_price_paisa: i64,
    pub total_paisa: i64,
}

#[derive(Debug, Clone)]
pub struct ReceiptPayload {
    pub store_name: String,
    pub store_name_ur: Option<String>,
    pub store_address: Option<String>,
    pub store_phone: Option<String>,
    pub ntn: Option<String>,
    pub invoice_no: String,
    pub date_time: String,
    pub cashier_name: String,
    pub customer_name: Option<String>,
    pub items: Vec<ReceiptLineItem>,
    pub subtotal_paisa: i64,
    pub discount_paisa: i64,
    pub tax_paisa: i64,
    pub grand_total_paisa: i64,
    pub payments: Vec<(String, i64)>, // (method, amount_paisa)
    pub change_paisa: i64,
    pub footer_note: Option<String>,
    pub footer_note_ur: Option<String>,
}

pub struct EscPosGenerator {
    buffer: Vec<u8>,
    width: ReceiptWidth,
}

impl EscPosGenerator {
    pub fn new(width: ReceiptWidth) -> Self {
        let mut gen = Self {
            buffer: Vec::with_capacity(1024),
            width,
        };
        gen.init();
        gen
    }

    /// Initialize printer
    pub fn init(&mut self) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x40]); // ESC @
        self
    }

    /// Set alignment
    pub fn align(&mut self, align: EscPosAlign) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x61, align as u8]); // ESC a n
        self
    }

    /// Set bold
    pub fn bold(&mut self, on: bool) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x45, if on { 1 } else { 0 }]); // ESC E n
        self
    }

    /// Set double height / width
    pub fn double_size(&mut self, on: bool) -> &mut Self {
        let mode = if on { 0x11 } else { 0x00 };
        self.buffer.extend_from_slice(&[0x1D, 0x21, mode]); // GS ! n
        self
    }

    /// Print plain text
    pub fn text(&mut self, text: &str) -> &mut Self {
        self.buffer.extend_from_slice(text.as_bytes());
        self
    }

    /// Print text followed by newline
    pub fn text_ln(&mut self, text: &str) -> &mut Self {
        self.text(text);
        self.newline();
        self
    }

    /// Single line feed
    pub fn newline(&mut self) -> &mut Self {
        self.buffer.push(0x0A); // LF
        self
    }

    /// Multiple line feeds
    pub fn feed(&mut self, lines: u8) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x64, lines]); // ESC d n
        self
    }

    /// Horizontal separator line
    pub fn hr(&mut self) -> &mut Self {
        let cols = self.width.columns();
        let line = "-".repeat(cols);
        self.text_ln(&line);
        self
    }

    /// Double separator line
    pub fn hr_double(&mut self) -> &mut Self {
        let cols = self.width.columns();
        let line = "=".repeat(cols);
        self.text_ln(&line);
        self
    }

    /// Two-column row formatted with left and right alignment
    pub fn row_2col(&mut self, left: &str, right: &str) -> &mut Self {
        let cols = self.width.columns();
        let total_chars = left.chars().count() + right.chars().count();
        if total_chars < cols {
            let padding = cols - total_chars;
            self.text(left);
            self.text(&" ".repeat(padding));
            self.text_ln(right);
        } else {
            self.text_ln(left);
            self.align(EscPosAlign::Right);
            self.text_ln(right);
            self.align(EscPosAlign::Left);
        }
        self
    }

    /// Append Cash Drawer Kick Pulse (RJ11 Pin 2: ESC p 0 25 250)
    pub fn kick_drawer(&mut self) -> &mut Self {
        self.buffer.extend_from_slice(&[0x1B, 0x70, 0x00, 0x19, 0xFA]);
        self
    }

    /// Append Paper Cut (Full or partial with feed: GS V 66 0)
    pub fn cut_paper(&mut self) -> &mut Self {
        self.feed(3);
        self.buffer.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]);
        self
    }

    /// Render 1-bit monochrome raster bitmap (GS v 0)
    /// `width_pixels`: Width of raster image in dots
    /// `height_pixels`: Height of raster image in dots
    /// `bitmap_bytes`: Packed 1-bit image data (1 = black dot, 0 = white)
    pub fn raster_bitmap(
        &mut self,
        width_pixels: usize,
        height_pixels: usize,
        bitmap_bytes: &[u8],
    ) -> &mut Self {
        let width_bytes = (width_pixels + 7) / 8;
        let x_l = (width_bytes & 0xFF) as u8;
        let x_h = ((width_bytes >> 8) & 0xFF) as u8;
        let y_l = (height_pixels & 0xFF) as u8;
        let y_h = ((height_pixels >> 8) & 0xFF) as u8;

        // GS v 0 0 xL xH yL yH d1...dk
        self.buffer.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00, x_l, x_h, y_l, y_h]);
        self.buffer.extend_from_slice(bitmap_bytes);
        self
    }

    /// Helper to format currency
    fn format_pkr(paisa: i64) -> String {
        format!("{:.2}", paisa as f64 / 100.0)
    }

    /// Build a complete sale receipt command stream
    pub fn generate_sale_receipt(&mut self, payload: &ReceiptPayload) -> &[u8] {
        // Header
        self.align(EscPosAlign::Center);
        self.bold(true);
        self.double_size(true);
        self.text_ln(&payload.store_name);
        self.double_size(false);

        if let Some(ref store_ur) = payload.store_name_ur {
            self.text_ln(store_ur);
        }

        self.bold(false);
        if let Some(ref addr) = payload.store_address {
            self.text_ln(addr);
        }
        if let Some(ref phone) = payload.store_phone {
            self.text_ln(&format!("Tel: {}", phone));
        }
        if let Some(ref ntn) = payload.ntn {
            self.text_ln(&format!("NTN: {}", ntn));
        }

        self.hr_double();

        // Invoice Meta
        self.align(EscPosAlign::Left);
        self.row_2col(&format!("Inv: {}", payload.invoice_no), &payload.date_time);
        self.row_2col(
            &format!("Cashier: {}", payload.cashier_name),
            &format!("Cust: {}", payload.customer_name.as_deref().unwrap_or("Walk-in")),
        );

        self.hr();

        // Items Header
        self.bold(true);
        match self.width {
            ReceiptWidth::Width58mm => {
                self.row_2col("Item / Qty", "Amount");
            }
            ReceiptWidth::Width80mm => {
                let header = format!("{:<24} {:>6} {:>8} {:>8}", "Item", "Qty", "Price", "Total");
                self.text_ln(&header);
            }
        }
        self.bold(false);
        self.hr();

        // Items Lines
        for item in &payload.items {
            let total_str = Self::format_pkr(item.total_paisa);

            match self.width {
                ReceiptWidth::Width58mm => {
                    self.text_ln(&item.name);
                    let line_detail = format!("  {} @ {}", item.qty_display, Self::format_pkr(item.unit_price_paisa));
                    self.row_2col(&line_detail, &total_str);
                }
                ReceiptWidth::Width80mm => {
                    let mut name_trunc = item.name.clone();
                    if name_trunc.chars().count() > 24 {
                        name_trunc = name_trunc.chars().take(21).collect::<String>() + "...";
                    }
                    let line = format!(
                        "{:<24} {:>6} {:>8} {:>8}",
                        name_trunc,
                        item.qty_display,
                        Self::format_pkr(item.unit_price_paisa),
                        total_str
                    );
                    self.text_ln(&line);
                }
            }

            if let Some(ref ur) = item.name_ur {
                self.align(EscPosAlign::Right);
                self.text_ln(ur);
                self.align(EscPosAlign::Left);
            }
        }

        self.hr();

        // Totals
        self.row_2col("Subtotal:", &format!("PKR {}", Self::format_pkr(payload.subtotal_paisa)));

        if payload.discount_paisa > 0 {
            self.row_2col(
                "Discount:",
                &format!("-PKR {}", Self::format_pkr(payload.discount_paisa)),
            );
        }

        if payload.tax_paisa > 0 {
            self.row_2col("Tax:", &format!("PKR {}", Self::format_pkr(payload.tax_paisa)));
        }

        self.bold(true);
        self.double_size(true);
        self.row_2col(
            "TOTAL:",
            &format!("PKR {}", Self::format_pkr(payload.grand_total_paisa)),
        );
        self.double_size(false);
        self.bold(false);

        self.hr();

        // Payment Tender Breakdown
        for (method, amt) in &payload.payments {
            let label = format!("Tender ({}):", method.to_uppercase());
            self.row_2col(&label, &format!("PKR {}", Self::format_pkr(*amt)));
        }

        if payload.change_paisa > 0 {
            self.bold(true);
            self.row_2col(
                "Change Due:",
                &format!("PKR {}", Self::format_pkr(payload.change_paisa)),
            );
            self.bold(false);
        }

        self.hr_double();

        // Footer Greetings
        self.align(EscPosAlign::Center);
        if let Some(ref footer) = payload.footer_note {
            self.text_ln(footer);
        }
        if let Some(ref footer_ur) = payload.footer_note_ur {
            self.text_ln(footer_ur);
        }
        self.text_ln("Powered by Next POS (کاروبار پی او ایس)");

        // Drawer kick & paper cut
        self.kick_drawer();
        self.cut_paper();

        &self.buffer
    }

    /// Return the accumulated raw bytes
    pub fn as_bytes(&self) -> &[u8] {
        &self.buffer
    }

    /// Consume generator and return byte vector
    pub fn into_bytes(self) -> Vec<u8> {
        self.buffer
    }
}
