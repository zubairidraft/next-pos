// Round 1 audit fixes: money, stock, khata and return rules for SaleRepo / ReturnRepo / ShiftRepo.
// Each test asserts the correct behaviour; they were all failing before the Round 1 fixes.
use pos_core::db::connection::{open_encrypted_db, run_migrations};
use pos_core::domain::inventory::{InventoryRepo, RecordMovementParams};
use pos_core::domain::{
    CatalogRepo, CreatePackagingUnitParams, CreatePartyParams, CreateProductParams, PartyRepo,
    PaymentTenderInput, PostReturnRequest, PostSaleLineInput, PostSaleRequest, ReturnLineRequest,
    ReturnRepo, SaleRepo, ShiftRepo, UnitRepo,
};
use rusqlite::params;
use tempfile::NamedTempFile;

fn db() -> (rusqlite::Connection, NamedTempFile) {
    let f = NamedTempFile::new().unwrap();
    let mut c = open_encrypted_db(f.path(), &[7u8; 32]).unwrap();
    run_migrations(&mut c).unwrap();
    (c, f)
}

struct Fx {
    unit: String,
    carton: String,
    var: String,
    cust: String,
    user: String,
}

fn fixture(c: &rusqlite::Connection, stock_units: i64, cost: i64, credit_limit: i64) -> Fx {
    let unit = UnitRepo::create(c, "pc", "Piece", 0).unwrap();
    let carton = UnitRepo::create(c, "ctn", "Carton", 0).unwrap();
    let p = CatalogRepo::create_product(
        c,
        CreateProductParams {
            sku: "SKU1".into(),
            name: "Tea".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: unit.id.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8961000000001".into()),
            retail_price_paisa: 10000,
            wholesale_price_paisa: None,
            packaging_units: vec![CreatePackagingUnitParams {
                unit_id: carton.id.clone(),
                factor_to_base: 24000,
                barcode: Some("8961000000002".into()),
                retail_price_paisa: Some(230000),
            }],
        },
    )
    .unwrap();
    InventoryRepo::record_movement(
        c,
        RecordMovementParams {
            variant_id: p.variant_id.clone(),
            qty_signed_milli: stock_units * 1000,
            movement_type: "purchase".into(),
            source_doc: "PUR-0".into(),
            source_line: None,
            unit_cost_paisa: cost,
            batch_id: None,
            serial_id: None,
            user_id: None,
        },
    )
    .unwrap();
    let cust = PartyRepo::create_party(
        c,
        CreatePartyParams {
            party_type: "customer".into(),
            name: "Haji".into(),
            name_ur: None,
            phone: None,
            cnic: None,
            ntn: None,
            credit_limit_paisa: credit_limit,
            opening_balance_paisa: 0,
            price_list_id: None,
        },
    )
    .unwrap();
    let user = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    c.execute(
        "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?1,'cashier',''  ,?2,?2)",
        params![user, now],
    )
    .unwrap();
    Fx { unit: unit.id, carton: carton.id, var: p.variant_id, cust: cust.id, user }
}

fn line(fx: &Fx, qty: i64, price: i64, disc: i64) -> PostSaleLineInput {
    PostSaleLineInput {
        variant_id: fx.var.clone(),
        unit_id: fx.unit.clone(),
        qty_milli: qty,
        unit_price_paisa: price,
        discount_paisa: disc,
        tax_paisa: 0,
        price_override_by: None,
    }
}
fn tender(m: &str, a: i64) -> PaymentTenderInput {
    PaymentTenderInput { method: m.into(), amount_paisa: a, reference: None }
}
fn on_hand(c: &rusqlite::Connection, v: &str) -> i64 {
    c.query_row("SELECT on_hand_milli FROM inventory_balances WHERE variant_id=?1", [v], |r| r.get(0)).unwrap()
}

// ---------------- MONEY / STOCK ----------------

#[test]
fn biz01_negative_quantity_sale_rejected() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, -5000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None,
        credit_override_by: None,
    });
    println!("OBSERVED neg qty sale ok={} stock_now={}", r.is_ok(), on_hand(&c, &fx.var) / 1000);
    assert!(matches!(&r, Err(e) if e.to_string().contains("Quantity must be greater than zero")), "sale with qty -5 accepted (stock went UP, total negative): {:?}", r.as_ref().err());
}

#[test]
fn biz02_discount_cannot_exceed_line_or_be_negative() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 50000)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None,
        credit_override_by: None,
    });
    println!("OBSERVED discount 500 on Rs100 item ok={} total={:?}", r.is_ok(), r.as_ref().map(|s| s.total_paisa));
    assert!(matches!(&r, Err(e) if e.to_string().contains("discount cannot be larger")), "discount larger than line accepted -> negative bill: {:?}", r.as_ref().err());
}

#[test]
fn biz03_price_must_come_from_catalog_not_client() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 1, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 1)], user_id: None,
        credit_override_by: None,
    });
    println!("OBSERVED Rs100 item sold for 1 paisa ok={}", r.is_ok());
    assert!(r.is_err(), "post_sale trusts the price sent by the UI");
}

#[test]
fn biz04_carton_sale_deducts_24_pieces() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 48, 5000, 0);
    let mut l = line(&fx, 1000, 230000, 0);
    l.unit_id = fx.carton.clone();
    SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![l],
        global_discount_paisa: 0, tenders: vec![tender("cash", 230000)], user_id: None,
        credit_override_by: None,
    }).unwrap();
    let left = on_hand(&c, &fx.var) / 1000;
    println!("OBSERVED sold 1 carton(24) from 48 pcs, left={}", left);
    assert_eq!(left, 24, "unit conversion ignored at posting");
}

#[test]
fn biz05_credit_tender_cannot_produce_cash_change() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: Some(fx.cust.clone()), cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("credit", 1000000)], user_id: None,
        credit_override_by: None,
    });
    println!("OBSERVED credit 10,000 on Rs100 bill ok={} change={:?}", r.is_ok(), r.as_ref().map(|s| s.change_paisa));
    assert!(r.is_err() || r.unwrap().change_paisa == 0, "cash change paid out against khata credit");
}

#[test]
fn biz06_credit_limit_enforced_on_sale() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 5000); // limit Rs 50
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: Some(fx.cust.clone()), cash_session_id: None, lines: vec![line(&fx, 5000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("credit", 50000)], user_id: None,
        credit_override_by: None,
    });
    println!("OBSERVED Rs500 credit sale with Rs50 limit ok={}", r.is_ok());
    assert!(r.is_err(), "credit limit not enforced when posting sale");
}

#[test]
fn biz07_shift_expected_cash_net_of_change() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let s = ShiftRepo::start_shift(&mut c, &fx.user, 100000).unwrap();
    SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: Some(s.id.clone()), lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 500000)], user_id: None,
        credit_override_by: None,
    }).unwrap();
    let z = ShiftRepo::close_shift(&mut c, &s.id, 110000).unwrap();
    println!("OBSERVED float 1000 + sale 100 paid with 5000 -> expected={} counted=1100 variance={}",
        z.expected_cash_paisa / 100, z.variance_paisa / 100);
    assert_eq!(z.expected_cash_paisa, 110000, "drawer expectation includes change given back");
}

#[test]
fn biz08_refund_cannot_exceed_amount_paid() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let sale = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None,
        credit_override_by: None,
    }).unwrap();
    let r = ReturnRepo::post_return(&mut c, PostReturnRequest {
        original_sale_id: sale.id.clone(),
        lines: vec![ReturnLineRequest { original_sale_line_id: sale.lines[0].id.clone(), variant_id: fx.var.clone(),
            unit_id: fx.unit.clone(), qty_milli: 1000, refund_paisa: 5000000, restock_type: "sellable".into() }],
        reason: None, refund_method: "cash".into(), cash_session_id: None });
    println!("OBSERVED Rs50,000 refund on Rs100 sale ok={}", r.is_ok());
    assert!(r.is_err(), "refund amount not checked against original line");
}

#[test]
fn biz09_failed_sale_does_not_burn_invoice_number() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 1, 5000, 0);
    let _ = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 5000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 50000)], user_id: None,
        credit_override_by: None,
    }); // blocked: stock
    let ok = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None,
        credit_override_by: None,
    }).unwrap();
    println!("OBSERVED first successful invoice number = {}", ok.doc_no);
    assert!(ok.doc_no.ends_with("000001"), "invoice sequence has gaps after failed sales");
}

fn make_user(c: &rusqlite::Connection, name: &str, role: &str) -> String {
    let uid = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    c.execute("INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?1, ?2, '', ?3, ?3)",
        params![uid, name, now]).unwrap();
    c.execute("INSERT OR IGNORE INTO roles (id, name, created_at) VALUES (?1, ?1, ?2)", params![role, now]).unwrap();
    c.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?1, ?2)", params![uid, role]).unwrap();
    uid
}

#[test]
fn biz10_line_total_rounds_half_up() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let mgr = make_user(&c, "manager1", "manager");
    // 1.5 kg x 5001 paisa = 7501.5 paisa -> 7502 (price approved by manager, above cost)
    let mut l = line(&fx, 1500, 5001, 0);
    l.price_override_by = Some(mgr);
    let s = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![l],
        global_discount_paisa: 0, tenders: vec![tender("cash", 8000)], user_id: None, credit_override_by: None }).unwrap();
    println!("OBSERVED subtotal paisa = {}", s.subtotal_paisa);
    assert_eq!(s.subtotal_paisa, 7502, "posting truncates instead of half-up rounding");
}

#[test]
fn biz12_price_override_needs_manager_not_cashier() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let cashier = make_user(&c, "cashier2", "cashier");
    let mut l = line(&fx, 1000, 9000, 0);
    l.price_override_by = Some(cashier);
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![l],
        global_discount_paisa: 0, tenders: vec![tender("cash", 9000)], user_id: None, credit_override_by: None });
    println!("OBSERVED cashier-approved price change ok={}", r.is_ok());
    assert!(r.is_err(), "a cashier must not be able to approve a price change");
}

#[test]
fn biz13_credit_override_by_manager_is_audited() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 5000); // limit Rs 50
    let mgr = make_user(&c, "manager2", "manager");
    let s = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: Some(fx.cust.clone()), cash_session_id: None, lines: vec![line(&fx, 5000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("credit", 50000)], user_id: None,
        credit_override_by: Some(mgr) });
    let n: i64 = c.query_row("SELECT count(*) FROM audit_log WHERE action='credit_limit_override'", [], |r| r.get(0)).unwrap();
    println!("OBSERVED manager override ok={} audit rows={}", s.is_ok(), n);
    assert!(s.is_ok() && n == 1);
}

#[test]
fn biz14_split_cash_and_credit_change_only_from_cash() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    // Rs 100 bill: Rs 60 khata + Rs 100 cash -> Rs 60 change, OK
    let ok = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: Some(fx.cust.clone()), cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("credit", 6000), tender("cash", 10000)], user_id: None, credit_override_by: None }).unwrap();
    // Rs 100 bill: Rs 60 khata + Rs 60 card -> overpaid without cash, rejected
    let bad = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: Some(fx.cust.clone()), cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("credit", 6000), tender("card", 6000)], user_id: None, credit_override_by: None });
    let bal: i64 = c.query_row("SELECT balance_paisa FROM party_ledger WHERE party_id=?1 ORDER BY occurred_at DESC, id DESC LIMIT 1", [&fx.cust], |r| r.get(0)).unwrap();
    println!("OBSERVED change={} non-cash overpay ok={} khata balance={}", ok.change_paisa, bad.is_ok(), bal);
    assert_eq!(ok.change_paisa, 6000);
    assert!(bad.is_err());
    assert_eq!(bal, 6000);
}

#[test]
fn biz15_return_must_restock_the_original_item() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    let sale = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None, credit_override_by: None }).unwrap();
    let r = ReturnRepo::post_return(&mut c, PostReturnRequest {
        original_sale_id: sale.id.clone(),
        lines: vec![ReturnLineRequest { original_sale_line_id: sale.lines[0].id.clone(), variant_id: "SOME-OTHER-VARIANT".into(),
            unit_id: fx.unit.clone(), qty_milli: 1000, refund_paisa: 10000, restock_type: "sellable".into() }],
        reason: None, refund_method: "cash".into(), cash_session_id: None });
    println!("OBSERVED return with different item ok={}", r.is_ok());
    assert!(r.is_err());
}

#[test]
fn biz16_warn_policy_allows_negative_stock() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 1, 5000, 0);
    let now = chrono::Utc::now().to_rfc3339();
    c.execute("INSERT INTO business_settings (id, name, negative_stock_policy, created_at, updated_at) VALUES ('s1','Shop','Warn',?1,?1)", [&now]).unwrap();
    let r = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 3000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 30000)], user_id: None, credit_override_by: None });
    println!("OBSERVED Warn policy sale of 3 with 1 in stock ok={} on_hand={}", r.is_ok(), on_hand(&c, &fx.var) / 1000);
    assert!(r.is_ok());
    assert_eq!(on_hand(&c, &fx.var), -2000);
}

#[test]
fn biz17_return_refund_capped_after_bill_discount() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    // 2 x Rs100 with Rs 20 bill discount -> customer paid Rs 180, i.e. Rs 90 per item
    let sale = SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 2000, 10000, 0)],
        global_discount_paisa: 2000, tenders: vec![tender("cash", 18000)], user_id: None, credit_override_by: None }).unwrap();
    let ret = |c: &mut rusqlite::Connection, refund: i64| ReturnRepo::post_return(c, PostReturnRequest {
        original_sale_id: sale.id.clone(),
        lines: vec![ReturnLineRequest { original_sale_line_id: sale.lines[0].id.clone(), variant_id: fx.var.clone(),
            unit_id: fx.unit.clone(), qty_milli: 1000, refund_paisa: refund, restock_type: "sellable".into() }],
        reason: None, refund_method: "cash".into(), cash_session_id: None });
    let too_much = ret(&mut c, 10000).is_ok();
    let fair = ret(&mut c, 9000).is_ok();
    println!("OBSERVED refund Rs100 ok={} refund Rs90 ok={}", too_much, fair);
    assert!(!too_much && fair);
}

#[test]
fn biz11_sale_writes_audit_log() {
    let (mut c, _f) = db();
    let fx = fixture(&c, 10, 5000, 0);
    SaleRepo::post_sale(&mut c, PostSaleRequest {
        customer_id: None, cash_session_id: None, lines: vec![line(&fx, 1000, 10000, 0)],
        global_discount_paisa: 0, tenders: vec![tender("cash", 10000)], user_id: None,
        credit_override_by: None,
    }).unwrap();
    let n: i64 = c.query_row("SELECT count(*) FROM audit_log", [], |r| r.get(0)).unwrap();
    println!("OBSERVED audit_log rows after sale = {}", n);
    assert!(n > 0, "no audit trail written");
}
