#![allow(dead_code)]
//! Regression tests for the sale/purchase edit fixes (verification of 2026-11-07):
//! untouched lines keep their sold price, bill discount is not counted twice, tax is
//! kept, and a purchase that is partly sold can still have its rate corrected.

use pos_core::app::*;
use pos_core::domain::catalog::CreateProductParams;
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput};
use pos_core::domain::sale::PaymentTenderInput;
use pos_core::history::*;
use tempfile::TempDir;


struct Shop {
    app: PosApp,
    _dir: TempDir,
    pc: String,
    box_unit: String,
    vendor: String,
    customer: String,
}

fn create_item(app: &PosApp, pc: &str, sku: &str, name: &str, retail: i64, wholesale: Option<i64>, service: bool) -> (String, String) {
    let r = app.create_item(
        CreateProductParams {
            sku: sku.into(),
            name: name.into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: pc.into(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: Some(5_000),
            barcode: None,
            retail_price_paisa: retail,
            wholesale_price_paisa: wholesale,
            packaging_units: vec![],
        },
        service,
    )
    .unwrap();
    (r.product_id, r.variant_id)
}

fn shop() -> Shop {
    let dir = TempDir::new().unwrap();
    let mut app = PosApp::open_with_machine(dir.path(), "KPOS-AAAA-BBBB-CCCC-DDDD".into()).unwrap();
    app.setup_first_run(
        StoreSetupInput {
            name: "Next POS Test Shop".into(),
            name_ur: None,
            address: None,
            phone: None,
            ntn: None,
            strn: None,
            tax_mode: None,
            enabled_packs: vec![],
            demo_catalog: false,
        },
        OwnerSetupInput {
            username: "owner".into(),
            password: "owner-pass-1".into(),
            pin: Some("1234".into()),
        },
    )
    .unwrap();
    let pc = app.list_units().unwrap().into_iter().find(|u| u.code == "pc").unwrap().id;
    let box_unit = app.create_unit("box", "Box", 0).unwrap().id;
    let vendor = app
        .create_party(CustomerInput {
            party_type: Some("vendor".into()),
            name: "Main Vendor".into(),
            name_ur: None,
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: 0,
            opening_balance_paisa: 0,
            price_list_id: None,
        })
        .unwrap()
        .id;
    let customer = app
        .create_party(CustomerInput {
            party_type: Some("customer".into()),
            name: "Bilal Customer".into(),
            name_ur: None,
            phone: Some("03001112222".into()),
            cnic: None,
            ntn: None,
            credit_limit_paisa: 500_000_00,
            opening_balance_paisa: 0,
            price_list_id: None,
        })
        .unwrap()
        .id;
    app.start_shift(0).unwrap();
    Shop {
        app,
        _dir: dir,
        pc,
        box_unit,
        vendor,
        customer,
    }
}

fn buy(s: &mut Shop, variant: &str, qty_milli: i64, cost_paisa: i64) -> String {
    s.app
        .post_purchase(CreatePurchaseInput {
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: Some("PUR-INV-1".into()),
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput {
                variant_id: variant.into(),
                unit_id: s.pc.clone(),
                received_qty_milli: qty_milli,
                unit_cost_paisa: cost_paisa,
            }],
            user_id: None,
        })
        .unwrap()
        .id
}

fn sell(s: &mut Shop, lines: &[(&str, i64)], customer: Option<String>, credit: bool) -> ReceiptData {
    let clines: Vec<CheckoutLineInput> = lines
        .iter()
        .map(|(v, q)| CheckoutLineInput {
            variant_id: v.to_string(),
            unit_id: s.pc.clone(),
            qty_milli: *q,
            discount_paisa: 0,
            price_override_paisa: None,
        })
        .collect();
    let q = s.app.quote(customer.as_deref(), &clines, 0).unwrap();
    let tender = PaymentTenderInput {
        method: if credit { "credit".into() } else { "cash".into() },
        amount_paisa: q.total_paisa,
        reference: None,
    };
    s.app
        .checkout(CheckoutInput {
            customer_id: customer,
            lines: clines,
            global_discount_paisa: 0,
            tenders: vec![tender],
            approval: None,
        })
        .unwrap()
}

fn on_hand(s: &Shop, variant: &str) -> i64 {
    s.app
        .stock_list()
        .unwrap()
        .into_iter()
        .find(|b| b.variant_id == variant)
        .map(|b| b.on_hand_milli)
        .unwrap_or(0)
}

fn vendor_balance(s: &Shop, vendor_id: &str) -> i64 {
    s.app
        .list_vendors("")
        .unwrap()
        .into_iter()
        .find(|v| v.id == vendor_id)
        .unwrap()
        .balance_paisa
}

fn customer_balance(s: &Shop, customer_id: &str) -> i64 {
    s.app
        .list_customers("")
        .unwrap()
        .into_iter()
        .find(|c| c.id == customer_id)
        .unwrap()
        .balance_paisa
}

// ================================================================
// 1. Sale edit: Qty increase

fn line(s: &Shop, v: &str, q: i64, disc: i64, ovr: Option<i64>) -> CheckoutLineInput {
    CheckoutLineInput { variant_id: v.into(), unit_id: s.pc.clone(), qty_milli: q, discount_paisa: disc, price_override_paisa: ovr }
}

fn edit(s: &mut Shop, sale_id: &str, rev: i64, lines: Vec<CheckoutLineInput>, global: i64, settle: i64) -> std::result::Result<ReceiptData, String> {
    let settlement = if settle > 0 { vec![PaymentTenderInput { method: "cash".into(), amount_paisa: settle, reference: None }] } else { vec![] };
    s.app.edit_sale(EditSaleInput {
        sale_id: sale_id.into(), expected_revision: rev, customer_id: None, lines, global_discount_paisa: global,
        settlement, refund_to_khata: false, reason: "probe test".into(), approval: None,
    }).map_err(|e| e.to_string())
}

/// P1: bought 10, sold 3, now only the purchase COST is corrected (qty stays 10).
#[test]
fn p1_purchase_cost_fix_after_partial_sale() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "P1", "Cable", 200_00, Some(120_00), false);
    let pid = buy(&mut s, &var, 10_000, 100_00);
    sell(&mut s, &[(&var, 3_000)], None, false);
    let r = s.app.edit_purchase(EditPurchaseInput {
        purchase_id: pid, expected_revision: 0, vendor_id: s.vendor.clone(), vendor_invoice_no: Some("PUR-INV-1".into()),
        freight_paisa: 0,
        lines: vec![CreatePurchaseLineInput { variant_id: var.clone(), unit_id: s.pc.clone(), received_qty_milli: 10_000, unit_cost_paisa: 90_00 }],
        reason: "vendor bill had wrong rate".into(),
    });
    println!("P1 result: {:?}", r.as_ref().map(|i| i.total_paisa).map_err(|e| e.to_string()));
    assert!(r.is_ok(), "cost-only fix should be allowed: {:?}", r.err().map(|e| e.to_string()));
    assert_eq!(on_hand(&s, &var), 7_000);
    let cost = s.app.stock_list().unwrap().into_iter().find(|b| b.variant_id == var).unwrap().avg_cost_paisa;
    assert_eq!(cost, 90_00, "stock left should be costed at the corrected rate");
    // lowering below what was already sold is still refused
    let r = s.app.edit_purchase(EditPurchaseInput {
        purchase_id: s.app.list_purchases(10).unwrap()[0].id.clone(), expected_revision: 1, vendor_id: s.vendor.clone(),
        vendor_invoice_no: None, freight_paisa: 0,
        lines: vec![CreatePurchaseLineInput { variant_id: var.clone(), unit_id: s.pc.clone(), received_qty_milli: 2_000, unit_cost_paisa: 90_00 }],
        reason: "too low".into(),
    });
    assert!(r.unwrap_err().to_string().contains("already sold"));
    assert_eq!(on_hand(&s, &var), 7_000);
}

/// P2: receipt sold at a counter price (180 instead of 200). The edit screen sends
/// untouched lines with price_override = null. The price must not jump to 200.
#[test]
fn p2_untouched_line_keeps_counter_price() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "P2", "Bulb", 200_00, Some(120_00), false);
    buy(&mut s, &var, 10_000, 100_00);
    let q = s.app.quote(None, &[line(&s, &var, 1_000, 0, Some(180_00))], 0).unwrap();
    let sale = s.app.checkout(CheckoutInput { customer_id: None, lines: vec![line(&s, &var, 1_000, 0, Some(180_00))], global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput { method: "cash".into(), amount_paisa: q.total_paisa, reference: None }], approval: None }).unwrap();
    assert_eq!(sale.sale.total_paisa, 180_00);
    // what the UI sends for an untouched line, plus a second item added
    let nl = line(&s, &var, 1_000, 0, None);
    let r = edit(&mut s, &sale.sale.id, 0, vec![nl], 0, 20_00);
    println!("P2 result: {:?}", r.as_ref().map(|x| x.sale.total_paisa));
    let after = s.app.receipt(&sale.sale.id).unwrap().sale.total_paisa;
    assert_eq!(after, 180_00, "untouched line was re-priced");
}

/// P3: product price raised after the sale. Editing an old receipt must not re-price old lines.
#[test]
fn p3_price_change_after_sale_does_not_reprice_old_receipt() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "P3", "Soap", 200_00, Some(120_00), false);
    buy(&mut s, &var, 10_000, 100_00);
    let sale = sell(&mut s, &[(&var, 1_000)], None, false);
    s.app.update_price(&var, 250_00, Some(120_00)).unwrap();
    let nl = line(&s, &var, 1_000, 0, None);
    let r = edit(&mut s, &sale.sale.id, 0, vec![nl], 0, 50_00);
    println!("P3 result: {:?}", r.as_ref().map(|x| x.sale.total_paisa));
    assert_eq!(s.app.receipt(&sale.sale.id).unwrap().sale.total_paisa, 200_00, "old line re-priced to today's price");
}

/// P4: line discount. The edit screen pre-fills the bill discount with sales.discount_paisa,
/// which already contains the line discounts, so nothing changed must keep the same total.
#[test]
fn p4_line_discount_not_counted_twice() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "P4", "Pen", 200_00, Some(120_00), false);
    buy(&mut s, &var, 10_000, 100_00);
    let l = line(&s, &var, 1_000, 20_00, None);
    let q = s.app.quote(None, &[l.clone()], 0).unwrap();
    let sale = s.app.checkout(CheckoutInput { customer_id: None, lines: vec![l.clone()], global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput { method: "cash".into(), amount_paisa: q.total_paisa, reference: None }], approval: None }).unwrap();
    assert_eq!(sale.sale.total_paisa, 180_00);
    // SaleEditView pre-fills the bill discount with the total discount minus the line discounts
    let global_as_ui = sale.sale.discount_paisa - sale.sale.lines.iter().map(|l| l.discount_paisa).sum::<i64>();
    assert_eq!(global_as_ui, 0);
    println!("P4 sale.discount_paisa (pre-filled as bill discount) = {}", global_as_ui);
    let r = edit(&mut s, &sale.sale.id, 0, vec![l], global_as_ui, 0);
    println!("P4 result: {:?}", r.as_ref().map(|x| x.sale.total_paisa));
    assert_eq!(s.app.receipt(&sale.sale.id).unwrap().sale.total_paisa, 180_00, "line discount counted twice");
}

/// P5: exclusive tax. Editing without changes must keep the tax.
#[test]
fn p5_tax_kept_on_edit() {
    let mut s = shop();
    let tax = s.app.create_tax_rate("GST 10", 1000, false).unwrap();
    let r = s.app.create_item(CreateProductParams { sku: "P5".into(), name: "Taxed".into(), name_ur: None, category_id: None, brand_id: None,
        base_unit_id: s.pc.clone(), hs_code: None, tax_rate_id: Some(tax.id.clone()), track_mode: None, reorder_level_milli: None, barcode: None,
        retail_price_paisa: 100_00, wholesale_price_paisa: Some(50_00), packaging_units: vec![] }, false).unwrap();
    let var = r.variant_id;
    buy(&mut s, &var, 10_000, 40_00);
    let sale = sell(&mut s, &[(&var, 1_000)], None, false);
    println!("P5 original total {} tax {}", sale.sale.total_paisa, sale.sale.tax_paisa);
    let nl = line(&s, &var, 1_000, 0, None);
    let r = edit(&mut s, &sale.sale.id, 0, vec![nl], 0, 0);
    println!("P5 result: {:?}", r.as_ref().map(|x| (x.sale.total_paisa, x.sale.tax_paisa)));
    let after = s.app.receipt(&sale.sale.id).unwrap().sale;
    assert_eq!((after.total_paisa, after.tax_paisa), (sale.sale.total_paisa, sale.sale.tax_paisa), "tax lost on edit");
}
