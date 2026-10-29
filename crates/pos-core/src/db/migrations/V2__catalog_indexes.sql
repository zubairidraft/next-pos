-- V2: Catalog Performance Indexes & Default Price Lists

-- Fast barcode and SKU scanner indexes
CREATE INDEX IF NOT EXISTS idx_barcodes_value ON barcodes(value);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_name_ur ON products(name_ur);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_prices_variant_list ON prices(variant_id, price_list_id);
CREATE INDEX IF NOT EXISTS idx_variant_units_barcode ON variant_units(barcode);

-- Default Price Lists
INSERT OR IGNORE INTO price_lists (id, name, created_at) VALUES 
('retail', 'Retail', datetime('now')),
('wholesale', 'Wholesale', datetime('now'));

-- Default Tax Rates (Exempt 0%, Standard FBR 18%)
INSERT OR IGNORE INTO tax_rates (id, name, rate_bp, inclusive, fbr_code, created_at) VALUES 
('standard_0', 'Exempt (0%)', 0, 1, 'EX0', datetime('now')),
('standard_18', 'Standard Sales Tax (18%)', 1800, 1, 'ST18', datetime('now'));
