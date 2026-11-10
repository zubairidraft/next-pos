#!/usr/bin/env python3
"""Cloud parity test: the cloud reports must equal the shop PC reports.

Starts two test shops (pos-dev-server, test data only), fills them with sales,
returns, khata, purchases, claims, edits and price changes, links them to a
local Postgres that has the Next POS Cloud migrations, syncs, and compares all
18 reports for several periods and time zones. Also checks who may see what.

Needs: target/debug/pos-dev-server (features dev-server) and a Postgres DSN in
NP_PG (default host=127.0.0.1 port=54329 user=postgres dbname=np).
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

import psycopg2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SERVER = os.environ.get("NP_DEV_SERVER", os.path.expanduser("~/audit/pos/target/debug/pos-dev-server"))
DSN = os.environ.get("NP_PG", "host=127.0.0.1 port=54329 user=postgres dbname=np")
KINDS = ["stock", "purchases", "purchase_returns", "sales", "sale_returns", "services", "daily", "recovery", "salesman",
         "claims", "profit", "activity", "analysis_trend", "analysis_movers", "analysis_margin", "list_products", "list_customers", "list_vendors"]

ok = True
checks = 0


def check(cond, msg):
    global ok, checks
    checks += 1
    if not cond:
        ok = False
        print("FAIL", msg, flush=True)


class Shop:
    def __init__(self, port):
        self.port = port
        self.dir = tempfile.mkdtemp(prefix=f"np{port}-")
        env = dict(os.environ, NEXTPOS_DEV_DATA_DIR=self.dir, NEXTPOS_DEV_PORT=str(port))
        self.proc = subprocess.Popen([SERVER], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                self.call("app_status")
                break
            except Exception:
                time.sleep(0.1)

    def call(self, cmd, args=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/invoke/{cmd}", data=json.dumps(args or {}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "X-NextPOS-Dev": "1", "Origin": "http://127.0.0.1:1420"})
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{cmd}: {e.read().decode()}")

    def stop(self):
        self.proc.terminate()
        self.proc.wait()
        shutil.rmtree(self.dir, ignore_errors=True)


def iso(t):
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def fill(shop, name, variant):
    """A realistic day: products, purchase, sales (cash, khata, mixed, discounts, services, price change),
    returns, khata payment, purchase return, claims, receipt edit, purchase edit, product edit."""
    c = shop.call
    c("setup_first_run", {"store": {"name": name, "enabled_packs": [], "tax_mode": "exclusive"}, "owner": {"username": "owner", "password": "owner-pass-1", "pin": "1234"}})
    unit = [u for u in c("list_units") if u["code"] == "pc"][0]["id"]
    tax = c("create_tax_rate", {"name": "GST 17", "rate_bp": 1700, "inclusive": False})["id"] if variant == 0 else None
    prods = []
    for i, (sku, nm, price, whole, reorder) in enumerate([("A1", "Lux Soap", 15000, 11000, 5000), ("B2", "shan masala", 20000, 14000, 30000),
                                                         ("C3", "Basmati Rice 5kg", 250000, 200000, 0), ("D4", "Dead Stock Item", 9900, 5000, 0)]):
        p = c("create_product", {"params": {"sku": f"{sku}{variant}", "name": nm, "base_unit_id": unit, "barcode": f"29600000{variant}{i}019",
                                            "retail_price_paisa": price, "wholesale_price_paisa": whole, "reorder_level_milli": reorder,
                                            "tax_rate_id": tax if i == 2 else None, "packaging_units": []}})
        prods.append(p["variant_id"])
    svc = c("create_product", {"params": {"sku": f"SVC{variant}", "name": "Home delivery", "base_unit_id": unit, "retail_price_paisa": 5000, "packaging_units": []}, "is_service": True})["variant_id"]
    vend = c("create_party", {"input": {"party_type": "vendor", "name": "Ali Traders", "phone": "0300", "credit_limit_paisa": 0, "opening_balance_paisa": 0}})["id"]
    vend2 = c("create_party", {"input": {"party_type": "vendor", "name": "Zubair & Sons", "credit_limit_paisa": 0, "opening_balance_paisa": 5000}})["id"]
    cust = c("create_party", {"input": {"party_type": "customer", "name": "Bilal", "phone": "0311", "cnic": "35202", "credit_limit_paisa": 10_000_000, "opening_balance_paisa": 0}})["id"]
    cust2 = c("create_party", {"input": {"party_type": "customer", "name": "ahmed", "credit_limit_paisa": 10_000_000, "opening_balance_paisa": 25000}})["id"]
    pur = c("post_purchase", {"input": {"vendor_id": vend, "vendor_invoice_no": "INV-9", "freight_paisa": 3000, "lines": [
        {"variant_id": prods[0], "unit_id": unit, "received_qty_milli": 24000, "unit_cost_paisa": 10000},
        {"variant_id": prods[1], "unit_id": unit, "received_qty_milli": 12000, "unit_cost_paisa": 12000},
        {"variant_id": prods[2], "unit_id": unit, "received_qty_milli": 5000, "unit_cost_paisa": 190000},
        {"variant_id": prods[3], "unit_id": unit, "received_qty_milli": 7000, "unit_cost_paisa": 4000}]}})
    c("post_purchase", {"input": {"vendor_id": vend2, "freight_paisa": 0, "lines": [{"variant_id": prods[1], "unit_id": unit, "received_qty_milli": 6000, "unit_cost_paisa": 13000}]}})
    mid = dt.datetime.now(dt.timezone.utc)
    time.sleep(1.1)
    c("start_shift", {"opening_float_paisa": 0})

    def sell(lines, customer=None, disc=0, pay=None):
        q = c("quote", {"customer_id": customer, "lines": lines, "global_discount_paisa": disc})
        tenders = pay(q["total_paisa"]) if pay else [{"method": "cash", "amount_paisa": q["total_paisa"]}]
        return c("checkout", {"input": {"customer_id": customer, "lines": lines, "global_discount_paisa": disc, "tenders": tenders}})["sale"]

    L = lambda v, q, d=0, o=None: {"variant_id": v, "unit_id": unit, "qty_milli": q, "discount_paisa": d, "price_override_paisa": o}
    s1 = sell([L(prods[0], 3000), L(prods[1], 2000, 1000)])
    s2 = sell([L(prods[1], 1000, 0, 18000), L(svc, 1000)], cust, 500, lambda t: [{"method": "cash", "amount_paisa": 10000}, {"method": "credit", "amount_paisa": t - 10000}])
    s3 = sell([L(prods[2], 1000)], cust2, 0, lambda t: [{"method": "credit", "amount_paisa": t}])
    s4 = sell([L(prods[0], 1500), L(svc, 2000)], None, 0, lambda t: [{"method": "jazzcash", "amount_paisa": t}])
    s5 = sell([L(prods[0], 1000)])
    # returns
    rcpt = c("get_receipt", {"sale_id": s1["id"]})
    line0 = rcpt["sale"]["lines"][0]
    c("post_return", {"input": {"sale_id": s1["id"], "lines": [{"sale_line_id": line0["id"], "qty_milli": 1000, "damaged": False}], "reason": "wrong size", "refund_method": "cash"}})
    # khata payment
    c("receive_payment", {"party_id": cust, "amount_paisa": 5000, "method": "easypaisa", "reference": "EP-1"})
    c("receive_payment", {"party_id": cust2, "amount_paisa": 10000, "method": "cash", "reference": None})
    # purchase return + claims
    c("post_purchase_return", {"input": {"vendor_id": vend, "purchase_id": pur["id"], "reason": "expired", "lines": [{"variant_id": prods[1], "unit_id": unit, "qty_milli": 1000, "unit_cost_paisa": 12000}]}})
    cl = c("create_claim", {"input": {"kind": "damaged", "variant_id": prods[0], "qty_milli": 1000, "vendor_id": vend, "notes": "broken"}})
    c("create_claim", {"input": {"kind": "warranty", "variant_id": prods[2], "qty_milli": 1000, "customer_id": cust, "vendor_id": vend2, "serial": "SN1"}})
    c("update_claim", {"id": cl["id"], "status": "rejected", "notes": None, "credit_paisa": None})
    return dict(unit=unit, prods=prods, svc=svc, cust=cust, vend=vend, sales=[s1, s2, s3, s4, s5], pur=pur, mid=mid)


def more_changes(shop, d):
    """After the first upload: edits that delete and re-add rows on the PC."""
    c = shop.call
    s5 = d["sales"][4]
    L = lambda v, q: {"variant_id": v, "unit_id": d["unit"], "qty_milli": q, "discount_paisa": 0, "price_override_paisa": None}
    q_old = s5["total_paisa"]
    prev = c("quote_sale_edit", {"input": {"sale_id": s5["id"], "expected_revision": 0, "customer_id": None, "lines": [L(d["prods"][0], 2000), L(d["prods"][3], 1000)],
                                           "global_discount_paisa": 0, "settlement": [], "refund_to_khata": False, "reason": "x"}})
    c("edit_sale", {"input": {"sale_id": s5["id"], "expected_revision": 0, "customer_id": None, "lines": [L(d["prods"][0], 2000), L(d["prods"][3], 1000)],
                              "global_discount_paisa": 0, "settlement": [{"method": "cash", "amount_paisa": prev["diff_paisa"]}], "refund_to_khata": False, "reason": "added soap"}})
    c("update_price", {"variant_id": d["prods"][0], "retail_paisa": 16000, "wholesale_paisa": 11500})
    pd = c("product_detail", {"product_id": [p for p in c("search_products", {"query": "Dead Stock"})][0]["product_id"]})
    inp = {k: pd.get(k) for k in ["sku", "name", "name_ur", "category_id", "brand_id", "base_unit_id", "barcode", "retail_price_paisa", "wholesale_price_paisa", "tax_rate_id", "reorder_level_milli", "is_service", "active"]}
    inp.update(product_id=pd["product_id"], name="Dead Stock (old)", reorder_level_milli=2000, packaging_unit=None)
    c("update_product", {"input": inp})


def pg():
    con = psycopg2.connect(DSN)
    con.autocommit = True
    return con


def as_user(cur, uid):
    cur.execute("RESET ROLE")
    if uid is None:
        cur.execute("SELECT set_config('request.jwt.claim.sub', '', false)")
        cur.execute("SET ROLE anon")
    else:
        cur.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid),))
        cur.execute("SET ROLE authenticated")


def sync(shop, cur, shop_id, key):
    sent = 0
    while True:
        b = shop.call("cloud_dev_batch", {"max": 300})
        if not b:
            return sent
        as_user(cur, None)
        cur.execute("SELECT public.ingest(%s, %s, %s::jsonb)", (shop_id, key, json.dumps(b["rows"])))
        sent += cur.fetchone()[0]
        shop.call("cloud_dev_ack", {"upto_seq": b["upto_seq"]})


def norm(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, list):
        return [norm(x) for x in v]
    if isinstance(v, dict):
        return {k: norm(x) for k, x in v.items()}
    return v


def compare(label, pc, cl):
    pc, cl = norm(pc), norm(cl)
    for k in ["kind", "title", "dated", "columns", "totals", "summary", "note"]:
        if pc.get(k) != cl.get(k):
            check(False, f"{label}: '{k}' differs\n   PC:    {json.dumps(pc.get(k), ensure_ascii=False)[:600]}\n   cloud: {json.dumps(cl.get(k), ensure_ascii=False)[:600]}")
            return
    if pc["dated"]:
        for k in ["from", "to"]:
            check(pc[k] == cl[k], f"{label}: '{k}' differs PC {pc[k]} cloud {cl[k]}")
    if pc["rows"] != cl["rows"]:
        same_set = sorted(map(json.dumps, pc["rows"])) == sorted(map(json.dumps, cl["rows"]))
        check(False, f"{label}: rows differ{' (order only)' if same_set else ''}\n   PC:    {json.dumps(pc['rows'], ensure_ascii=False)[:900]}\n   cloud: {json.dumps(cl['rows'], ensure_ascii=False)[:900]}")
    else:
        check(True, label)


def main():
    con = pg()
    cur = con.cursor()
    cur.execute("RESET ROLE")
    owner, manager, stranger = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for u, e in [(owner, f"owner-{owner}@t.pk"), (manager, f"mgr-{manager}@t.pk"), (stranger, f"x-{stranger}@t.pk")]:
        cur.execute("INSERT INTO auth.users (id, email) VALUES (%s, %s)", (str(u), e))

    shops = [Shop(4861), Shop(4862)]
    try:
        data = [fill(shops[0], "Madina Store Saddar", 0), fill(shops[1], "Madina Store Gulberg", 1)]
        ids = []
        for i, sh in enumerate(shops):
            as_user(cur, owner)
            cur.execute("SELECT public.create_shop(%s)", (["Saddar", "Gulberg"][i],))
            sid = cur.fetchone()[0]
            cur.execute("SELECT public.new_link_code(%s)", (sid,))
            code = cur.fetchone()[0]
            as_user(cur, None)
            cur.execute("SELECT public.link_shop(%s, %s)", (code.lower(), "PC"))
            res = cur.fetchone()[0]
            check(res["shop_id"] == sid and len(res["shop_key"]) == 64, "link_shop returns the shop and a key")
            try:
                cur.execute("SELECT public.link_shop(%s, %s)", (code, "PC"))
                check(False, "a link code works only once")
            except psycopg2.Error:
                check(True, "a link code works only once")
            sh.call("cloud_dev_link", {"url": "http://127.0.0.1", "anon_key": "anon", "shop_id": sid, "shop_key": res["shop_key"]})
            n = sync(sh, cur, sid, res["shop_key"])
            check(n > 50, f"first upload sent {n} rows")
            more_changes(sh, data[i])
            n2 = sync(sh, cur, sid, res["shop_key"])
            check(0 < n2 < 80, f"after edits only the changes were sent ({n2} rows)")
            ids.append((sid, res["shop_key"]))

        # wrong key is refused
        as_user(cur, None)
        try:
            cur.execute("SELECT public.ingest(%s, %s, '[]'::jsonb)", (ids[0][0], "bad"))
            check(False, "a wrong shop key is refused")
        except psycopg2.Error:
            check(True, "a wrong shop key is refused")

        now = dt.datetime.now(dt.timezone.utc)
        mid = data[0]["mid"]
        periods = [("today", now.replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(hours=5), now + dt.timedelta(minutes=1)),
                   ("from mid-day", mid, now + dt.timedelta(minutes=1)),
                   ("before mid", mid - dt.timedelta(days=1), mid),
                   ("90 days", now - dt.timedelta(days=90), now + dt.timedelta(minutes=1))]
        offsets = [300, 0, -480]
        compared = 0
        for si, sh in enumerate(shops):
            sid = ids[si][0]
            for pname, f, t in periods:
                for off in offsets if si == 0 else [300]:
                    for k in KINDS:
                        pcr = sh.call("report", {"kind": k, "from": iso(f), "to": iso(t), "offset_min": off})
                        as_user(cur, owner)
                        cur.execute("SELECT public.report(%s, %s, %s, %s, %s::uuid[])", (k, iso(f), iso(t), off, [sid]))
                        clr = cur.fetchone()[0]
                        compare(f"shop{si + 1} {k} [{pname}, offset {off}]", pcr, clr)
                        compared += 1
        print(f"compared {compared} reports")

        # All shops together: Shop column, totals add up.
        as_user(cur, owner)
        both = [ids[0][0], ids[1][0]]
        f, t = periods[3][1], periods[3][2]
        for k in ["sales", "stock", "profit", "daily", "analysis_trend", "list_customers"]:
            cur.execute("SELECT public.report(%s, %s, %s, 300, %s::uuid[])", (k, iso(f), iso(t), both))
            allr = cur.fetchone()[0]
            parts = []
            for sid in both:
                cur.execute("SELECT public.report(%s, %s, %s, 300, %s::uuid[])", (k, iso(f), iso(t), [sid]))
                parts.append(cur.fetchone()[0])
            if k in ("daily", "analysis_trend"):
                check(allr["columns"] == parts[0]["columns"], f"all shops {k}: same columns")
            else:
                check(allr["columns"][0]["label"] == "Shop", f"all shops {k}: Shop column first")
                check(len(allr["rows"]) == len(parts[0]["rows"]) + len(parts[1]["rows"]), f"all shops {k}: rows of both shops")
            for i, c in enumerate(allr["columns"]):
                if allr["totals"] and isinstance(allr["totals"][i], int):
                    j = [x["key"] for x in parts[0]["columns"]].index(c["key"])
                    s = sum((p["totals"][j] or 0) if p["totals"] else 0 for p in parts)
                    check(allr["totals"][i] == s, f"all shops {k}: total {c['key']} {allr['totals'][i]} = {s}")

        # Who may see what.
        cur.execute("RESET ROLE")
        cur.execute("SELECT email FROM auth.users WHERE id = %s", (str(manager),))
        mgr_email = cur.fetchone()[0]
        as_user(cur, owner)
        cur.execute("SELECT public.add_manager(%s, %s)", (ids[0][0], mgr_email.upper()))
        check(cur.fetchone()[0] == "added", "owner adds a manager")
        as_user(cur, manager)
        cur.execute("SELECT count(*) FROM public.my_shops()")
        check(cur.fetchone()[0] == 1, "manager sees only the shop they were added to")
        cur.execute("SELECT public.report('sales', %s, %s, 300, %s::uuid[])", (iso(f), iso(t), [ids[0][0]]))
        check(len(cur.fetchone()[0]["rows"]) > 0, "manager sees the sales report")
        for kind, shopset, who in [("activity", [ids[0][0]], manager), ("sales", [ids[1][0]], manager), ("sales", [ids[0][0]], stranger)]:
            as_user(cur, who)
            try:
                cur.execute("SELECT public.report(%s, %s, %s, 300, %s::uuid[])", (kind, iso(f), iso(t), shopset))
                check(False, f"refused: {kind} for {'manager' if who == manager else 'stranger'}")
            except psycopg2.Error:
                check(True, "refused")
        as_user(cur, None)
        try:
            cur.execute("SELECT public.report('sales', %s, %s, 300, %s::uuid[])", (iso(f), iso(t), [ids[0][0]]))
            check(False, "anonymous cannot read reports")
        except psycopg2.Error:
            check(True, "anonymous cannot read reports")
        try:
            cur.execute("SELECT count(*) FROM mirror.sales")
            check(False, "mirror tables are not readable directly")
        except psycopg2.Error:
            check(True, "mirror tables are not readable directly")
        as_user(cur, stranger)
        cur.execute("SELECT count(*) FROM public.shops")
        check(cur.fetchone()[0] == 0, "a stranger sees no shops")
        try:
            cur.execute("SELECT key_hash FROM public.shops")
            check(False, "key hash is never readable")
        except psycopg2.Error:
            check(True, "key hash is never readable")
        # passwords never reached the cloud
        cur.execute("RESET ROLE")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = 'mirror' AND table_name = 'users'")
        cols = {r[0] for r in cur.fetchall()}
        check(not ({"password_hash", "pin_hash"} & cols), "no password / PIN columns on the cloud")
    finally:
        for s in shops:
            s.stop()
    print(f"{checks} checks — {'ALL PASS' if ok else 'SOME FAILED'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
