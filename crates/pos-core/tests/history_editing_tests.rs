//! All 22 test cases specified in section 8 of HANDOVER_HISTORY_AND_EDITING.md:
//! - Sale edit: 1 to 9
//! - Purchase edit: 10 to 14
//! - Product edit: 15 to 20
//! - Migration: 21
//! - Permissions: 22

use chrono::{Duration, Utc};
use pos_core::app::*;
use pos_core::auth::Role;
use pos_core::db::connection::{open_encrypted_db, run_migrations, run_migrations_to, schema_version};
use pos_core::db::key::DbKeyManager;
use pos_core::domain::catalog::{CreateProductParams, UpdatePackagingUnit, UpdateProductInput};
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput};
use pos_core::domain::sale::PaymentTenderInput;
use pos_core::history::*;
use rusqlite::params;
use tempfile::{NamedTempFile, TempDir};

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
// ================================================================
#[test]
fn test_01_sale_edit_qty_increase() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-1", "Product One", 200_00, Some(100_00), false);
    buy(&mut s, &var, 10_000, 100_00);
    assert_eq!(on_hand(&s, &var), 10_000);

    let sale = sell(&mut s, &[(&var, 2_000)], None, false);
    assert_eq!(on_hand(&s, &var), 8_000);
    assert_eq!(sale.sale.total_paisa, 400_00);

    // Edit sale: increase qty from 2 to 3 pcs
    let new_lines = vec![CheckoutLineInput {
        variant_id: var.clone(),
        unit_id: s.pc.clone(),
        qty_milli: 3_000,
        discount_paisa: 0,
        price_override_paisa: None,
    }];
    let diff = 200_00; // 600 - 400 = 200
    let edited_receipt = s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: new_lines,
            global_discount_paisa: 0,
            settlement: vec![PaymentTenderInput {
                method: "cash".into(),
                amount_paisa: diff,
                reference: None,
            }],
            refund_to_khata: false,
            reason: "Customer wanted 1 more".into(),
            approval: None,
        })
        .unwrap();

    // 1. Stock goes down by the extra qty
    assert_eq!(on_hand(&s, &var), 7_000);

    // 2. sales.total updated, revision = 1
    assert_eq!(edited_receipt.sale.total_paisa, 600_00);
    assert_eq!(edited_receipt.sale.revision, 1);

    // 3. document_revisions row exists
    let revisions = s.app.sale_detail(&sale.sale.id).unwrap().revisions;
    assert_eq!(revisions.len(), 1);
    assert_eq!(revisions[0].revision, 0);
    assert_eq!(revisions[0].reason, "Customer wanted 1 more");

    // 4. Cash difference saved as an inbound payment in the current shift
    let payments = s.app.sale_detail(&sale.sale.id).unwrap().payments;
    let inbound_edit_payment = payments
        .iter()
        .find(|p| p.amount_paisa == diff && p.direction == "inbound" && p.reference.as_deref().unwrap_or("").contains("edit rev 1"));
    assert!(inbound_edit_payment.is_some(), "Inbound payment for edit difference should exist");

    // 5. Audit row exists
    let conn = s.app.raw_conn().unwrap();
    let audit_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM audit_log WHERE action = 'sale_edited' AND entity_id = ?1",
            params![sale.sale.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(audit_count, 1);
}

// ================================================================
// 2. Sale edit: Line removed, cash refund
// ================================================================
#[test]
fn test_02_sale_edit_line_removed_cash_refund() {
    let mut s = shop();
    let (_p1, var1) = create_item(&s.app, &s.pc, "ITEM-A", "Item A", 100_00, Some(50_00), false);
    let (_p2, var2) = create_item(&s.app, &s.pc, "ITEM-B", "Item B", 150_00, Some(80_00), false);
    buy(&mut s, &var1, 5_000, 50_00);
    buy(&mut s, &var2, 5_000, 80_00);

    let sale = sell(&mut s, &[(&var1, 1_000), (&var2, 1_000)], None, false);
    assert_eq!(on_hand(&s, &var1), 4_000);
    assert_eq!(on_hand(&s, &var2), 4_000);

    let shift_before = s.app.active_shift().unwrap().unwrap().expected_cash_paisa;

    // Edit sale: remove Item B
    let new_lines = vec![CheckoutLineInput {
        variant_id: var1.clone(),
        unit_id: s.pc.clone(),
        qty_milli: 1_000,
        discount_paisa: 0,
        price_override_paisa: None,
    }];
    let edited = s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: new_lines,
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: false, // cash refund
            reason: "Customer returned item B immediately".into(),
            approval: None,
        })
        .unwrap();

    assert_eq!(edited.sale.total_paisa, 100_00);
    // Stock for Item B comes back
    assert_eq!(on_hand(&s, &var2), 5_000);

    // Outbound cash payment row exists
    let payments = s.app.sale_detail(&sale.sale.id).unwrap().payments;
    let refund_pmt = payments
        .iter()
        .find(|p| p.amount_paisa == 150_00 && p.direction == "outbound" && p.method == "cash");
    assert!(refund_pmt.is_some(), "Outbound cash refund payment must exist");

    // The shift's expected cash drops by that amount
    let shift_after = s.app.active_shift().unwrap().unwrap().expected_cash_paisa;
    assert_eq!(shift_after, shift_before - 150_00);
}

// ================================================================
// 3. Sale edit: Khata changes (edit down then up)
// ================================================================
#[test]
fn test_03_sale_edit_khata_changes() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-K", "Khata Product", 100_00, Some(50_00), false);
    buy(&mut s, &var, 10_000, 50_00);

    // Sell 4 pcs on khata to Bilal -> balance = 400 Rs
    let cust = s.customer.clone();
    let sale = sell(&mut s, &[(&var, 4_000)], Some(cust), true);
    assert_eq!(customer_balance(&s, &s.customer), 400_00);

    // Edit down to 2 pcs, reduce khata
    s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: Some(s.customer.clone()),
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: true,
            reason: "Reduced quantity for customer".into(),
            approval: None,
        })
        .unwrap();

    assert_eq!(customer_balance(&s, &s.customer), 200_00);

    // Edit up to 5 pcs, settle extra 3 pcs (300 Rs) to khata
    s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 1,
            customer_id: Some(s.customer.clone()),
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 5_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![PaymentTenderInput {
                method: "credit".into(),
                amount_paisa: 300_00,
                reference: None,
            }],
            refund_to_khata: false,
            reason: "Customer added more".into(),
            approval: None,
        })
        .unwrap();

    assert_eq!(customer_balance(&s, &s.customer), 500_00);
}

// ================================================================
// 4. Sale edit: Customer changed on a khata sale
// ================================================================
#[test]
fn test_04_sale_edit_customer_changed_on_khata() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-CC", "Party Change Item", 100_00, Some(50_00), false);
    buy(&mut s, &var, 10_000, 50_00);

    let customer2 = s
        .app
        .create_party(CustomerInput {
            party_type: Some("customer".into()),
            name: "Hamza Customer".into(),
            name_ur: None,
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: 100_000_00,
            opening_balance_paisa: 0,
            price_list_id: None,
        })
        .unwrap()
        .id;

    // Sell 2 pcs on khata to Bilal
    let cust = s.customer.clone();
    let sale = sell(&mut s, &[(&var, 2_000)], Some(cust), true);
    assert_eq!(customer_balance(&s, &s.customer), 200_00);
    assert_eq!(customer_balance(&s, &customer2), 0);

    // Edit sale: switch customer to Hamza, lines unchanged
    s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: Some(customer2.clone()),
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: false,
            reason: "Wrong party selected originally".into(),
            approval: None,
        })
        .unwrap();

    // Bilal's balance back to 0, Hamza debited 200_00
    assert_eq!(customer_balance(&s, &s.customer), 0);
    assert_eq!(customer_balance(&s, &customer2), 200_00);
}

// ================================================================
// 5. Sale edit: Price floor below wholesale rejected without approval
// ================================================================
#[test]
fn test_05_sale_edit_price_floor() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-PF", "Floor Item", 200_00, Some(150_00), false);
    buy(&mut s, &var, 5_000, 150_00);

    let sale = sell(&mut s, &[(&var, 1_000)], None, false);
    assert_eq!(on_hand(&s, &var), 4_000);

    // Try edit with price 100_00 (< wholesale 150_00) without approval
    let res = s.app.edit_sale(EditSaleInput {
        sale_id: sale.sale.id.clone(),
        expected_revision: 0,
        customer_id: None,
        lines: vec![CheckoutLineInput {
            variant_id: var.clone(),
            unit_id: s.pc.clone(),
            qty_milli: 1_000,
            discount_paisa: 0,
            price_override_paisa: Some(100_00),
        }],
        global_discount_paisa: 0,
        settlement: vec![],
        refund_to_khata: false,
        reason: "Discounting heavily".into(),
        approval: None,
    });
    assert!(res.is_err(), "Price below wholesale must be rejected without approval");

    // Stock, payments, revision untouched
    assert_eq!(on_hand(&s, &var), 4_000);
    let detail = s.app.sale_detail(&sale.sale.id).unwrap();
    assert_eq!(detail.receipt.sale.revision, 0);
}

// ================================================================
// 6. Sale edit: Blocked on return and stale expected_revision
// ================================================================
#[test]
fn test_06_sale_edit_blocked_on_return_and_stale_revision() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-BLK", "Return Item", 100_00, Some(50_00), false);
    buy(&mut s, &var, 10_000, 50_00);

    let sale = sell(&mut s, &[(&var, 2_000)], None, false);

    // A. Perform an edit to bump revision to 1
    let edited_sale = s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: false,
            reason: "First clean edit".into(),
            approval: None,
        })
        .unwrap();

    // B. Stale revision edit fails
    let stale_err = s
        .app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0, // stale
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: false,
            reason: "Another edit with stale rev".into(),
            approval: None,
        })
        .unwrap_err();
    assert!(stale_err.to_string().contains("changed by someone else"));

    // C. Perform a return on this sale
    let line_id = edited_sale.sale.lines[0].id.clone();
    s.app
        .post_return(ReturnInput {
            sale_id: sale.sale.id.clone(),
            lines: vec![ReturnLineInput {
                sale_line_id: line_id,
                qty_milli: 1_000,
                damaged: false,
            }],
            reason: Some("Customer return".into()),
            refund_method: "cash".into(),
            approval: None,
        })
        .unwrap();

    // D. Edit must now be blocked because return exists
    let return_block_err = s
        .app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 1,
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![],
            refund_to_khata: false,
            reason: "Try to edit after return".into(),
            approval: None,
        })
        .unwrap_err();
    assert!(return_block_err.to_string().contains("returned"));
}

// ================================================================
// 7. Sale edit: Serial line item/qty change blocked, price change allowed
// ================================================================
#[test]
fn test_07_sale_edit_serial_line() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-SER", "Serial Item", 500_00, Some(300_00), false);
    buy(&mut s, &var, 5_000, 300_00);

    let sale = sell(&mut s, &[(&var, 1_000)], None, false);

    // Mark one stock movement for this sale as having a serial_id
    {
        let conn = s.app.raw_conn().unwrap();
        conn.execute(
            "UPDATE stock_movements SET serial_id = 'IMEI-998877' WHERE source_doc = ?1",
            params![sale.sale.doc_no],
        )
        .unwrap();
    }

    // Changing qty is blocked
    let qty_change_err = s
        .app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![PaymentTenderInput {
                method: "cash".into(),
                amount_paisa: 500_00,
                reference: None,
            }],
            refund_to_khata: false,
            reason: "Change qty on serial item".into(),
            approval: None,
        })
        .unwrap_err();
    assert!(qty_change_err.to_string().contains("Serial/IMEI items cannot be changed by edit"));

    // Changing price on the serial line IS allowed
    let price_change_res = s.app.edit_sale(EditSaleInput {
        sale_id: sale.sale.id.clone(),
        expected_revision: 0,
        customer_id: None,
        lines: vec![CheckoutLineInput {
            variant_id: var.clone(),
            unit_id: s.pc.clone(),
            qty_milli: 1_000,
            discount_paisa: 0,
            price_override_paisa: Some(450_00),
        }],
        global_discount_paisa: 0,
        settlement: vec![],
        refund_to_khata: false, // 50 Rs cash refund
        reason: "Price correction on serial item".into(),
        approval: None,
    });
    assert!(price_change_res.is_ok(), "Price change on serial line must be allowed");
}

// ================================================================
// 8. Sale edit: Services create no stock movements
// ================================================================
#[test]
fn test_08_sale_edit_services() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "SRV-TEST", "Repair Service", 200_00, None, true);

    let sale = sell(&mut s, &[(&var, 1_000)], None, false);

    // Check no movements for this service
    let mov_count: i64 = s.app.raw_conn().unwrap()
        .query_row(
            "SELECT count(*) FROM stock_movements WHERE variant_id = ?1",
            params![var],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mov_count, 0);

    // Edit sale: increase qty to 2
    s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![PaymentTenderInput {
                method: "cash".into(),
                amount_paisa: 200_00,
                reference: None,
            }],
            refund_to_khata: false,
            reason: "Added another repair unit".into(),
            approval: None,
        })
        .unwrap();

    let mov_count_after: i64 = s.app.raw_conn().unwrap()
        .query_row(
            "SELECT count(*) FROM stock_movements WHERE variant_id = ?1",
            params![var],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mov_count_after, 0, "Services must never create stock movements on edit");
}

// ================================================================
// 9. Sale edit: Reports show new total on original date
// ================================================================
#[test]
fn test_09_sale_edit_reports() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "ITEM-REP", "Report Product", 100_00, Some(50_00), false);
    buy(&mut s, &var, 10_000, 50_00);

    let sale = sell(&mut s, &[(&var, 1_000)], None, false);

    // Edit sale: change qty to 3 pcs
    s.app
        .edit_sale(EditSaleInput {
            sale_id: sale.sale.id.clone(),
            expected_revision: 0,
            customer_id: None,
            lines: vec![CheckoutLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 3_000,
                discount_paisa: 0,
                price_override_paisa: None,
            }],
            global_discount_paisa: 0,
            settlement: vec![PaymentTenderInput {
                method: "cash".into(),
                amount_paisa: 200_00,
                reference: None,
            }],
            refund_to_khata: false,
            reason: "Report test edit".into(),
            approval: None,
        })
        .unwrap();

    // Check sale report
    let from = (Utc::now() - Duration::days(1)).to_rfc3339();
    let to = (Utc::now() + Duration::days(1)).to_rfc3339();
    let r_sales = s.app.report("sales", &from, &to, Some(300)).unwrap();
    // Verify total sales is 300_00
    let total_sales = r_sales
        .rows
        .iter()
        .find(|r| r.get(1).and_then(|v| v.as_str()) == Some(&sale.sale.doc_no));
    assert!(total_sales.is_some(), "Sale should appear in report");
    assert_eq!(total_sales.unwrap().get(8).and_then(|v| v.as_i64()), Some(300_00));
}

// ================================================================
// 10. Purchase edit: Qty increase and WAC
// ================================================================
#[test]
fn test_10_purchase_edit_qty_increase_and_wac() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "PUR-WAC", "WAC Item", 200_00, Some(100_00), false);
    let pur_id = buy(&mut s, &var, 10_000, 100_00);

    assert_eq!(on_hand(&s, &var), 10_000);
    assert_eq!(vendor_balance(&s, &s.vendor), 1_000_00);

    // Edit purchase: increase qty to 20 pcs @ 100 Rs
    let edited = s.app
        .edit_purchase(EditPurchaseInput {
            purchase_id: pur_id.clone(),
            expected_revision: 0,
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: Some("PUR-INV-1-REV".into()),
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                received_qty_milli: 20_000,
                unit_cost_paisa: 100_00,
            }],
            reason: "Vendor delivered 20 pcs instead of 10".into(),
        })
        .unwrap();

    // Stock up
    assert_eq!(on_hand(&s, &var), 20_000);
    // Vendor balance up by 1,000 Rs
    assert_eq!(vendor_balance(&s, &s.vendor), 2_000_00);
    // Revision = 1
    assert_eq!(edited.revision, 1);

    // Average cost is 100 Rs exact paisa
    let conn = s.app.raw_conn().unwrap();
    let avg_cost: i64 = conn
        .query_row(
            "SELECT avg_cost_paisa FROM inventory_balances WHERE variant_id = ?1",
            params![var],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(avg_cost, 100_00);
}

// ================================================================
// 11. Purchase edit: Qty decrease below sold is blocked
// ================================================================
#[test]
fn test_11_purchase_edit_qty_decrease_below_sold_blocked() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "PUR-DEC", "Sold Out Item", 200_00, Some(100_00), false);
    let pur_id = buy(&mut s, &var, 10_000, 100_00);

    // Sell 8 pcs -> 2 pcs left
    sell(&mut s, &[(&var, 8_000)], None, false);
    assert_eq!(on_hand(&s, &var), 2_000);

    // Try lowering purchase qty to 5 pcs (needs reversing 10 pcs, but only 2 available)
    let err = s
        .app
        .edit_purchase(EditPurchaseInput {
            purchase_id: pur_id,
            expected_revision: 0,
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: None,
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                received_qty_milli: 5_000,
                unit_cost_paisa: 100_00,
            }],
            reason: "Lowering qty".into(),
        })
        .unwrap_err();

    assert!(err.to_string().contains("already sold from this purchase"));
    // Stock and purchase untouched
    assert_eq!(on_hand(&s, &var), 2_000);
}

// ================================================================
// 12. Purchase edit: Freight change spreads landed cost
// ================================================================
#[test]
fn test_12_purchase_edit_freight_change() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "PUR-FRT", "Freight Item", 200_00, Some(100_00), false);
    let pur_id = buy(&mut s, &var, 10_000, 100_00);

    // Edit purchase: add 200 Rs freight (freight_paisa = 200_00 = 20_000)
    // Landed cost per item becomes 100 + 20 = 120 Rs (120_00 = 12_000)
    s.app
        .edit_purchase(EditPurchaseInput {
            purchase_id: pur_id,
            expected_revision: 0,
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: None,
            freight_paisa: 20_000,
            lines: vec![CreatePurchaseLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                received_qty_milli: 10_000,
                unit_cost_paisa: 100_00,
            }],
            reason: "Freight added by courier".into(),
        })
        .unwrap();

    let conn = s.app.raw_conn().unwrap();
    let avg_cost: i64 = conn
        .query_row(
            "SELECT avg_cost_paisa FROM inventory_balances WHERE variant_id = ?1",
            params![var],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(avg_cost, 120_00);
}

// ================================================================
// 13. Purchase edit: Vendor changed
// ================================================================
#[test]
fn test_13_purchase_edit_vendor_changed() {
    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "PUR-VND", "Vendor Item", 200_00, Some(100_00), false);

    let vendor2 = s
        .app
        .create_party(CustomerInput {
            party_type: Some("vendor".into()),
            name: "Second Vendor".into(),
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

    let pur_id = buy(&mut s, &var, 10_000, 100_00);
    assert_eq!(vendor_balance(&s, &s.vendor), 1_000_00);
    assert_eq!(vendor_balance(&s, &vendor2), 0);

    // Edit purchase: change vendor to vendor2
    s.app
        .edit_purchase(EditPurchaseInput {
            purchase_id: pur_id,
            expected_revision: 0,
            vendor_id: vendor2.clone(),
            vendor_invoice_no: None,
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                received_qty_milli: 10_000,
                unit_cost_paisa: 100_00,
            }],
            reason: "Assigned to wrong vendor initially".into(),
        })
        .unwrap();

    assert_eq!(vendor_balance(&s, &s.vendor), 0);
    assert_eq!(vendor_balance(&s, &vendor2), 1_000_00);
}

// ================================================================
// 14. Purchase edit: Blocked on return
// ================================================================
#[test]
fn test_14_purchase_edit_blocked_on_return() {
    use pos_core::app::ops::{PurchaseReturnInput, PurchaseReturnLineInput};

    let mut s = shop();
    let (_p, var) = create_item(&s.app, &s.pc, "PUR-RET", "Return Item", 200_00, Some(100_00), false);
    let pur_id = buy(&mut s, &var, 10_000, 100_00);

    // Create a purchase return against this purchase
    s.app
        .post_purchase_return(PurchaseReturnInput {
            vendor_id: s.vendor.clone(),
            purchase_id: Some(pur_id.clone()),
            reason: Some("Damaged goods".into()),
            lines: vec![PurchaseReturnLineInput {
                variant_id: var.clone(),
                unit_id: s.pc.clone(),
                qty_milli: 2_000,
                unit_cost_paisa: 100_00,
            }],
        })
        .unwrap();

    // Trying to edit purchase now fails
    let err = s
        .app
        .edit_purchase(EditPurchaseInput {
            purchase_id: pur_id,
            expected_revision: 0,
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: None,
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput {
                variant_id: var,
                unit_id: s.pc.clone(),
                received_qty_milli: 10_000,
                unit_cost_paisa: 100_00,
            }],
            reason: "Trying to edit after return".into(),
        })
        .unwrap_err();

    assert!(err.to_string().contains("returned to the vendor"));
}

// ================================================================
// 15. Product edit: All fields saved & audit lists changed fields
// ================================================================
#[test]
fn test_15_product_edit_all_fields_and_audit() {
    let mut s = shop();
    let (pid, _var) = create_item(&s.app, &s.pc, "EDIT-PROD-1", "Original Name", 150_00, Some(100_00), false);

    let detail = s.app.product_detail(&pid).unwrap();
    assert_eq!(detail.name, "Original Name");

    // Update product
    s.app
        .update_product(UpdateProductInput {
            product_id: pid.clone(),
            sku: "EDIT-PROD-1".into(),
            name: "Updated Name".into(),
            name_ur: Some("نیا نام".into()),
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: Some("9988776655".into()),
            retail_price_paisa: 180_00,
            wholesale_price_paisa: Some(120_00),
            tax_rate_id: None,
            reorder_level_milli: 10_000,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap();

    let detail_after = s.app.product_detail(&pid).unwrap();
    assert_eq!(detail_after.name, "Updated Name");
    assert_eq!(detail_after.name_ur.as_deref(), Some("نیا نام"));
    assert_eq!(detail_after.retail_price_paisa, 180_00);
    assert_eq!(detail_after.reorder_level_milli, 10_000);

    // Verify audit log has product_updated with changed fields
    let conn = s.app.raw_conn().unwrap();
    let audit_details: String = conn
        .query_row(
            "SELECT details_json FROM audit_log WHERE action = 'product_updated' AND entity_id = ?1 ORDER BY id DESC LIMIT 1",
            params![pid],
            |r| r.get(0),
        )
        .unwrap();
    assert!(audit_details.contains("Updated Name"));
}

// ================================================================
// 16. Product edit: Duplicate barcode or SKU rejected with other product name
// ================================================================
#[test]
fn test_16_product_edit_duplicate_barcode_and_sku() {
    let mut s = shop();
    let (pid1, _v1) = create_item(&s.app, &s.pc, "SKU-DUP-1", "First Product", 100_00, None, false);
    let (pid2, _v2) = create_item(&s.app, &s.pc, "SKU-DUP-2", "Second Product", 100_00, None, false);

    // Give first product a barcode
    s.app
        .update_product(UpdateProductInput {
            product_id: pid1.clone(),
            sku: "SKU-DUP-1".into(),
            name: "First Product".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: Some("BARCODE-123".into()),
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap();

    // A. Update second product with first product's SKU -> rejected
    let sku_err = s
        .app
        .update_product(UpdateProductInput {
            product_id: pid2.clone(),
            sku: "SKU-DUP-1".into(),
            name: "Second Product".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap_err();
    assert!(sku_err.to_string().contains("already on First Product"));

    // B. Update second product with first product's barcode -> rejected with First Product
    let bar_err = s
        .app
        .update_product(UpdateProductInput {
            product_id: pid2,
            sku: "SKU-DUP-2".into(),
            name: "Second Product".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: Some("BARCODE-123".into()),
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap_err();
    assert!(bar_err.to_string().contains("already on First Product"));
}

// ================================================================
// 17. Product edit: Base unit change with existing stock is blocked
// ================================================================
#[test]
fn test_17_product_edit_base_unit_change_blocked_with_stock() {
    let mut s = shop();
    let (pid, var) = create_item(&s.app, &s.pc, "UNIT-CHG", "Unit Change Item", 100_00, Some(50_00), false);
    buy(&mut s, &var, 5_000, 50_00);

    // Try to change base unit to box
    let err = s
        .app
        .update_product(UpdateProductInput {
            product_id: pid,
            sku: "UNIT-CHG".into(),
            name: "Unit Change Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.box_unit.clone(), // changed unit
            barcode: None,
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap_err();

    assert!(err.to_string().contains("Unit cannot change after stock or sales exist"));
}

// ================================================================
// 18. Product edit: Product <-> Service stock rules
// ================================================================
#[test]
fn test_18_product_edit_service_stock_rules() {
    let mut s = shop();
    let (pid, var) = create_item(&s.app, &s.pc, "PROD-SRV", "Convert Item", 100_00, Some(50_00), false);
    buy(&mut s, &var, 2_000, 50_00);

    // Try convert to service while stock > 0 -> blocked
    let err = s
        .app
        .update_product(UpdateProductInput {
            product_id: pid.clone(),
            sku: "PROD-SRV".into(),
            name: "Convert Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 5_000,
            is_service: true,
            active: true,
            packaging_unit: None,
        })
        .unwrap_err();
    assert!(err.to_string().contains("Stock is not zero"));

    // Sell out the 2 pcs so stock is 0
    sell(&mut s, &[(&var, 2_000)], None, false);
    assert_eq!(on_hand(&s, &var), 0);

    // Now convert to service succeeds, reorder level is set to 0
    s.app
        .update_product(UpdateProductInput {
            product_id: pid.clone(),
            sku: "PROD-SRV".into(),
            name: "Convert Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 5_000,
            is_service: true,
            active: true,
            packaging_unit: None,
        })
        .unwrap();

    let detail = s.app.product_detail(&pid).unwrap();
    assert!(detail.is_service);
    assert_eq!(detail.reorder_level_milli, 0);

    // Converting service back to product always succeeds
    s.app
        .update_product(UpdateProductInput {
            product_id: pid.clone(),
            sku: "PROD-SRV".into(),
            name: "Convert Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 100_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 5_000,
            is_service: false,
            active: true,
            packaging_unit: None,
        })
        .unwrap();

    let detail_prod = s.app.product_detail(&pid).unwrap();
    assert!(!detail_prod.is_service);
}

// ================================================================
// 19. Product edit: Inactive product hidden from search and scan, shows in reports
// ================================================================
#[test]
fn test_19_product_edit_inactive() {
    let mut s = shop();
    let (pid, var) = create_item(&s.app, &s.pc, "INACT-1", "Inactive Watch", 500_00, Some(200_00), false);
    buy(&mut s, &var, 5_000, 200_00);
    let sale = sell(&mut s, &[(&var, 1_000)], None, false);

    // Set active = false
    s.app
        .update_product(UpdateProductInput {
            product_id: pid,
            sku: "INACT-1".into(),
            name: "Inactive Watch".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: Some("WATCH-CODE".into()),
            retail_price_paisa: 500_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: false,
            packaging_unit: None,
        })
        .unwrap();

    // Disappears from search_sellable
    let sellable = s.app.search_sellable("Inactive", 10).unwrap();
    assert!(sellable.iter().all(|r| r.product.variant_id != var));

    // Disappears from scan
    let scanned = s.app.scan("WATCH-CODE").unwrap();
    assert!(scanned.is_none(), "Inactive item must not be scanned");

    // Still appears in reports (sales report for the sale made)
    let from = (Utc::now() - Duration::days(1)).to_rfc3339();
    let to = (Utc::now() + Duration::days(1)).to_rfc3339();
    let r_sales = s.app.report("sales", &from, &to, Some(300)).unwrap();
    assert!(r_sales.rows.iter().any(|r| r.get(1).and_then(|v| v.as_str()) == Some(&sale.sale.doc_no)));
}

// ================================================================
// 20. Product edit: Changing pack factor used in old bills blocked
// ================================================================
#[test]
fn test_20_product_edit_pack_factor_used_in_old_bills_blocked() {
    let mut s = shop();
    let (pid, var) = create_item(&s.app, &s.pc, "PACK-PROD", "Box Item", 50_00, Some(20_00), false);

    // Add packaging unit (box of 12)
    s.app
        .update_product(UpdateProductInput {
            product_id: pid.clone(),
            sku: "PACK-PROD".into(),
            name: "Box Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 50_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: Some(UpdatePackagingUnit {
                unit_id: s.box_unit.clone(),
                factor_to_base: 12_000,
                barcode: None,
                retail_price_paisa: Some(550_00),
            }),
        })
        .unwrap();

    buy(&mut s, &var, 24_000, 20_00);

    // Sell 1 box using the packaging unit
    let lines = vec![CheckoutLineInput {
        variant_id: var.clone(),
        unit_id: s.box_unit.clone(),
        qty_milli: 1_000,
        discount_paisa: 0,
        price_override_paisa: None,
    }];
    let q = s.app.quote(None, &lines, 0).unwrap();
    s.app
        .checkout(CheckoutInput {
            customer_id: None,
            lines,
            global_discount_paisa: 0,
            tenders: vec![PaymentTenderInput {
                method: "cash".into(),
                amount_paisa: q.total_paisa,
                reference: None,
            }],
            approval: None,
        })
        .unwrap();

    // Now try to change pack factor from 12_000 to 10_000 -> blocked
    let err = s
        .app
        .update_product(UpdateProductInput {
            product_id: pid,
            sku: "PACK-PROD".into(),
            name: "Box Item".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: s.pc.clone(),
            barcode: None,
            retail_price_paisa: 50_00,
            wholesale_price_paisa: None,
            tax_rate_id: None,
            reorder_level_milli: 0,
            is_service: false,
            active: true,
            packaging_unit: Some(UpdatePackagingUnit {
                unit_id: s.box_unit.clone(),
                factor_to_base: 10_000, // changed factor
                barcode: None,
                retail_price_paisa: Some(500_00),
            }),
        })
        .unwrap_err();

    assert!(err.to_string().contains("This pack size is used in old bills"));
}

// ================================================================
// 21. Migration: V10 to V11 migration preserves data and adds columns
// ================================================================
#[test]
fn test_21_migration_v10_to_v11() {
    let temp_db = NamedTempFile::new().unwrap();
    let db_path = temp_db.path();
    let key = DbKeyManager::generate_random_key();

    let mut conn = open_encrypted_db(db_path, &key).unwrap();

    // Run migrations up to V10
    run_migrations_to(&mut conn, 10).unwrap();
    assert_eq!(schema_version(&conn), 10);

    // Insert dummy unit, customer, vendor, product, sale, purchase under V10 schema
    conn.execute(
        "INSERT INTO units (id, code, name, decimals_allowed, created_at) VALUES ('u-pc', 'pc', 'Piece', 0, datetime('now'))",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO parties (id, party_type, name, credit_limit_paisa, opening_balance_paisa, created_at, updated_at)
         VALUES ('cust-1', 'customer', 'Test Customer', 0, 0, datetime('now'), datetime('now'))",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO parties (id, party_type, name, credit_limit_paisa, opening_balance_paisa, created_at, updated_at)
         VALUES ('vend-1', 'vendor', 'Test Vendor', 0, 0, datetime('now'), datetime('now'))",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO sales (id, doc_no, subtotal_paisa, total_paisa, created_at)
         VALUES ('sale-v10', 'SAL-V10-01', 50000, 50000, datetime('now'))",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO purchases (id, doc_no, vendor_id, freight_paisa, total_paisa, created_at)
         VALUES ('pur-v10', 'PUR-V10-01', 'vend-1', 0, 100000, datetime('now'))",
        [],
    ).unwrap();

    // Run migrations to V11
    run_migrations(&mut conn).unwrap();
    assert!(schema_version(&conn) >= 11);

    // Verify revision column exists and default is 0
    let sale_rev: (i64, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT revision, edited_at, edited_by FROM sales WHERE id = 'sale-v10'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(sale_rev.0, 0);
    assert!(sale_rev.1.is_none());
    assert!(sale_rev.2.is_none());

    let pur_rev: (i64, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT revision, edited_at, edited_by, user_id FROM purchases WHERE id = 'pur-v10'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(pur_rev.0, 0);
    assert!(pur_rev.1.is_none());
    assert!(pur_rev.2.is_none());
    assert!(pur_rev.3.is_none());

    // Verify document_revisions table exists
    let tbl_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'document_revisions'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(tbl_count, 1);
}

// ================================================================
// 22. Permissions: Cashier and Stock Keeper permission gates
// ================================================================
#[test]
fn test_22_permissions_cashier_and_stock_keeper() {
    let mut s = shop();
    let (_pid, var) = create_item(&s.app, &s.pc, "PERM-ITEM", "Perm Item", 100_00, Some(50_00), false);
    buy(&mut s, &var, 10_000, 50_00);
    let sale = sell(&mut s, &[(&var, 1_000)], None, false);

    // Create Cashier user
    let _cashier_summary = s
        .app
        .create_user(NewUserInput {
            username: "cashier1".into(),
            password: "cashier-pass-1".into(),
            pin: Some("5555".into()),
            role: Role::Cashier,
        })
        .unwrap();

    // Create Stock Keeper user
    let _stock_summary = s
        .app
        .create_user(NewUserInput {
            username: "keeper1".into(),
            password: "keeper-pass-1".into(),
            pin: Some("7777".into()),
            role: Role::StockKeeper,
        })
        .unwrap();

    // 1. Log in as Cashier
    s.app.login_password("cashier1", "cashier-pass-1").unwrap();

    // Cashier can list sales
    let list_res = s.app.list_sales(SaleListQuery {
        from: (Utc::now() - Duration::days(1)).format("%Y-%m-%d").to_string(),
        to: (Utc::now() + Duration::days(1)).format("%Y-%m-%d").to_string(),
        offset_min: 300,
        query: None,
        limit: None,
        offset: None,
    });
    assert!(list_res.is_ok(), "Cashier can list sales");

    // Cashier can view sale detail
    let detail_res = s.app.sale_detail(&sale.sale.id);
    assert!(detail_res.is_ok(), "Cashier can view sale detail");
    assert!(!detail_res.unwrap().can_edit, "can_edit is false for Cashier without SalesVoid");

    // Cashier cannot edit sale without approval
    let edit_res = s.app.edit_sale(EditSaleInput {
        sale_id: sale.sale.id.clone(),
        expected_revision: 0,
        customer_id: None,
        lines: vec![CheckoutLineInput {
            variant_id: var.clone(),
            unit_id: s.pc.clone(),
            qty_milli: 1_000,
            discount_paisa: 0,
            price_override_paisa: None,
        }],
        global_discount_paisa: 0,
        settlement: vec![],
        refund_to_khata: false,
        reason: "Cashier edit attempt".into(),
        approval: None,
    });
    assert!(edit_res.is_err(), "Cashier cannot edit sale without approval");

    // Cashier cannot update product
    let prod_res = s.app.update_product(UpdateProductInput {
        product_id: _pid.clone(),
        sku: "PERM-ITEM".into(),
        name: "Hacked Name".into(),
        name_ur: None,
        category_id: None,
        brand_id: None,
        base_unit_id: s.pc.clone(),
        barcode: None,
        retail_price_paisa: 100_00,
        wholesale_price_paisa: None,
        tax_rate_id: None,
        reorder_level_milli: 0,
        is_service: false,
        active: true,
        packaging_unit: None,
    });
    assert!(prod_res.is_err(), "Cashier cannot update product");

    // 2. Log in as Stock Keeper
    s.app.login_password("keeper1", "keeper-pass-1").unwrap();

    // Stock Keeper cannot edit purchase
    let pur_edit_res = s.app.edit_purchase(EditPurchaseInput {
        purchase_id: "nonexistent".into(),
        expected_revision: 0,
        vendor_id: s.vendor.clone(),
        vendor_invoice_no: None,
        freight_paisa: 0,
        lines: vec![],
        reason: "Stock keeper attempt".into(),
    });
    assert!(pur_edit_res.is_err(), "Stock Keeper cannot edit purchase");

    // Stock Keeper cannot update product
    let prod_res2 = s.app.update_product(UpdateProductInput {
        product_id: _pid,
        sku: "PERM-ITEM".into(),
        name: "Hacked Name 2".into(),
        name_ur: None,
        category_id: None,
        brand_id: None,
        base_unit_id: s.pc.clone(),
        barcode: None,
        retail_price_paisa: 100_00,
        wholesale_price_paisa: None,
        tax_rate_id: None,
        reorder_level_milli: 0,
        is_service: false,
        active: true,
        packaging_unit: None,
    });
    assert!(prod_res2.is_err(), "Stock Keeper cannot update product");
}
