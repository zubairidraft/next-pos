//! Services, purchase returns, claims and the reports.

use chrono::{Duration, Utc};
use pos_core::app::ops::{ClaimInput, PurchaseReturnInput, PurchaseReturnLineInput};
use pos_core::app::*;
use pos_core::auth::Role;
use pos_core::domain::catalog::CreateProductParams;
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput};
use pos_core::domain::sale::PaymentTenderInput;
use tempfile::TempDir;

struct Shop {
    app: PosApp,
    _dir: TempDir,
    pc: String,
    vendor: String,
    customer: String,
}

fn product(app: &PosApp, pc: &str, sku: &str, name: &str, retail: i64, wholesale: Option<i64>, service: bool) -> String {
    app.create_item(
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
    .unwrap()
    .variant_id
}

fn shop() -> Shop {
    let dir = TempDir::new().unwrap();
    let mut app = PosApp::open_with_machine(dir.path(), "KPOS-AAAA-BBBB-CCCC-DDDD".into()).unwrap();
    app.setup_first_run(
        StoreSetupInput { name: "Madina Store".into(), name_ur: None, address: None, phone: None, ntn: None, strn: None, tax_mode: None, enabled_packs: vec![], demo_catalog: false },
        OwnerSetupInput { username: "owner".into(), password: "owner-pass-1".into(), pin: Some("1234".into()) },
    )
    .unwrap();
    let pc = app.list_units().unwrap().into_iter().find(|u| u.code == "pc").unwrap().id;
    let vendor = app
        .create_party(CustomerInput { party_type: Some("vendor".into()), name: "Ali Traders".into(), name_ur: None, phone: None, cnic: None, ntn: None, credit_limit_paisa: 0, opening_balance_paisa: 0, price_list_id: None })
        .unwrap()
        .id;
    let customer = app
        .create_party(CustomerInput { party_type: Some("customer".into()), name: "Bilal".into(), name_ur: None, phone: Some("03001112222".into()), cnic: None, ntn: None, credit_limit_paisa: 10_000_00, opening_balance_paisa: 0, price_list_id: None })
        .unwrap()
        .id;
    app.start_shift(0).unwrap();
    Shop { app, _dir: dir, pc, vendor, customer }
}

fn buy(s: &mut Shop, variant: &str, qty: i64, cost: i64) {
    s.app
        .post_purchase(CreatePurchaseInput {
            vendor_id: s.vendor.clone(),
            vendor_invoice_no: Some("B-1".into()),
            freight_paisa: 0,
            lines: vec![CreatePurchaseLineInput { variant_id: variant.into(), unit_id: s.pc.clone(), received_qty_milli: qty, unit_cost_paisa: cost }],
            user_id: None,
        })
        .unwrap();
}

fn sell(s: &mut Shop, lines: &[(&str, i64)], customer: Option<String>, credit: bool) -> ReceiptData {
    let lines: Vec<CheckoutLineInput> = lines.iter().map(|(v, q)| CheckoutLineInput { variant_id: v.to_string(), unit_id: s.pc.clone(), qty_milli: *q, discount_paisa: 0, price_override_paisa: None }).collect();
    let q = s.app.quote(customer.as_deref(), &lines, 0).unwrap();
    let tender = PaymentTenderInput { method: if credit { "credit".into() } else { "cash".into() }, amount_paisa: q.total_paisa, reference: None };
    s.app.checkout(CheckoutInput { customer_id: customer, lines, global_discount_paisa: 0, tenders: vec![tender], approval: None }).unwrap()
}

fn on_hand(s: &Shop, v: &str) -> i64 {
    s.app.stock_list().unwrap().into_iter().find(|b| b.variant_id == v).map(|b| b.on_hand_milli).unwrap_or(0)
}

fn vendor_balance(s: &Shop) -> i64 {
    s.app.list_vendors("").unwrap().into_iter().find(|v| v.id == s.vendor).unwrap().balance_paisa
}

fn period() -> (String, String) {
    ((Utc::now() - Duration::days(1)).to_rfc3339(), (Utc::now() + Duration::minutes(1)).to_rfc3339())
}

#[test]
fn services_sell_without_stock_and_stay_out_of_stock_lists() {
    let mut s = shop();
    let fit = product(&s.app, &s.pc, "SRV-FIT", "Fitting charges", 50_000, None, true);
    let rows = s.app.search_sellable("fitting", 10).unwrap();
    assert_eq!(rows.len(), 1, "services show in sale search with no stock");
    assert!(rows[0].is_service);
    assert!(s.app.scan("SRV-FIT").unwrap().is_some(), "scanning a service works with no stock");
    let r = sell(&mut s, &[(&fit, 2000)], None, false);
    assert_eq!(r.sale.total_paisa, 100_000);
    assert!(s.app.stock_list().unwrap().iter().all(|b| b.variant_id != fit), "no stock line for services");
    let e = s
        .app
        .post_purchase(CreatePurchaseInput { vendor_id: s.vendor.clone(), vendor_invoice_no: None, freight_paisa: 0, lines: vec![CreatePurchaseLineInput { variant_id: fit.clone(), unit_id: s.pc.clone(), received_qty_milli: 1000, unit_cost_paisa: 1 }], user_id: None })
        .unwrap_err();
    assert!(e.to_string().contains("service"));
    let (f, t) = period();
    let rep = s.app.report("services", &f, &t, Some(300)).unwrap();
    assert_eq!(rep.rows.len(), 1);
    assert_eq!(rep.rows[0][3], 100_000);
    // A service sale has no cost: all of it is profit.
    let p = s.app.report("profit", &f, &t, Some(300)).unwrap();
    assert_eq!(p.rows[0][5], 100_000);
    // Returning a service puts nothing in stock.
    let sale = s.app.find_sale_for_return(&r.sale.doc_no).unwrap();
    s.app.post_return(ReturnInput { sale_id: sale.id.clone(), lines: vec![ReturnLineInput { sale_line_id: sale.lines[0].sale_line_id.clone(), qty_milli: 1000, damaged: false }], reason: None, refund_method: "cash".into(), approval: None }).unwrap();
    assert!(s.app.stock_list().unwrap().iter().all(|b| b.variant_id != fit));
}

#[test]
fn purchase_return_takes_stock_out_and_lowers_what_we_owe() {
    let mut s = shop();
    let oil = product(&s.app, &s.pc, "OIL-1L", "Cooking oil 1L", 60_000, Some(55_000), false);
    buy(&mut s, &oil, 10_000, 50_000);
    assert_eq!(vendor_balance(&s), 500_000);
    let r = s
        .app
        .post_purchase_return(PurchaseReturnInput { vendor_id: s.vendor.clone(), purchase_id: None, reason: Some("Leaking".into()), lines: vec![PurchaseReturnLineInput { variant_id: oil.clone(), unit_id: s.pc.clone(), qty_milli: 2_000, unit_cost_paisa: 50_000 }] })
        .unwrap();
    assert!(r.doc_no.starts_with("PRT-"));
    assert_eq!(r.total_paisa, 100_000);
    assert_eq!(on_hand(&s, &oil), 8_000);
    assert_eq!(vendor_balance(&s), 400_000);
    // Cannot send back more than is in stock.
    assert!(s
        .app
        .post_purchase_return(PurchaseReturnInput { vendor_id: s.vendor.clone(), purchase_id: None, reason: None, lines: vec![PurchaseReturnLineInput { variant_id: oil.clone(), unit_id: s.pc.clone(), qty_milli: 9_000, unit_cost_paisa: 50_000 }] })
        .is_err());
    let (f, t) = period();
    let rep = s.app.report("purchase_returns", &f, &t, None).unwrap();
    assert_eq!(rep.rows.len(), 1);
    assert_eq!(rep.totals[5], 100_000);
    let pur = s.app.report("purchases", &f, &t, None).unwrap();
    assert!(pur.summary.iter().any(|x| x.label == "Net purchases" && x.value == 400_000));
    assert_eq!(s.app.list_purchase_returns(10).unwrap()[0].lines[0].qty_milli, 2_000);
}

#[test]
fn claims_move_stock_and_vendor_balance_correctly() {
    let mut s = shop();
    let oil = product(&s.app, &s.pc, "OIL-1L", "Cooking oil 1L", 60_000, Some(55_000), false);
    buy(&mut s, &oil, 10_000, 50_000);

    // Damaged stock leaves sellable stock at once.
    let c = s.app.create_claim(ClaimInput { kind: "damaged".into(), variant_id: oil.clone(), qty_milli: 2_000, customer_id: None, vendor_id: Some(s.vendor.clone()), serial: None, sale_doc: None, notes: Some("Broken in transport".into()) }).unwrap();
    assert_eq!(c.status, "open");
    assert_eq!(c.value_paisa, 100_000);
    assert_eq!(on_hand(&s, &oil), 8_000);
    s.app.update_claim(&c.id, "sent", Some("Given to Ali".into()), None).unwrap();
    let done = s.app.update_claim(&c.id, "replaced", None, None).unwrap();
    assert_eq!(done.status, "replaced");
    assert_eq!(on_hand(&s, &oil), 10_000, "replaced stock comes back");
    assert!(s.app.update_claim(&c.id, "credited", None, None).is_err(), "a finished claim cannot change result");

    // Expired stock credited by the vendor lowers what we owe.
    let c2 = s.app.create_claim(ClaimInput { kind: "expired".into(), variant_id: oil.clone(), qty_milli: 1_000, customer_id: None, vendor_id: Some(s.vendor.clone()), serial: None, sale_doc: None, notes: None }).unwrap();
    s.app.update_claim(&c2.id, "credited", None, Some(45_000)).unwrap();
    assert_eq!(vendor_balance(&s), 500_000 - 45_000);
    assert_eq!(on_hand(&s, &oil), 9_000);

    // Warranty claim: a customer's item, no stock change.
    let w = s.app.create_claim(ClaimInput { kind: "warranty".into(), variant_id: oil.clone(), qty_milli: 1_000, customer_id: Some(s.customer.clone()), vendor_id: None, serial: Some("SN123".into()), sale_doc: None, notes: None }).unwrap();
    assert_eq!(on_hand(&s, &oil), 9_000);
    assert!(s.app.update_claim(&w.id, "credited", None, None).is_err());
    s.app.update_claim(&w.id, "rejected", None, None).unwrap();
    assert_eq!(s.app.list_claims(Some("open".into())).unwrap().len(), 0);

    let (f, t) = period();
    let rep = s.app.report("claims", &f, &t, None).unwrap();
    assert_eq!(rep.rows.len(), 3);
    assert!(rep.summary.iter().any(|x| x.label == "Still open" && x.value == 0));
}

#[test]
fn reports_add_up_and_respect_roles() {
    let mut s = shop();
    let oil = product(&s.app, &s.pc, "OIL-1L", "Cooking oil 1L", 60_000, Some(55_000), false);
    let rice = product(&s.app, &s.pc, "RICE", "Rice 1kg", 30_000, None, false);
    buy(&mut s, &oil, 10_000, 50_000);
    buy(&mut s, &rice, 4_000, 20_000);
    sell(&mut s, &[(&oil, 2_000), (&rice, 1_000)], None, false); // 1500 sales, 1200 cost
    let cust = s.customer.clone();
    sell(&mut s, &[(&oil, 1_000)], Some(cust), true); // 600 on khata, 500 cost
    s.app.receive_payment(&s.customer.clone(), 40_000, "cash", None).unwrap();

    let (f, t) = period();
    let sales = s.app.report("sales", &f, &t, None).unwrap();
    assert_eq!(sales.rows.len(), 2);
    let ti = sales.columns.iter().position(|c| c.key == "total").unwrap();
    let ki = sales.columns.iter().position(|c| c.key == "khata").unwrap();
    assert_eq!(sales.totals[ti], 210_000);
    assert_eq!(sales.totals[ki], 60_000);

    let profit = s.app.report("profit", &f, &t, None).unwrap();
    assert!(profit.summary.iter().any(|x| x.label == "Net profit" && x.value == 210_000 - 170_000));

    let daily = s.app.report("daily", &f, &t, Some(300)).unwrap();
    let col = |k: &str| daily.columns.iter().position(|c| c.key == k).unwrap();
    assert_eq!(daily.totals[col("sales")], 210_000);
    assert_eq!(daily.totals[col("profit")], 40_000);
    assert_eq!(daily.totals[col("khata")], 60_000);
    assert_eq!(daily.totals[col("recovered")], 40_000);
    assert_eq!(daily.totals[col("purchases")], 580_000);

    let rec = s.app.report("recovery", &f, &t, None).unwrap();
    assert_eq!(rec.rows.len(), 1);
    assert!(rec.summary.iter().any(|x| x.label == "Total due from customers (now)" && x.value == 20_000));

    let stock = s.app.report("stock", &f, &t, None).unwrap();
    let oil_row = stock.rows.iter().find(|r| r[0] == "Cooking oil 1L").unwrap();
    assert_eq!((oil_row[4].as_i64(), oil_row[5].as_i64(), oil_row[6].as_i64()), (Some(10_000), Some(3_000), Some(7_000)));
    let rice_row = stock.rows.iter().find(|r| r[0] == "Rice 1kg").unwrap();
    let sc = |k: &str| stock.columns.iter().position(|c| c.key == k).unwrap();
    assert_eq!(rice_row[sc("status")], "Low", "3 left with alert at 5");
    // Sale price and wholesale price, each in its own column (wholesale blank when not set).
    assert_eq!((oil_row[sc("price")].as_i64(), oil_row[sc("wholesale")].as_i64()), (Some(60_000), Some(55_000)));
    assert_eq!((rice_row[sc("price")].as_i64(), rice_row[sc("wholesale")].is_null()), (Some(30_000), true));

    let sm = s.app.report("salesman", &f, &t, None).unwrap();
    assert_eq!(sm.rows[0][0], "owner");
    assert_eq!(sm.rows[0][1], 2);

    let movers = s.app.report("analysis_movers", &f, &t, None).unwrap();
    assert_eq!(movers.rows[0][0], "Cooking oil 1L");
    let trend = s.app.report("analysis_trend", &f, &t, Some(300)).unwrap();
    assert_eq!(trend.totals[1], 2);
    s.app.report("analysis_margin", &f, &t, None).unwrap();
    assert_eq!(s.app.report("list_products", &f, &t, None).unwrap().rows.len(), 2);
    assert_eq!(s.app.report("list_customers", &f, &t, None).unwrap().totals[4], 20_000);
    assert_eq!(s.app.report("list_vendors", &f, &t, None).unwrap().totals[4], 580_000);
    assert!(!s.app.report("activity", &f, &t, None).unwrap().rows.is_empty());
    assert!(s.app.report("sales", &t, &f, None).is_err(), "to before from");
    assert!(s.app.report("nope", &f, &t, None).is_err());

    // A cashier sees no reports; a manager sees reports but not the activity log.
    s.app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    s.app.create_user(NewUserInput { username: "mgr".into(), password: "manager-pass".into(), pin: Some("7777".into()), role: Role::Manager }).unwrap();
    s.app.logout().unwrap();
    let users = s.app.status().unwrap().users;
    let id = |n: &str| users.iter().find(|u| u.username == n).unwrap().id.clone();
    s.app.login_pin(&id("ali"), "5555").unwrap();
    assert!(s.app.report("sales", &f, &t, None).is_err());
    s.app.logout().unwrap();
    s.app.login_pin(&id("mgr"), "7777").unwrap();
    assert!(s.app.report("sales", &f, &t, None).is_ok());
    assert!(s.app.report("activity", &f, &t, None).is_err());
}
