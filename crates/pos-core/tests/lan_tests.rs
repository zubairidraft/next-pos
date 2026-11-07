//! Phone <-> PC link: pairing, per-phone logins, permissions, removal, and
//! the real TLS connection with a pinned certificate.
#![cfg(feature = "lan-hub")]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use pos_core::app::lan::{LanHub, RemoteScan, SharedApp};
use pos_core::app::*;
use pos_core::auth::Role;
use pos_core::domain::catalog::CreateProductParams;
use pos_core::domain::purchase::{CreatePurchaseInput, CreatePurchaseLineInput};
use pos_lan::client::{self, LinkError};
use pos_lan::PairingQr;
use serde_json::json;
use tempfile::TempDir;

fn shop() -> (PosApp, TempDir) {
    let dir = TempDir::new().unwrap();
    let mut app = PosApp::open_with_machine(dir.path(), "KPOS-AAAA-BBBB-CCCC-DDDD".into()).unwrap();
    app.setup_first_run(
        StoreSetupInput { name: "Madina Store".into(), name_ur: None, address: None, phone: None, ntn: None, strn: None, tax_mode: None, enabled_packs: vec![], demo_catalog: false },
        OwnerSetupInput { username: "owner".into(), password: "owner-pass-1".into(), pin: Some("1234".into()) },
    )
    .unwrap();
    (app, dir)
}

fn product_with_stock(app: &mut PosApp) -> String {
    let unit = app.list_units().unwrap().into_iter().find(|u| u.code == "pc").unwrap().id;
    let v = app
        .create_product(CreateProductParams {
            sku: "SHAN-BIR".into(),
            name: "Shan Biryani".into(),
            name_ur: None,
            category_id: None,
            brand_id: None,
            base_unit_id: unit.clone(),
            hs_code: None,
            tax_rate_id: None,
            track_mode: None,
            reorder_level_milli: None,
            barcode: Some("8964000000017".into()),
            retail_price_paisa: 20000,
            wholesale_price_paisa: Some(14000),
            packaging_units: vec![],
        })
        .unwrap()
        .variant_id;
    let vendor = app
        .create_party(CustomerInput { party_type: Some("vendor".into()), name: "Ali Traders".into(), name_ur: None, phone: None, cnic: None, ntn: None, credit_limit_paisa: 0, opening_balance_paisa: 0, price_list_id: None })
        .unwrap();
    app.post_purchase(CreatePurchaseInput {
        vendor_id: vendor.id,
        vendor_invoice_no: None,
        freight_paisa: 0,
        lines: vec![CreatePurchaseLineInput { variant_id: v.clone(), unit_id: unit, received_qty_milli: 10_000, unit_cost_paisa: 12000 }],
        user_id: None,
    })
    .unwrap();
    v
}

#[test]
fn pairing_codes_work_once_and_only_when_enabled() {
    let (mut app, _d) = shop();
    assert!(app.lan_new_pairing_code().is_err(), "phone access is off by default");
    app.set_lan_enabled(true).unwrap();
    let code = app.lan_new_pairing_code().unwrap();
    assert!(app.lan_pair("wrong-code-000000000000000000000", "Phone", "1.2.3.4").is_err());
    let d = app.lan_pair(&code, "Ali's phone", "192.168.1.20").unwrap();
    assert!(app.lan_pair(&code, "Again", "192.168.1.21").is_err(), "a code works once");
    assert_eq!(app.lan_authenticate(&d.device_id, &d.secret, "192.168.1.20").unwrap(), "Ali's phone");
    assert!(app.lan_authenticate(&d.device_id, "nope", "192.168.1.20").is_err());

    // A cashier cannot manage phones.
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    app.logout().unwrap();
    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();
    app.login_pin(&ali.id, "5555").unwrap();
    assert!(app.lan_devices().is_err());
    assert!(app.lan_revoke_device(&d.device_id).is_err());
    assert!(app.set_lan_enabled(false).is_err());
    app.logout().unwrap();

    let owner = app.status().unwrap().users.into_iter().find(|u| u.username == "owner").unwrap();
    app.login_pin(&owner.id, "1234").unwrap();
    let list = app.lan_devices().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].last_ip.as_deref(), Some("192.168.1.20"));
    app.lan_revoke_device(&d.device_id).unwrap();
    assert!(app.lan_authenticate(&d.device_id, &d.secret, "192.168.1.20").is_err(), "removed phone stops working");
    assert!(app.lan_devices().unwrap()[0].revoked);

    // Turning phone access off stops every phone.
    let code = app.lan_new_pairing_code().unwrap();
    let d2 = app.lan_pair(&code, "Second", "192.168.1.30").unwrap();
    app.set_lan_enabled(false).unwrap();
    assert!(app.lan_authenticate(&d2.device_id, &d2.secret, "192.168.1.30").is_err());
}

#[test]
fn phone_has_its_own_login_and_only_allowed_commands() {
    let (mut app, _d) = shop();
    app.set_lan_enabled(true).unwrap();
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    let ali = app.status().unwrap().users.into_iter().find(|u| u.username == "ali").unwrap();

    let mut phone = None;
    // Not logged in on the phone, though the Owner is logged in on the PC.
    assert!(app.phone_dispatch(&mut phone, "search_products", &json!({"query": "", "limit": 5})).is_err());
    app.phone_dispatch(&mut phone, "login_pin", &json!({"user_id": ali.id, "pin": "5555"})).unwrap();
    assert!(phone.is_some());
    assert!(app.phone_dispatch(&mut phone, "search_products", &json!({"query": "", "limit": 5})).is_ok());
    // The PC is still the Owner.
    assert_eq!(app.status().unwrap().session.unwrap().username, "owner");
    // PC-only commands are refused even for a phone logged in as Owner.
    let mut owner_phone = None;
    let owner = app.status().unwrap().users.into_iter().find(|u| u.username == "owner").unwrap();
    app.phone_dispatch(&mut owner_phone, "login_pin", &json!({"user_id": owner.id, "pin": "1234"})).unwrap();
    for cmd in ["create_user", "restore_backup", "save_cloud_settings", "reveal_recovery_phrase", "install_license", "save_settings"] {
        let e = app.phone_dispatch(&mut owner_phone, cmd, &json!({})).unwrap_err();
        assert!(e.to_string().contains("only be done on the shop PC"), "{cmd}");
    }
    // The shop folder path is not sent to phones.
    let st = app.phone_dispatch(&mut phone, "app_status", &json!({})).unwrap();
    assert_eq!(st["status"]["data_dir"], "");
    // Logging out on the phone leaves the PC logged in.
    app.phone_dispatch(&mut phone, "logout", &json!({})).unwrap();
    assert!(phone.is_none());
    assert_eq!(app.status().unwrap().session.unwrap().username, "owner");
}

struct Running {
    hub: LanHub,
    app: SharedApp,
    scans: Arc<Mutex<Vec<RemoteScan>>>,
    _dir: TempDir,
}

fn running_shop(discovery_port: Option<u16>) -> Running {
    let (mut app, dir) = shop();
    app.set_lan_enabled(true).unwrap();
    app.create_user(NewUserInput { username: "ali".into(), password: "cashier-pass".into(), pin: Some("5555".into()), role: Role::Cashier }).unwrap();
    product_with_stock(&mut app);
    let shared: SharedApp = Arc::new(Mutex::new(Ok(app)));
    let scans = Arc::new(Mutex::new(Vec::new()));
    let s2 = scans.clone();
    let hub = LanHub::start(shared.clone(), &dir.path().join("security"), 0, discovery_port, Arc::new(move |s| s2.lock().unwrap().push(s))).unwrap();
    Running { hub, app: shared, scans, _dir: dir }
}

fn qr_for(r: &Running, hosts: Vec<String>) -> String {
    let code = r.app.lock().unwrap().as_mut().unwrap().lan_new_pairing_code().unwrap();
    let mut qr = r.hub.pairing_qr("Madina Store", &code);
    qr.hosts = hosts;
    qr.to_qr_text()
}

#[test]
fn phone_pairs_logs_in_and_sells_over_tls() {
    let r = running_shop(None);
    let mut p = client::pair(&qr_for(&r, vec!["127.0.0.1".into()]), "Ali's phone").unwrap();
    assert_eq!(p.store_name, "Madina Store");
    assert_eq!(p.fingerprint, r.hub.fingerprint);

    // Same QR cannot pair a second phone.
    let reuse = PairingQr { code: "0".repeat(32), ..PairingQr::parse(&qr_for(&r, vec!["127.0.0.1".into()])).unwrap() };
    assert!(matches!(client::pair(&reuse.to_qr_text(), "x"), Err(LinkError::Refused(_))));

    let (ping, _) = p.ping().unwrap();
    assert_eq!(ping["store_name"], "Madina Store");

    // Log in as the cashier on the phone, start a shift and sell at a counter price.
    let (st, _) = p.rpc("app_status", json!({})).unwrap();
    let ali = st["status"]["users"].as_array().unwrap().iter().find(|u| u["username"] == "ali").unwrap()["id"].as_str().unwrap().to_string();
    assert!(matches!(p.rpc("login_pin", json!({"user_id": ali, "pin": "0000"})), Err(LinkError::Refused(_))));
    p.rpc("login_pin", json!({"user_id": ali, "pin": "5555"})).unwrap();
    p.rpc("start_shift", json!({"opening_float_paisa": 0})).unwrap();
    let (scan, _) = p.rpc("scan_code", json!({"code": "8964000000017"})).unwrap();
    let variant = scan["product"]["variant_id"].as_str().unwrap().to_string();
    let unit = scan["unit_id"].as_str().unwrap().to_string();
    let line = json!({"variant_id": variant, "unit_id": unit, "qty_milli": 1000, "discount_paisa": 0, "price_override_paisa": 13900});
    let below = p.rpc("checkout", json!({"input": {"customer_id": null, "lines": [line], "tenders": [{"method": "cash", "amount_paisa": 13900, "reference": null}]}}));
    match below {
        Err(LinkError::Refused(m)) => assert!(m.contains("wholesale"), "{m}"),
        other => panic!("expected refusal, got {other:?}"),
    }
    let line = json!({"variant_id": variant, "unit_id": unit, "qty_milli": 1000, "discount_paisa": 0, "price_override_paisa": 18000});
    let (receipt, _) = p
        .rpc("checkout", json!({"input": {"customer_id": null, "lines": [line], "tenders": [{"method": "cash", "amount_paisa": 18000, "reference": null}]}}))
        .unwrap();
    assert_eq!(receipt["sale"]["total_paisa"], 18000);

    // The sale is in the PC's database, stock went down there.
    {
        let mut g = r.app.lock().unwrap();
        let app = g.as_mut().unwrap();
        let row = app.stock_list().unwrap().into_iter().find(|s| s.variant_id == variant).unwrap();
        assert_eq!(row.on_hand_milli, 9000);
        assert_eq!(app.status().unwrap().session.unwrap().username, "owner", "PC login untouched");
    }

    // Phone-only refusal for PC-only commands.
    assert!(matches!(p.rpc("create_backup", json!({})), Err(LinkError::Refused(m)) if m.contains("shop PC")));

    // Scanner mode: the barcode reaches the PC screen.
    p.scan("8964000000017").unwrap();
    let scans = r.scans.lock().unwrap().clone();
    assert_eq!(scans.len(), 1);
    assert_eq!(scans[0].code, "8964000000017");
    assert_eq!(scans[0].device_name, "Ali's phone");

    // Owner removes the phone: it stops at once.
    let id = p.device_id.clone();
    r.app.lock().unwrap().as_mut().unwrap().lan_revoke_device(&id).unwrap();
    assert!(matches!(p.ping(), Err(LinkError::NotPaired(_))));
    assert!(matches!(p.scan("1"), Err(LinkError::NotPaired(_))));
}

#[test]
fn phone_refuses_a_pc_with_a_different_certificate() {
    let r = running_shop(None);
    let mut p = client::pair(&qr_for(&r, vec!["127.0.0.1".into()]), "Phone").unwrap();
    // Pretend another machine took the PC's address with its own certificate.
    let other = running_shop(None);
    p.port = other.hub.port;
    assert_eq!(p.ping().unwrap_err(), LinkError::WrongPc);
}

#[test]
fn phone_reports_offline_when_pc_is_closed() {
    let r = running_shop(None);
    let mut p = client::pair(&qr_for(&r, vec!["127.0.0.1".into()]), "Phone").unwrap();
    let Running { hub, .. } = r;
    hub.stop();
    std::thread::sleep(Duration::from_millis(100));
    p.discovery_port = 1; // nothing answers discovery here
    assert!(matches!(p.ping(), Err(LinkError::Offline(_))));
}

#[test]
fn phone_finds_the_pc_again_after_its_address_changes() {
    let disc = 47921;
    let r = running_shop(Some(disc));
    let mut p = client::pair(&qr_for(&r, vec!["127.0.0.1".into()]), "Phone").unwrap();
    // The router gave the PC a new address; the old one is dead.
    p.hosts = vec!["127.0.0.77".into()];
    p.port = 1; // and the saved port is wrong too
    p.discovery_port = disc;
    let (_, moved) = p.ping().unwrap();
    assert!(moved, "the new address must be saved");
    assert_eq!(p.port, r.hub.port);
}
