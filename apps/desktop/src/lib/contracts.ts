export interface SystemStatusDto {
  app_name: string;
  pos_core_version: string;
  offline_ready: boolean;
  database: {
    encrypted: boolean;
    journal_mode: string;
    foreign_keys: boolean;
    schema_version: string;
    tables_count: number;
  };
  sample_currency: {
    paisa: number;
    formatted: string;
  };
}

export interface CartLineItem {
  variant_id: string;
  product_name: string;
  sku: string;
  barcode: string;
  unit_code: string;
  qty_milli: number; // 1000 = 1.000
  unit_price_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  stock_on_hand_milli: number;
}

export interface ParkedCartItem {
  id: string;
  cart_name: string;
  item_count: number;
  total_paisa: number;
  parked_at: string;
}

export interface PaymentTender {
  method: "cash" | "card" | "jazzcash" | "easypaisa" | "raast" | "credit";
  amount_paisa: number;
  reference?: string;
}

export interface SaleSummary {
  id: string;
  doc_no: string;
  customer_name?: string;
  subtotal_paisa: number;
  discount_paisa: number;
  tax_paisa: number;
  grand_total_paisa: number;
  total_paid_paisa: number;
  change_paisa: number;
  occurred_at: string;
}
