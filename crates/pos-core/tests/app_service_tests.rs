//! End-to-end tests of the service layer the desktop UI calls (Round 3).

use pos_core::app::*;
use pos_core::auth::Role;
use pos_core::domain::catalog::CreateProductParams;
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput};
use pos_core::domain::sale::PaymentTenderInput;
use tempfile::TempDir;

const MACHINE: &str = "KPOS-AAAA-BBBB-CCCC-DDDD";

fn fresh() -> (PosApp, TempDir) {
    let dir = TempDir::new().unwrap();
    let app = PosApp::open_with_machine(dir.path(), MACHINE.into()).unwrap();
    (app, dir)
}

fn setup(app: &mut PosApp) -> SetupResult {
    app.setup_first_run(
        StoreSetupInput {
            name: "Madina Store".into(),
            name_ur: Some("مدینہ سٹور".into()),
            address: None,
            phone: Some("03001234567".into()),
            ntn: None,
            strn: None,
            tax_mode: None,
            enabled_packs: vec!["grocery".into()],
            demo_catalog: false,
        },
        OwnerSetupInput { username: "owner".into(), password: "owner-pass-1".into(), pin: Some("1234".into()) },
    )
    .unwrap()
}

fn pc_unit(app: &PosApp) -> String {
    app.list_units().unwrap().into_iter().find(|u| u.code == "pc").unwrap().id
}

fn add_product(app: &PosApp, sku: &str, price: i64, barcode: &str, tax: Option<&str>) -> String {
    let unit = pc_unit(app);
    app.create_product(CreateProductParams {
        sku: sku.into(),
        name: format!("Item {}", sku),
        name_ur: None,
        category_id: None,
        brand_id: None,
        base_unit_id: unit,
        hs_code: None,
        tax_rate_id: tax.map(|t| t.to_string()),
        track_mode: None,
        reorder_level_milli: None,
        barcode: Some(barcode.into()),
        retail_price_paisa: price,
        wholesale_price_paisa: None,
        packaging_units: vec![],
    })
    .unwrap()
    .variant_id
}

fn stock(app: &mut PosApp, variant: &str, qty: i64) {
    let vendor = app
        .create_party(CustomerInput {
            party_type: Some("vendor".into()),
            name: format!("Vendor {}", variant),
            name_ur: None,
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: 0,
            opening_balance_paisa: 0,
            price_list_id: None,
        })
        .unwrap();
    let unit = pc_unit(app);
    app.post_purchase(CreatePurchaseInput {
        vendor_id: vendor.id,
        vendor_invoice_no: None,
        freight_paisa: 0,
        lines: vec![CreatePurchaseLineInput { variant_id: variant.into(), unit_id: unit, received_qty_milli: qty * 1000, unit_cost_paisa: 5000 }],
        user_id: None,
    })
    .unwrap();
}

fn cash(amount: i64) -> Vec<PaymentTenderInput> {
    vec![PaymentTenderInput { method: "cash".into(), amount_paisa: amount, reference: None }]
}

#[test]
fn first_run_creates_owner_once_and_returns_recovery_phrase() {
    let (mut app, _d) = fresh();
    let st = app.status().unwrap();
    assert!(st.needs_setup);
    assert!(st.session.is_none());
    let r = setup(&mut app);
    assert_eq!(r.session.role, Role::Owner);
    assert_eq!(r.recovery_phrase.len(), 79);
    let st = app.status().unwrap();
    assert!(!st.needs_setup);
    assert_eq!(st.store_name.as_deref(), Some("Madina Store"));
    assert!(matches!(st.license, pos_core::licensing::LicenseStatus::TrialActive { .. }));
    // Second setup refused.
    let again = app.setup_first_run(
        StoreSetupInput { name: "X".into(), name_ur: None, address: None, phone: None, ntn: None, strn: None, tax_mode: None, enabled_packs: vec![], demo_catalog: false },
        OwnerSetupInput { username: "hacker".into(), password: "password123".into(), pin: None },
    );
    assert!(again.is_err());
}

#[test]
fn nothing_works_without_login_and_cashier_is_limited() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let owner_id = app.status().unwrap().session.unwrap().user_id;
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    app.logout().unwrap();
    assert!(app.search_products("", 10).is_err());
    assert!(app.financial_summary("2026-01-01", "2026-12-31").is_err());

    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();
    assert!(app.login_pin(&ali.id, "0000").is_err());
    app.login_pin(&ali.id, "5555").unwrap();
    assert!(app.search_products("", 10).is_ok());
    assert!(app.financial_summary("2026-01-01", "2026-12-31").is_err(), "cashier must not see reports");
    assert!(app.create_backup(Some("/tmp"), "backup-password").is_err());
    assert!(app.list_users().is_err());
    assert!(app.set_user_active(&owner_id, false).is_err());
}

#[test]
fn checkout_uses_database_prices_and_requires_a_shift() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU1", 25_000, "8961000000011", None);
    stock(&mut app, &v, 10);
    let unit = pc_unit(&app);
    let line = CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 2000, discount_paisa: 0, price_override_paisa: None };

    let q = app.quote(None, &[line.clone()], 0).unwrap();
    assert_eq!(q.total_paisa, 50_000);

    let no_shift = app.checkout(CheckoutInput { customer_id: None, lines: vec![line.clone()], global_discount_paisa: 0, tenders: cash(50_000), approval: None });
    assert!(no_shift.unwrap_err().to_string().contains("shift"));

    app.start_shift(100_000).unwrap();
    let r = app
        .checkout(CheckoutInput { customer_id: None, lines: vec![line.clone()], global_discount_paisa: 0, tenders: cash(60_000), approval: None })
        .unwrap();
    assert_eq!(r.sale.total_paisa, 50_000);
    assert_eq!(r.sale.change_paisa, 10_000);
    assert!(r.trial_watermark);
    assert_eq!(app.search_products("SKU1", 5).unwrap()[0].on_hand_milli, 8000);

    // Scanner finds the item by barcode.
    let s = app.scan("8961000000011").unwrap().unwrap();
    assert_eq!(s.product.variant_id, v);
    assert!(app.scan("0000000").unwrap().is_none());

    // Reprint works from the database.
    let again = app.receipt(&r.sale.id).unwrap();
    assert_eq!(again.sale.doc_no, r.sale.doc_no);
    assert_eq!(again.sale.lines.len(), 1);

    // Z report: blind close.
    let z = app.close_shift(150_000).unwrap();
    assert_eq!(z.expected_cash_paisa, 150_000);
    assert_eq!(z.variance_paisa, 0);
}

#[test]
fn cashier_cannot_change_price_or_discount_without_manager_pin() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let owner_id = app.status().unwrap().session.unwrap().user_id;
    let v = add_product(&app, "SKU2", 10_000, "8961000000028", None);
    stock(&mut app, &v, 5);
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    app.logout().unwrap();
    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();
    app.login_pin(&ali.id, "5555").unwrap();
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);

    let cheap = CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: 0, price_override_paisa: Some(1) };
    let e = app.checkout(CheckoutInput { customer_id: None, lines: vec![cheap.clone()], global_discount_paisa: 0, tenders: cash(1), approval: None });
    assert!(e.is_err());

    let disc = CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: 2000, price_override_paisa: None };
    assert!(app.checkout(CheckoutInput { customer_id: None, lines: vec![disc.clone()], global_discount_paisa: 0, tenders: cash(8000), approval: None }).is_err());

    // Wrong manager PIN refused; correct one accepted.
    let bad = ApprovalInput { user_id: owner_id.clone(), pin: "9999".into() };
    assert!(app.checkout(CheckoutInput { customer_id: None, lines: vec![disc.clone()], global_discount_paisa: 0, tenders: cash(8000), approval: Some(bad) }).is_err());
    let ok = ApprovalInput { user_id: owner_id.clone(), pin: "1234".into() };
    let r = app.checkout(CheckoutInput { customer_id: None, lines: vec![disc], global_discount_paisa: 0, tenders: cash(8000), approval: Some(ok) }).unwrap();
    assert_eq!(r.sale.total_paisa, 8000);

    // A cashier's PIN is not a manager approval.
    let selfie = ApprovalInput { user_id: ali.id.clone(), pin: "5555".into() };
    assert!(app.checkout(CheckoutInput { customer_id: None, lines: vec![cheap], global_discount_paisa: 0, tenders: cash(1), approval: Some(selfie) }).is_err());
}

#[test]
fn exclusive_tax_is_added_by_the_backend() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let tax = app.create_tax_rate("GST 18% (added)", 1800, false).unwrap();
    let v = add_product(&app, "SKU3", 10_000, "8961000000035", Some(&tax.id));
    stock(&mut app, &v, 5);
    let unit = pc_unit(&app);
    let q = app.quote(None, &[CheckoutLineInput { variant_id: v, unit_id: unit, qty_milli: 1000, discount_paisa: 0, price_override_paisa: None }], 0).unwrap();
    assert_eq!(q.tax_paisa, 1800);
    assert_eq!(q.total_paisa, 11_800);
}

#[test]
fn khata_sale_park_recall_and_return() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU4", 20_000, "8961000000042", None);
    stock(&mut app, &v, 10);
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);
    let cust = app
        .create_party(CustomerInput {
            party_type: None,
            name: "Aslam".into(),
            name_ur: None,
            phone: Some("03211234567".into()),
            cnic: None,
            ntn: None,
            credit_limit_paisa: 30_000,
            opening_balance_paisa: 0,
            price_list_id: None,
        })
        .unwrap();
    let line = CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: 0, price_override_paisa: None };

    // Park and recall.
    let pid = app.park_cart("Aslam bhai", Some(cust.id.clone()), &[line.clone()]).unwrap();
    assert_eq!(app.list_parked().unwrap().len(), 1);
    let (c, lines) = app.recall_parked(&pid).unwrap();
    assert_eq!(c.as_deref(), Some(cust.id.as_str()));
    assert_eq!(lines[0].qty_milli, 1000);
    assert!(app.list_parked().unwrap().is_empty());

    let credit = vec![PaymentTenderInput { method: "credit".into(), amount_paisa: 20_000, reference: None }];
    let r = app.checkout(CheckoutInput { customer_id: Some(cust.id.clone()), lines: vec![line.clone()], global_discount_paisa: 0, tenders: credit, approval: None }).unwrap();
    assert_eq!(app.list_customers("asl").unwrap()[0].balance_paisa, 20_000);

    let url = app.whatsapp_reminder_url(&cust.id).unwrap();
    assert!(url.starts_with("https://wa.me/"));

    // Return half... the whole item, refunded to khata.
    let sale = app.find_sale_for_return(&r.sale.doc_no).unwrap();
    assert_eq!(sale.lines.len(), 1);
    let ret = app
        .post_return(ReturnInput {
            sale_id: sale.id.clone(),
            lines: vec![ReturnLineInput { sale_line_id: sale.lines[0].sale_line_id.clone(), qty_milli: 1000, damaged: false }],
            reason: Some("wrong size".into()),
            refund_method: "credit".into(),
            approval: None,
        })
        .unwrap();
    assert_eq!(ret.refund_paisa, 20_000);
    assert_eq!(app.list_customers("asl").unwrap()[0].balance_paisa, 0);
    let again = app.find_sale_for_return(&r.sale.doc_no).unwrap();
    assert_eq!(again.lines[0].returned_qty_milli, 1000);

    // Payment received on khata.
    let r2 = app.checkout(CheckoutInput {
        customer_id: Some(cust.id.clone()),
        lines: vec![line],
        global_discount_paisa: 0,
        tenders: vec![PaymentTenderInput { method: "credit".into(), amount_paisa: 20_000, reference: None }],
        approval: None,
    });
    assert!(r2.is_ok());
    app.receive_payment(&cust.id, 5_000, "cash", None).unwrap();
    assert_eq!(app.list_customers("asl").unwrap()[0].balance_paisa, 15_000);
}

#[test]
fn backup_restore_round_trip_through_the_service() {
    let (mut app, d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU5", 1_000, "8961000000059", None);
    let dir = d.path().join("bk");
    let b = app.create_backup(Some(dir.to_str().unwrap()), "backup-password").unwrap();
    assert!(app.verify_backup(&b.path, "wrong-password").is_err());
    assert_eq!(app.list_backups(Some(dir.to_str().unwrap())).unwrap().len(), 1);

    // Restore onto a brand-new install (new PC) before setup.
    let d2 = TempDir::new().unwrap();
    let mut app2 = PosApp::open_with_machine(d2.path(), MACHINE.into()).unwrap();
    assert!(app2.status().unwrap().needs_setup);
    app2.restore_backup(&b.path, "backup-password").unwrap();
    assert!(!app2.status().unwrap().needs_setup);
    app2.login_password("owner", "owner-pass-1").unwrap();
    assert_eq!(app2.search_products("SKU5", 5).unwrap()[0].product.variant_id, v);
    assert!(app2.diagnostics().unwrap().integrity_ok);
}

#[test]
fn demo_catalog_receipt_low_stock_and_z_report() {
    let (mut app, _d) = fresh();
    app.setup_first_run(
        StoreSetupInput {
            name: "Demo Mart".into(), name_ur: None, address: Some("Multan".into()), phone: None, ntn: None, strn: None,
            tax_mode: None, enabled_packs: vec![], demo_catalog: true,
        },
        OwnerSetupInput { username: "owner".into(), password: "owner-pass-1".into(), pin: Some("1234".into()) },
    ).unwrap();
    let rows = app.search_products("", 50).unwrap();
    assert_eq!(rows.len(), 5);
    assert!(rows.iter().all(|r| r.on_hand_milli == 50_000), "stock must come from a posted purchase");
    assert_eq!(app.list_customers("demo").unwrap().len(), 1);

    let tea = rows.iter().find(|r| r.product.sku == "DEMO-TEA-450").unwrap();
    app.start_shift(0).unwrap();
    let line = CheckoutLineInput { variant_id: tea.product.variant_id.clone(), unit_id: tea.product.base_unit_id.clone(), qty_milli: 46_000, discount_paisa: 0, price_override_paisa: None };
    let r = app.checkout(CheckoutInput { customer_id: None, lines: vec![line], global_discount_paisa: 0, tenders: cash(46 * 62_000), approval: None }).unwrap();

    let p = app.receipt_payload(&r.sale.id).unwrap();
    assert_eq!(p.store_name, "Demo Mart");
    assert_eq!(p.cashier_name, "owner");
    assert_eq!(p.grand_total_paisa, 46 * 62_000);
    assert!(p.footer_note.unwrap().contains("TRIAL"));

    let low = app.low_stock().unwrap();
    assert_eq!(low.len(), 1);
    assert_eq!(low[0].sku, "DEMO-TEA-450");

    assert!(app.z_report_payload().is_err());
    app.close_shift(46 * 62_000).unwrap();
    let z = app.z_report_payload().unwrap();
    assert!(z.footer_note.unwrap().contains("0.00"));
}

#[test]
fn cloud_sync_is_off_until_owner_turns_it_on() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU9", 1_000, "8961000000097", None);
    stock(&mut app, &v, 2);
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);
    app.checkout(CheckoutInput {
        customer_id: None,
        lines: vec![CheckoutLineInput { variant_id: v, unit_id: unit, qty_milli: 1000, discount_paisa: 0, price_override_paisa: None }],
        global_discount_paisa: 0, tenders: cash(1_000), approval: None,
    }).unwrap();

    let st = app.cloud_settings().unwrap();
    assert!(!st.enabled);
    assert_eq!(st.pending_events, 1);
    assert!(app.cloud_batch().unwrap().is_none(), "nothing may be sent while sync is off");

    assert!(app.save_cloud_settings(CloudSettingsInput { enabled: true, url: None, api_key: None }).is_err());
    assert!(app.save_cloud_settings(CloudSettingsInput { enabled: false, url: Some("http://plain.example.com".into()), api_key: None }).is_err());
    let st = app.save_cloud_settings(CloudSettingsInput { enabled: true, url: Some("https://x.supabase.co/".into()), api_key: Some("k".into()) }).unwrap();
    assert!(st.enabled && st.key_set && st.consent_at.is_some());

    let b = app.cloud_batch().unwrap().unwrap();
    assert_eq!(b.url, "https://x.supabase.co");
    assert_eq!(b.event_ids.len(), 1);
    app.cloud_mark_synced(&b.event_ids).unwrap();
    assert_eq!(app.cloud_settings().unwrap().pending_events, 0);

    // A cashier can neither see nor change the cloud settings.
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    app.logout().unwrap();
    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();
    app.login_pin(&ali.id, "5555").unwrap();
    assert!(app.cloud_settings().is_err());
    assert!(app.cloud_batch().is_err());
}

#[test]
fn recounting_an_item_replaces_the_earlier_count() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU7", 1_000, "8961000000073", None);
    stock(&mut app, &v, 10);
    let s = app.start_stock_count(None).unwrap();
    app.record_stock_counts(&s.id, vec![pos_core::domain::stock_count::RecordCountItemInput { variant_id: v.clone(), counted_qty_milli: 7_000, notes: None }]).unwrap();
    app.record_stock_counts(&s.id, vec![pos_core::domain::stock_count::RecordCountItemInput { variant_id: v.clone(), counted_qty_milli: 8_000, notes: None }]).unwrap();
    let cur = app.current_stock_count().unwrap().unwrap();
    assert_eq!(cur.lines.len(), 1);
    assert_eq!(cur.lines[0].counted_qty_milli, 8_000);
    app.finalize_stock_count(&s.id).unwrap();
    assert_eq!(app.search_products("SKU7", 5).unwrap()[0].on_hand_milli, 8_000, "adjusted once, to the last count");
    assert!(app.current_stock_count().unwrap().is_none());
    assert!(app.record_stock_counts(&s.id, vec![]).is_err(), "a finished count cannot be changed");
}

#[test]
fn out_of_stock_message_names_the_product() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "SKU8", 1_000, "8961000000080", None);
    stock(&mut app, &v, 2);
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);
    let e = app.checkout(CheckoutInput {
        customer_id: None,
        lines: vec![CheckoutLineInput { variant_id: v, unit_id: unit, qty_milli: 5000, discount_paisa: 0, price_override_paisa: None }],
        global_discount_paisa: 0, tenders: cash(5_000), approval: None,
    }).unwrap_err().to_string();
    assert!(e.contains("Item SKU8") && e.contains("5 pc") && e.contains("2 pc"), "{}", e);
}

fn add_product_ws(app: &PosApp, sku: &str, retail: i64, wholesale: Option<i64>, barcode: &str) -> String {
    let unit = pc_unit(app);
    app.create_product(CreateProductParams {
        sku: sku.into(), name: format!("Item {}", sku), name_ur: None, category_id: None, brand_id: None,
        base_unit_id: unit, hs_code: None, tax_rate_id: None, track_mode: None, reorder_level_milli: None,
        barcode: Some(barcode.into()), retail_price_paisa: retail, wholesale_price_paisa: wholesale, packaging_units: vec![],
    }).unwrap().variant_id
}

#[test]
fn salesman_sets_any_price_but_never_below_wholesale() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product_ws(&app, "WS1", 20_000, Some(14_000), "8961000000110");
    stock(&mut app, &v, 10); // purchase cost Rs 50
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    app.logout().unwrap();
    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();
    app.login_pin(&ali.id, "5555").unwrap();
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);
    let sale = |app: &mut PosApp, price: i64, disc: i64| {
        app.checkout(CheckoutInput {
            customer_id: None,
            lines: vec![CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: disc, price_override_paisa: Some(price) }],
            global_discount_paisa: 0, tenders: cash(price), approval: None,
        })
    };
    // Quote tells the screen the minimum.
    let q = app.quote(None, &[CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: 0, price_override_paisa: None }], 0).unwrap();
    assert_eq!(q.lines[0].min_price_paisa, Some(14_000));

    assert_eq!(sale(&mut app, 18_000, 0).unwrap().sale.total_paisa, 18_000, "cashier may lower the price without a PIN");
    assert_eq!(sale(&mut app, 25_000, 0).unwrap().sale.total_paisa, 25_000, "or raise it");
    assert_eq!(sale(&mut app, 14_000, 0).unwrap().sale.total_paisa, 14_000, "exactly wholesale is fine");
    let e = sale(&mut app, 13_900, 0).unwrap_err().to_string();
    assert!(e.contains("below the wholesale price") && !e.contains("140") && !e.contains("139"), "the message must not show amounts: {}", e);
}

#[test]
fn without_wholesale_the_floor_is_the_cost() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product_ws(&app, "WS2", 20_000, None, "8961000000127");
    stock(&mut app, &v, 10); // cost Rs 50 each
    app.start_shift(0).unwrap();
    let unit = pc_unit(&app);
    let r = app.checkout(CheckoutInput {
        customer_id: None,
        lines: vec![CheckoutLineInput { variant_id: v.clone(), unit_id: unit.clone(), qty_milli: 1000, discount_paisa: 0, price_override_paisa: Some(4_000) }],
        global_discount_paisa: 0, tenders: cash(4_000), approval: None,
    });
    let e = r.unwrap_err().to_string();
    assert!(e.contains("below the wholesale price") && !e.contains("50.00"), "{}", e);
}

#[test]
fn in_store_barcodes_are_valid_unique_and_scannable() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let unit = pc_unit(&app);
    let p = app.create_product(CreateProductParams {
        sku: "LOOSE1".into(), name: "Loose Daal".into(), name_ur: None, category_id: None, brand_id: None,
        base_unit_id: unit, hs_code: None, tax_rate_id: None, track_mode: None, reorder_level_milli: None,
        barcode: None, retail_price_paisa: 30_000, wholesale_price_paisa: None, packaging_units: vec![],
    }).unwrap();
    let a = app.generate_barcode().unwrap();
    let b = app.generate_barcode().unwrap();
    assert!(a.len() == 13 && a.starts_with("29") && a != b);
    let digits: Vec<u32> = a.chars().map(|c| c.to_digit(10).unwrap()).collect();
    let sum: u32 = digits[..12].iter().enumerate().map(|(i, d)| d * if i % 2 == 0 { 1 } else { 3 }).sum();
    assert_eq!((10 - sum % 10) % 10, digits[12], "valid EAN-13 check digit");

    let code = app.assign_barcode(&p.variant_id).unwrap();
    assert!(app.assign_barcode(&p.variant_id).is_err(), "a product keeps its barcode");
    stock(&mut app, &p.variant_id, 3);
    assert_eq!(app.scan(&code).unwrap().unwrap().product.variant_id, p.variant_id, "scanning the new label finds the product");
    let label = app.label_payload(&p.variant_id, 2, pos_core::hardware::LabelSize::Size38x25).unwrap();
    assert_eq!(label.barcode, code);
}

#[test]
fn out_of_stock_items_are_hidden_from_sale_until_purchased() {
    let (mut app, _d) = fresh();
    setup(&mut app);
    let v = add_product(&app, "NEW1", 5_000, "8961000000141", None);
    assert!(app.search_sellable("Item NEW1", 10).unwrap().is_empty(), "no stock: not offered for sale");
    assert_eq!(app.search_products("Item NEW1", 10).unwrap().len(), 1, "still visible in the catalog");
    let e = app.scan("8961000000141").unwrap_err().to_string();
    assert!(e.contains("out of stock") && e.contains("purchase"), "{}", e);
    stock(&mut app, &v, 4);
    let r = app.search_sellable("Item NEW1", 10).unwrap();
    assert_eq!(r[0].on_hand_milli, 4_000);
    assert!(app.scan("8961000000141").unwrap().is_some());
}
