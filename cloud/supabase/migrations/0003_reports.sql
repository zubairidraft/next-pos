-- The same 18 reports as the shop PC (crates/pos-core/src/reports.rs), worked
-- out from the cloud copy. Same columns, rows, totals and summary, so a report
-- reads the same on the PC, the admin website and the phone.
--
-- public.report(kind, from, to, offset_min, shops[]) — owner or manager of
-- every shop asked for. With more than one shop a "Shop" column comes first
-- and the figures cover all of them.

CREATE SCHEMA IF NOT EXISTS rpt;
REVOKE ALL ON SCHEMA rpt FROM PUBLIC;

-- ------------------------------------------------------------------ helpers

-- RFC 3339 text exactly as the PC writes it (chrono to_rfc3339 for UTC).
CREATE OR REPLACE FUNCTION rpt.rfc(ts timestamptz) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') ||
    CASE WHEN m = 0 THEN '' WHEN m % 1000 = 0 THEN '.' || lpad((m / 1000)::text, 3, '0') ELSE '.' || lpad(m::text, 6, '0') END || '+00:00'
  FROM (SELECT (extract(microseconds FROM ts)::bigint % 1000000) AS m) x;
$$;

-- Local calendar day / month of a stored time (SQLite date(datetime(col, '+N minutes'))).
CREATE OR REPLACE FUNCTION rpt.day(col text, off int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char((col::timestamptz AT TIME ZONE 'UTC') + make_interval(mins => off), 'YYYY-MM-DD');
$$;
CREATE OR REPLACE FUNCTION rpt.month(col text, off int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char((col::timestamptz AT TIME ZONE 'UTC') + make_interval(mins => off), 'YYYY-MM');
$$;

-- qty_milli / 1000.0 as SQLite prints a REAL (2.0, 1.5, 0.25).
CREATE OR REPLACE FUNCTION rpt.real_text(q bigint) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN q % 1000 = 0 THEN (q / 1000)::text || '.0'
              ELSE rtrim(rtrim((q::numeric / 1000)::text, '0'), '.') END;
$$;

-- Percent with one decimal, or null (Rust pct()).
CREATE OR REPLACE FUNCTION rpt.pct(part bigint, whole bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN whole = 0 THEN 'null'::jsonb ELSE to_jsonb(round(round(part::numeric / whole * 1000) / 10, 1)) END;
$$;

CREATE OR REPLACE FUNCTION rpt.col(k text, l text, kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('key', k, 'label', l, 'kind', kind);
$$;
CREATE OR REPLACE FUNCTION rpt.stat(l text, v jsonb, kind text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('label', l, 'value', v, 'kind', kind);
$$;

CREATE OR REPLACE FUNCTION rpt.title(kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'stock' THEN 'Stock report' WHEN 'purchases' THEN 'Purchase report' WHEN 'purchase_returns' THEN 'Purchase return report'
    WHEN 'sales' THEN 'Sales report' WHEN 'sale_returns' THEN 'Sale return report' WHEN 'services' THEN 'Services report'
    WHEN 'daily' THEN 'Daily summary' WHEN 'recovery' THEN 'Recovery report' WHEN 'salesman' THEN 'Salesman report'
    WHEN 'claims' THEN 'Claim report' WHEN 'profit' THEN 'Profit report' WHEN 'activity' THEN 'Activity report'
    WHEN 'analysis_trend' THEN 'Analysis: sales trend' WHEN 'analysis_movers' THEN 'Analysis: fast and slow items'
    WHEN 'analysis_margin' THEN 'Analysis: product margin' WHEN 'list_products' THEN 'List: products'
    WHEN 'list_customers' THEN 'List: customers' WHEN 'list_vendors' THEN 'List: vendors' END;
$$;

-- Builder.finish(): totals row ("Total" in the first text column) and the table.
-- p_rows rows start with the shop name; it is dropped for one shop.
CREATE OR REPLACE FUNCTION rpt.finish(p_kind text, p_from text, p_to text, p_dated boolean, p_cols jsonb, p_rows jsonb,
                                      p_sum text[], p_summary jsonb, p_note text, p_multi boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE cols jsonb; rows jsonb; totals jsonb := '[]'::jsonb; i int; n int; first_text int; s bigint;
BEGIN
  IF p_multi THEN
    cols := jsonb_build_array(rpt.col('shop', 'Shop', 'text')) || p_cols;
    rows := coalesce(p_rows, '[]'::jsonb);
  ELSE
    cols := p_cols;
    SELECT coalesce(jsonb_agg(r - 0 ORDER BY o), '[]'::jsonb) INTO rows FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) WITH ORDINALITY x(r, o);
  END IF;
  n := jsonb_array_length(cols);
  IF coalesce(array_length(p_sum, 1), 0) > 0 AND jsonb_array_length(rows) > 0 THEN
    FOR i IN 0 .. n - 1 LOOP
      IF (cols->i->>'key') = ANY (p_sum) THEN
        SELECT coalesce(sum(CASE WHEN jsonb_typeof(r->i) = 'number' AND (r->>i) !~ '[.eE]' THEN (r->>i)::bigint ELSE 0 END), 0) INTO s
        FROM jsonb_array_elements(rows) r;
        totals := totals || to_jsonb(s);
      ELSE
        totals := totals || 'null'::jsonb;
      END IF;
    END LOOP;
    SELECT min(o) - 1 INTO first_text FROM jsonb_array_elements(cols) WITH ORDINALITY x(c, o) WHERE c->>'kind' IN ('text', 'date', 'datetime');
    IF first_text IS NOT NULL AND totals->first_text = 'null'::jsonb THEN
      totals := jsonb_set(totals, ARRAY[first_text::text], '"Total"');
    END IF;
  END IF;
  RETURN jsonb_build_object('kind', p_kind, 'title', rpt.title(p_kind), 'from', p_from, 'to', p_to, 'dated', p_dated,
    'columns', cols, 'rows', rows, 'totals', totals, 'summary', coalesce(p_summary, '[]'::jsonb), 'note', p_note);
END $$;

-- Shop names for the Shop column.
CREATE OR REPLACE FUNCTION rpt.shop_name(p uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT name FROM public.shops WHERE id = p;
$$;

CREATE OR REPLACE FUNCTION rpt.user_name(p_shop uuid, uid text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT username FROM mirror.users WHERE shop_id = p_shop AND id = uid;
$$;

-- ------------------------------------------------------------------ reports

CREATE OR REPLACE FUNCTION rpt.r_stock(s uuid[], fs text, ts text, t timestamptz, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; to_now boolean := t >= now() - interval '5 minutes';
BEGIN
  WITH base AS (
    SELECT pv.shop_id, p.name, p.sku, u.code AS unit,
      coalesce(sum(CASE WHEN sm.occurred_at < fs THEN sm.qty_signed_milli END), 0)::bigint AS opening,
      coalesce(sum(CASE WHEN sm.occurred_at >= fs AND sm.qty_signed_milli > 0 THEN sm.qty_signed_milli END), 0)::bigint AS qin,
      coalesce(sum(CASE WHEN sm.occurred_at >= fs AND sm.qty_signed_milli < 0 THEN -sm.qty_signed_milli END), 0)::bigint AS qout,
      coalesce(ib.on_hand_milli, 0) AS on_hand, coalesce(ib.avg_cost_paisa, 0) AS cost, p.reorder_level_milli AS reorder, pv.id AS vid
    FROM mirror.product_variants pv
    JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    JOIN mirror.units u ON u.shop_id = p.shop_id AND u.id = p.base_unit_id
    LEFT JOIN mirror.stock_movements sm ON sm.shop_id = pv.shop_id AND sm.variant_id = pv.id AND sm.occurred_at <= ts
    LEFT JOIN mirror.inventory_balances ib ON ib.shop_id = pv.shop_id AND ib.variant_id = pv.id
    WHERE pv.shop_id = ANY (s) AND p.is_service = 0 AND p.active = 1
    GROUP BY pv.shop_id, pv.id, p.name, p.sku, u.code, ib.on_hand_milli, ib.avg_cost_paisa, p.reorder_level_milli
  ), calc AS (
    SELECT *, CASE WHEN to_now THEN on_hand - qin + qout ELSE opening END AS op2,
              CASE WHEN to_now THEN on_hand ELSE opening + qin - qout END AS closing
    FROM base
  ), st AS (
    SELECT *, CASE WHEN closing <= 0 THEN 'Out of stock' WHEN reorder > 0 AND closing <= reorder THEN 'Low' ELSE '' END AS status FROM calc
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(shop_id), name, sku, unit, op2, qin, qout, closing, cost, greatest(closing, 0) * cost / 1000, status)
         ORDER BY lower(name), shop_id, vid), '[]'::jsonb)
  INTO rows FROM st;
  RETURN rpt.finish('stock', fs, ts, true,
    jsonb_build_array(rpt.col('name','Product','text'), rpt.col('sku','SKU','text'), rpt.col('unit','Unit','text'), rpt.col('opening','Opening','qty'),
      rpt.col('in','In','qty'), rpt.col('out','Out','qty'), rpt.col('closing','Closing','qty'), rpt.col('cost','Avg cost','money'),
      rpt.col('value','Value','money'), rpt.col('status','Status','text')),
    rows, ARRAY['value'],
    jsonb_build_array(
      rpt.stat('Products', to_jsonb(jsonb_array_length(rows)), 'int'),
      rpt.stat('Low stock', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>10 = 'Low')), 'int'),
      rpt.stat('Out of stock', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>10 = 'Out of stock')), 'int'),
      rpt.stat('Stock value (at cost)', to_jsonb((SELECT coalesce(sum((r->>9)::bigint), 0) FROM jsonb_array_elements(rows) r)), 'money')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_sales(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; total bigint; returns bigint; n int;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(x.shop_id), x.created_at, x.doc_no, x.customer, x.salesman, x.items, x.subtotal_paisa,
           x.discount_paisa, x.tax_paisa, x.total_paisa, x.khata, x.total_paisa - x.khata) ORDER BY x.created_at, x.shop_id), '[]'::jsonb)
  INTO rows FROM (
    SELECT sa.shop_id, sa.created_at, sa.doc_no, coalesce(pa.name, 'Walk-in') AS customer, coalesce(u1.username, u2.username, '') AS salesman,
      (SELECT count(*) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id) AS items,
      sa.subtotal_paisa, sa.discount_paisa, sa.tax_paisa, sa.total_paisa,
      coalesce((SELECT sum(debit_paisa) FROM mirror.party_ledger pl WHERE pl.shop_id = sa.shop_id AND pl.source_doc = sa.doc_no AND pl.entry_type = 'sale'), 0)::bigint AS khata
    FROM mirror.sales sa
    LEFT JOIN mirror.parties pa ON pa.shop_id = sa.shop_id AND pa.id = sa.party_id
    LEFT JOIN mirror.users u1 ON u1.shop_id = sa.shop_id AND u1.id = sa.user_id
    LEFT JOIN mirror.cash_sessions cs ON cs.shop_id = sa.shop_id AND cs.id = sa.cash_session_id
    LEFT JOIN mirror.users u2 ON u2.shop_id = sa.shop_id AND u2.id = cs.user_id
    WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts
  ) x;
  n := jsonb_array_length(rows);
  SELECT coalesce(sum((r->>9)::bigint), 0) INTO total FROM jsonb_array_elements(rows) r;
  SELECT coalesce(sum(refund_paisa), 0) INTO returns FROM mirror.sale_returns WHERE shop_id = ANY (s) AND created_at >= fs AND created_at <= ts;
  RETURN rpt.finish('sales', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('doc','Invoice','text'), rpt.col('customer','Customer','text'), rpt.col('salesman','Salesman','text'),
      rpt.col('items','Items','int'), rpt.col('subtotal','Subtotal','money'), rpt.col('discount','Discount','money'), rpt.col('tax','Tax','money'),
      rpt.col('total','Total','money'), rpt.col('khata','On khata','money'), rpt.col('paid','Paid','money')),
    rows, ARRAY['items','subtotal','discount','tax','total','khata','paid'],
    jsonb_build_array(rpt.stat('Bills', to_jsonb(n), 'int'), rpt.stat('Sales', to_jsonb(total), 'money'), rpt.stat('Returns', to_jsonb(returns), 'money'),
      rpt.stat('Net sales', to_jsonb(total - returns), 'money'))
    || CASE WHEN n > 0 THEN jsonb_build_array(rpt.stat('Average bill', to_jsonb(trunc(total::numeric / n)::bigint), 'money')) ELSE '[]'::jsonb END,
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_salesman(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  WITH g AS (
    SELECT sa.shop_id, coalesce(sa.user_id, cs.user_id, '') AS uid, count(*)::bigint AS bills, sum(sa.total_paisa)::bigint AS sales, sum(sa.discount_paisa)::bigint AS disc,
      sum(sa.total_paisa - sa.tax_paisa - (SELECT coalesce(sum(cogs_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id))::bigint AS profit
    FROM mirror.sales sa LEFT JOIN mirror.cash_sessions cs ON cs.shop_id = sa.shop_id AND cs.id = sa.cash_session_id
    WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts
    GROUP BY sa.shop_id, 2
  ), ch AS (
    SELECT shop_id, actor, count(*)::bigint AS n FROM mirror.audit_log
    WHERE shop_id = ANY (s) AND action = 'price_override' AND occurred_at >= fs AND occurred_at <= ts GROUP BY shop_id, actor
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(g.shop_id), coalesce(rpt.user_name(g.shop_id, g.uid), '(unknown)'), g.bills, g.sales, g.disc, g.profit,
           CASE WHEN g.bills > 0 THEN trunc(g.sales::numeric / g.bills)::bigint ELSE 0 END, coalesce(ch.n, 0)) ORDER BY g.sales DESC, g.shop_id, g.uid), '[]'::jsonb)
  INTO rows FROM g LEFT JOIN ch ON ch.shop_id = g.shop_id AND ch.actor = g.uid;
  RETURN rpt.finish('salesman', fs, ts, true,
    jsonb_build_array(rpt.col('salesman','Salesman','text'), rpt.col('bills','Bills','int'), rpt.col('sales','Sales','money'), rpt.col('discount','Discount given','money'),
      rpt.col('profit','Profit','money'), rpt.col('avg','Average bill','money'), rpt.col('price_changes','Price changes','int')),
    rows, ARRAY['bills','sales','discount','profit','price_changes'], '[]'::jsonb,
    'Price changes = items sold at a price other than the set sale price.', multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.friendly_action(action text, entity text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(CASE action
    WHEN 'login' THEN 'Logged in' WHEN 'login_success' THEN 'Logged in' WHEN 'logout' THEN 'Logged out' WHEN 'login_failed' THEN 'Wrong password / PIN'
    WHEN 'sale_posted' THEN 'Sale' WHEN 'price_override' THEN 'Price changed at the counter' WHEN 'return_posted' THEN 'Sale return'
    WHEN 'purchase_posted' THEN 'Purchase' WHEN 'purchase_returned' THEN 'Purchase return' WHEN 'product_created' THEN 'Product added'
    WHEN 'price_changed' THEN 'Price changed' WHEN 'catalog_imported' THEN 'Products imported' WHEN 'claim_created' THEN 'Claim made'
    WHEN 'claim_updated' THEN 'Claim updated' WHEN 'shift_opened' THEN 'Shift started' WHEN 'shift_closed' THEN 'Shift closed'
    WHEN 'cash_drop' THEN 'Cash drop' WHEN 'user_created' THEN 'User added' WHEN 'pin_changed' THEN 'PIN changed'
    WHEN 'settings_changed' THEN 'Settings changed' WHEN 'backup_created' THEN 'Backup made' WHEN 'backup_restored' THEN 'Backup restored'
    WHEN 'phone_paired' THEN 'Phone connected' WHEN 'phone_removed' THEN 'Phone removed' WHEN 'stock_count_finalized' THEN 'Stock count applied'
    WHEN 'barcode_assigned' THEN 'Barcode made' WHEN 'payment_received' THEN 'Khata payment received' END,
    replace(action, '_', ' ') || ' (' || replace(entity, '_', ' ') || ')');
$$;

-- "key: value, ..." from the details JSON (first 4 keys in byte order, as serde's BTreeMap).
-- json (not jsonb) keeps each value exactly as the PC wrote it.
CREATE OR REPLACE FUNCTION rpt.details_text(details text, reason text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE j json; d text := ''; rec record; v text; i int := 0;
BEGIN
  BEGIN j := details::json; EXCEPTION WHEN others THEN j := NULL; END;
  IF json_typeof(j) = 'object' THEN
    FOR rec IN SELECT key, value FROM json_each(j) ORDER BY key COLLATE "C" LOOP
      EXIT WHEN i >= 4;
      i := i + 1;
      IF rec.key LIKE '%\_paisa' AND json_typeof(rec.value) = 'number' AND rec.value::text !~ '[.eE]' THEN
        v := 'Rs ' || to_char(rec.value::text::numeric / 100, 'FM999999999999999990.00');
      ELSIF json_typeof(rec.value) = 'string' THEN
        v := rec.value #>> '{}';
      ELSE
        v := rec.value::text;
      END IF;
      IF d <> '' THEN d := d || ', '; END IF;
      d := d || replace(regexp_replace(rec.key, '(_paisa)+$', ''), '_', ' ') || ': ' || v;
    END LOOP;
  END IF;
  IF coalesce(reason, '') <> '' THEN
    IF d <> '' THEN d := d || ' · '; END IF;
    d := d || reason;
  END IF;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION rpt.r_activity(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(x.shop_id), x.occurred_at,
           coalesce(rpt.user_name(x.shop_id, x.actor), CASE WHEN coalesce(x.actor, '') = '' OR x.actor = 'system' THEN 'System' ELSE x.actor END),
           rpt.friendly_action(x.action, x.entity), rpt.details_text(x.details_json, x.reason)) ORDER BY x.occurred_at DESC, x.shop_id), '[]'::jsonb)
  INTO rows FROM (
    SELECT * FROM mirror.audit_log WHERE shop_id = ANY (s) AND occurred_at >= fs AND occurred_at <= ts ORDER BY occurred_at DESC LIMIT 5000
  ) x;
  RETURN rpt.finish('activity', fs, ts, true,
    jsonb_build_array(rpt.col('time','Time','datetime'), rpt.col('user','User','text'), rpt.col('action','What happened','text'), rpt.col('details','Details','text')),
    rows, ARRAY[]::text[], '[]'::jsonb,
    CASE WHEN jsonb_array_length(rows) >= 5000 THEN 'Showing the latest 5000 entries. Choose a shorter period to see all.' END, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_purchases(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; total bigint; returns bigint;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(pu.shop_id), pu.created_at, pu.doc_no, pa.name, coalesce(pu.vendor_invoice_no, ''),
           (SELECT count(*) FROM mirror.purchase_lines pl WHERE pl.shop_id = pu.shop_id AND pl.purchase_id = pu.id), pu.freight_paisa, pu.total_paisa)
           ORDER BY pu.created_at, pu.shop_id), '[]'::jsonb)
  INTO rows
  FROM mirror.purchases pu JOIN mirror.parties pa ON pa.shop_id = pu.shop_id AND pa.id = pu.vendor_id
  WHERE pu.shop_id = ANY (s) AND pu.status = 'received' AND pu.created_at >= fs AND pu.created_at <= ts;
  SELECT coalesce(sum((r->>7)::bigint), 0) INTO total FROM jsonb_array_elements(rows) r;
  SELECT coalesce(sum(total_paisa), 0) INTO returns FROM mirror.purchase_returns WHERE shop_id = ANY (s) AND created_at >= fs AND created_at <= ts;
  RETURN rpt.finish('purchases', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('doc','Purchase no.','text'), rpt.col('vendor','Vendor','text'), rpt.col('bill','Vendor bill','text'),
      rpt.col('items','Items','int'), rpt.col('freight','Freight','money'), rpt.col('total','Total','money')),
    rows, ARRAY['items','freight','total'],
    jsonb_build_array(rpt.stat('Purchases', to_jsonb(jsonb_array_length(rows)), 'int'), rpt.stat('Total bought', to_jsonb(total), 'money'),
      rpt.stat('Returned to vendors', to_jsonb(returns), 'money'), rpt.stat('Net purchases', to_jsonb(total - returns), 'money')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_purchase_returns(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(r.shop_id), r.created_at, r.doc_no, pa.name,
           coalesce((SELECT string_agg(p.name || ' × ' || rpt.real_text(l.qty_milli), ', ' ORDER BY l.id) FROM mirror.purchase_return_lines l
             JOIN mirror.product_variants pv ON pv.shop_id = l.shop_id AND pv.id = l.variant_id
             JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id WHERE l.shop_id = r.shop_id AND l.return_id = r.id), ''),
           coalesce(r.reason, ''), r.total_paisa) ORDER BY r.created_at, r.shop_id), '[]'::jsonb)
  INTO rows
  FROM mirror.purchase_returns r JOIN mirror.parties pa ON pa.shop_id = r.shop_id AND pa.id = r.vendor_id
  WHERE r.shop_id = ANY (s) AND r.created_at >= fs AND r.created_at <= ts;
  RETURN rpt.finish('purchase_returns', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('doc','Return no.','text'), rpt.col('vendor','Vendor','text'), rpt.col('products','Products','text'),
      rpt.col('reason','Reason','text'), rpt.col('total','Amount','money')),
    rows, ARRAY['total'],
    jsonb_build_array(rpt.stat('Returns', to_jsonb(jsonb_array_length(rows)), 'int'),
      rpt.stat('Total returned', to_jsonb((SELECT coalesce(sum((x->>6)::bigint), 0) FROM jsonb_array_elements(rows) x)), 'money')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_sale_returns(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(r.shop_id), r.created_at, r.doc_no, coalesce(sa.doc_no, ''), coalesce(pa.name, 'Walk-in'),
           coalesce((SELECT string_agg(p.name || ' × ' || rpt.real_text(l.qty_milli), ', ' ORDER BY l.id) FROM mirror.sale_return_lines l
             JOIN mirror.sale_lines sl ON sl.shop_id = l.shop_id AND sl.id = l.original_sale_line_id
             JOIN mirror.product_variants pv ON pv.shop_id = sl.shop_id AND pv.id = sl.variant_id
             JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id WHERE l.shop_id = r.shop_id AND l.return_id = r.id), ''),
           coalesce(r.reason, ''), r.refund_paisa) ORDER BY r.created_at, r.shop_id), '[]'::jsonb)
  INTO rows
  FROM mirror.sale_returns r LEFT JOIN mirror.sales sa ON sa.shop_id = r.shop_id AND sa.id = r.original_sale_id
  LEFT JOIN mirror.parties pa ON pa.shop_id = sa.shop_id AND pa.id = sa.party_id
  WHERE r.shop_id = ANY (s) AND r.created_at >= fs AND r.created_at <= ts;
  RETURN rpt.finish('sale_returns', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('doc','Return no.','text'), rpt.col('invoice','Invoice','text'), rpt.col('customer','Customer','text'),
      rpt.col('products','Products','text'), rpt.col('reason','Reason','text'), rpt.col('refund','Refund','money')),
    rows, ARRAY['refund'],
    jsonb_build_array(rpt.stat('Returns', to_jsonb(jsonb_array_length(rows)), 'int'),
      rpt.stat('Total refunded', to_jsonb((SELECT coalesce(sum((x->>7)::bigint), 0) FROM jsonb_array_elements(rows) x)), 'money')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_services(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(x.shop_id), x.name, x.bills, x.qty, x.amount) ORDER BY x.amount DESC, x.shop_id, x.pid), '[]'::jsonb)
  INTO rows FROM (
    SELECT p.shop_id, p.id AS pid, p.name, count(DISTINCT sa.id)::bigint AS bills, sum(sl.qty_milli)::bigint AS qty, sum(sl.total_paisa)::bigint AS amount
    FROM mirror.sale_lines sl JOIN mirror.sales sa ON sa.shop_id = sl.shop_id AND sa.id = sl.sale_id
    JOIN mirror.product_variants pv ON pv.shop_id = sl.shop_id AND pv.id = sl.variant_id
    JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    WHERE sl.shop_id = ANY (s) AND p.is_service = 1 AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts
    GROUP BY p.shop_id, p.id, p.name
  ) x;
  RETURN rpt.finish('services', fs, ts, true,
    jsonb_build_array(rpt.col('name','Service','text'), rpt.col('bills','Bills','int'), rpt.col('qty','Qty','qty'), rpt.col('amount','Amount','money')),
    rows, ARRAY['bills','amount'],
    jsonb_build_array(rpt.stat('Service income', to_jsonb((SELECT coalesce(sum((x->>4)::bigint), 0) FROM jsonb_array_elements(rows) x)), 'money')),
    CASE WHEN jsonb_array_length(rows) = 0 THEN 'No services sold in this period. Add services in Catalog → Add product → Type: Service.' END, multi);
END $$;

-- Daily summary: all chosen shops added up per day.
CREATE OR REPLACE FUNCTION rpt.r_daily(s uuid[], fs text, ts text, off int, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  WITH parts AS (
    SELECT rpt.day(sa.created_at, off) AS d, count(*)::bigint AS bills, sum(sa.total_paisa)::bigint AS sales, 0::bigint AS returns,
      sum(sa.total_paisa - sa.tax_paisa - (SELECT coalesce(sum(cogs_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id))::bigint AS profit,
      0::bigint AS khata, 0::bigint AS recovered, 0::bigint AS purchases, 0::bigint AS preturns, 0::bigint AS rcost
    FROM mirror.sales sa WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts GROUP BY 1
    UNION ALL
    SELECT rpt.day(r.created_at, off), 0, 0, sum(r.refund_paisa)::bigint, 0, 0, 0, 0, 0,
      sum((SELECT coalesce(sum(trunc(sl.cogs_paisa::numeric * l.qty_milli / greatest(sl.qty_milli, 1))), 0) FROM mirror.sale_return_lines l
           JOIN mirror.sale_lines sl ON sl.shop_id = l.shop_id AND sl.id = l.original_sale_line_id WHERE l.shop_id = r.shop_id AND l.return_id = r.id))::bigint
    FROM mirror.sale_returns r WHERE r.shop_id = ANY (s) AND r.created_at >= fs AND r.created_at <= ts GROUP BY 1
    UNION ALL
    SELECT rpt.day(pl.occurred_at, off), 0, 0, 0, 0,
      sum(CASE WHEN pl.entry_type = 'sale' THEN pl.debit_paisa ELSE 0 END)::bigint, sum(CASE WHEN pl.entry_type = 'payment' THEN pl.credit_paisa ELSE 0 END)::bigint, 0, 0, 0
    FROM mirror.party_ledger pl JOIN mirror.parties pa ON pa.shop_id = pl.shop_id AND pa.id = pl.party_id
    WHERE pl.shop_id = ANY (s) AND pa.party_type IN ('customer', 'both') AND pl.occurred_at >= fs AND pl.occurred_at <= ts GROUP BY 1
    UNION ALL
    SELECT rpt.day(created_at, off), 0, 0, 0, 0, 0, 0, sum(total_paisa)::bigint, 0, 0
    FROM mirror.purchases WHERE shop_id = ANY (s) AND status = 'received' AND created_at >= fs AND created_at <= ts GROUP BY 1
    UNION ALL
    SELECT rpt.day(created_at, off), 0, 0, 0, 0, 0, 0, 0, sum(total_paisa)::bigint, 0
    FROM mirror.purchase_returns WHERE shop_id = ANY (s) AND created_at >= fs AND created_at <= ts GROUP BY 1
  ), days AS (
    SELECT d, sum(bills)::bigint b, sum(sales)::bigint sa, sum(returns)::bigint re, sum(profit)::bigint pr, sum(khata)::bigint kh,
           sum(recovered)::bigint rc, sum(purchases)::bigint pu, sum(preturns)::bigint prt, sum(rcost)::bigint rco
    FROM parts GROUP BY d
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(NULL, d, b, sa, re, sa - re, pr - (re - rco), kh, rc, pu, prt) ORDER BY d COLLATE "C"), '[]'::jsonb) INTO rows FROM days;
  RETURN rpt.finish('daily', fs, ts, true,
    jsonb_build_array(rpt.col('day','Date','date'), rpt.col('bills','Bills','int'), rpt.col('sales','Sales','money'), rpt.col('returns','Returns','money'),
      rpt.col('net','Net sales','money'), rpt.col('profit','Profit','money'), rpt.col('khata','Sold on khata','money'), rpt.col('recovered','Recovered','money'),
      rpt.col('purchases','Purchases','money'), rpt.col('purchase_returns','Purchase returns','money')),
    rows, ARRAY['bills','sales','returns','net','profit','khata','recovered','purchases','purchase_returns'], '[]'::jsonb,
    'Profit = sales without tax − cost of goods, less returns.', false);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_recovery(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; recovered bigint; given bigint; due bigint;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(pl.shop_id), pl.occurred_at, pa.name, coalesce(pa.phone, ''),
           coalesce((SELECT py.method FROM mirror.payments py WHERE py.shop_id = pl.shop_id AND py.party_id = pl.party_id AND py.occurred_at = pl.occurred_at AND py.direction = 'inbound' LIMIT 1), 'cash'),
           pl.source_doc, pl.credit_paisa) ORDER BY pl.occurred_at, pl.shop_id), '[]'::jsonb)
  INTO rows
  FROM mirror.party_ledger pl JOIN mirror.parties pa ON pa.shop_id = pl.shop_id AND pa.id = pl.party_id
  WHERE pl.shop_id = ANY (s) AND pl.entry_type = 'payment' AND pa.party_type IN ('customer', 'both') AND pl.occurred_at >= fs AND pl.occurred_at <= ts;
  SELECT coalesce(sum((x->>6)::bigint), 0) INTO recovered FROM jsonb_array_elements(rows) x;
  SELECT coalesce(sum(pl.debit_paisa), 0) INTO given FROM mirror.party_ledger pl JOIN mirror.parties pa ON pa.shop_id = pl.shop_id AND pa.id = pl.party_id
    WHERE pl.shop_id = ANY (s) AND pl.entry_type = 'sale' AND pa.party_type IN ('customer', 'both') AND pl.occurred_at >= fs AND pl.occurred_at <= ts;
  SELECT coalesce(sum(bal), 0) INTO due FROM (
    SELECT coalesce((SELECT balance_paisa FROM mirror.party_ledger pl WHERE pl.shop_id = pa.shop_id AND pl.party_id = pa.id ORDER BY occurred_at DESC, id DESC LIMIT 1),
                    pa.opening_balance_paisa) AS bal
    FROM mirror.parties pa WHERE pa.shop_id = ANY (s) AND pa.party_type IN ('customer', 'both') AND pa.active = 1) b WHERE bal > 0;
  RETURN rpt.finish('recovery', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('customer','Customer','text'), rpt.col('phone','Phone','text'), rpt.col('method','Paid by','text'),
      rpt.col('doc','Reference','text'), rpt.col('amount','Amount','money')),
    rows, ARRAY['amount'],
    jsonb_build_array(rpt.stat('Recovered', to_jsonb(recovered), 'money'), rpt.stat('Sold on khata', to_jsonb(given), 'money'),
      rpt.stat('Recovery rate', rpt.pct(recovered, given), 'percent'), rpt.stat('Total due from customers (now)', to_jsonb(due), 'money')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.claim_status_label(st text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE st WHEN 'open' THEN 'Open' WHEN 'sent' THEN 'Sent to company' WHEN 'replaced' THEN 'Replaced' WHEN 'credited' THEN 'Credit received'
    WHEN 'rejected' THEN 'Rejected' ELSE 'Closed' END;
$$;

CREATE OR REPLACE FUNCTION rpt.r_claims(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(c.shop_id), c.created_at, c.doc_no,
           CASE c.kind WHEN 'warranty' THEN 'Warranty' WHEN 'damaged' THEN 'Damaged' ELSE 'Expired' END,
           p.name, c.qty_milli, coalesce(cu.name, ''), coalesce(ve.name, ''), rpt.claim_status_label(c.status), c.value_paisa, c.credit_paisa)
           ORDER BY c.created_at, c.shop_id), '[]'::jsonb)
  INTO rows
  FROM mirror.claims c JOIN mirror.product_variants pv ON pv.shop_id = c.shop_id AND pv.id = c.variant_id
  JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
  LEFT JOIN mirror.parties cu ON cu.shop_id = c.shop_id AND cu.id = c.customer_id
  LEFT JOIN mirror.parties ve ON ve.shop_id = c.shop_id AND ve.id = c.vendor_id
  WHERE c.shop_id = ANY (s) AND c.created_at >= fs AND c.created_at <= ts;
  RETURN rpt.finish('claims', fs, ts, true,
    jsonb_build_array(rpt.col('date','Date','datetime'), rpt.col('doc','Claim no.','text'), rpt.col('type','Type','text'), rpt.col('product','Product','text'),
      rpt.col('qty','Qty','qty'), rpt.col('customer','Customer','text'), rpt.col('vendor','Company / vendor','text'), rpt.col('status','Status','text'),
      rpt.col('value','Value','money'), rpt.col('credit','Credit received','money')),
    rows, ARRAY['value','credit'],
    jsonb_build_array(rpt.stat('Claims', to_jsonb(jsonb_array_length(rows)), 'int'),
      rpt.stat('Still open', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>8 IN ('Open', 'Sent to company'))), 'int'),
      rpt.stat('Loss on rejected claims', to_jsonb((SELECT coalesce(sum((x->>9)::bigint), 0) FROM jsonb_array_elements(rows) x WHERE x->>8 = 'Rejected' AND x->>3 <> 'Warranty')), 'money')),
    NULL, multi);
END $$;

-- Per product: qty, sales without tax, cost, returns, returned cost (Rust product_profit()).
CREATE OR REPLACE FUNCTION rpt.product_profit(s uuid[], fs text, ts text)
RETURNS TABLE (shop_id uuid, vid text, name text, qty bigint, sales bigint, cost bigint, refund bigint, rcost bigint)
LANGUAGE sql STABLE AS $$
  WITH sold AS (
    SELECT pv.shop_id, pv.id AS vid, p.name, sum(sl.qty_milli)::bigint AS qty, sum(sl.total_paisa - sl.tax_paisa)::bigint AS sales, sum(sl.cogs_paisa)::bigint AS cost
    FROM mirror.sale_lines sl JOIN mirror.sales sa ON sa.shop_id = sl.shop_id AND sa.id = sl.sale_id
    JOIN mirror.product_variants pv ON pv.shop_id = sl.shop_id AND pv.id = sl.variant_id
    JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    JOIN mirror.units u ON u.shop_id = sl.shop_id AND u.id = sl.unit_id
    WHERE sl.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts
    GROUP BY pv.shop_id, pv.id, p.name
  ), ret AS (
    SELECT sl.shop_id, sl.variant_id AS vid, sum(l.refund_paisa)::bigint AS refund,
           sum(trunc(sl.cogs_paisa::numeric * l.qty_milli / greatest(sl.qty_milli, 1)))::bigint AS rcost
    FROM mirror.sale_return_lines l JOIN mirror.sale_returns r ON r.shop_id = l.shop_id AND r.id = l.return_id
    JOIN mirror.sale_lines sl ON sl.shop_id = l.shop_id AND sl.id = l.original_sale_line_id
    WHERE l.shop_id = ANY (s) AND r.created_at >= fs AND r.created_at <= ts GROUP BY sl.shop_id, sl.variant_id
  )
  SELECT sold.shop_id, sold.vid, sold.name, sold.qty, sold.sales, sold.cost, coalesce(ret.refund, 0), coalesce(ret.rcost, 0)
  FROM sold LEFT JOIN ret ON ret.shop_id = sold.shop_id AND ret.vid = sold.vid;
$$;

CREATE OR REPLACE FUNCTION rpt.r_profit(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; line_profit bigint; sales bigint; returns bigint; bill_disc bigint;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(x.shop_id), x.name, x.qty, x.sales, x.cost, x.refund, x.profit, rpt.pct(x.profit, x.sales - x.refund))
           ORDER BY x.profit DESC, x.shop_id, x.vid), '[]'::jsonb)
  INTO rows FROM (SELECT pp.*, pp.sales - pp.cost - (pp.refund - pp.rcost) AS profit FROM rpt.product_profit(s, fs, ts) pp) x;
  SELECT coalesce(sum((r->>6)::bigint), 0), coalesce(sum((r->>3)::bigint), 0), coalesce(sum((r->>5)::bigint), 0) INTO line_profit, sales, returns FROM jsonb_array_elements(rows) r;
  SELECT coalesce(sum(sa.discount_paisa - (SELECT coalesce(sum(discount_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id)), 0)
  INTO bill_disc FROM mirror.sales sa WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts;
  RETURN rpt.finish('profit', fs, ts, true,
    jsonb_build_array(rpt.col('name','Product','text'), rpt.col('qty','Qty sold','qty'), rpt.col('sales','Sales','money'), rpt.col('cost','Cost','money'),
      rpt.col('returns','Returns','money'), rpt.col('profit','Profit','money'), rpt.col('margin','Margin %','percent')),
    rows, ARRAY['sales','cost','returns','profit'],
    jsonb_build_array(rpt.stat('Sales (without tax)', to_jsonb(sales), 'money'), rpt.stat('Returns', to_jsonb(returns), 'money'),
      rpt.stat('Discounts on whole bills', to_jsonb(bill_disc), 'money'), rpt.stat('Net profit', to_jsonb(line_profit - bill_disc), 'money'),
      rpt.stat('Margin', rpt.pct(line_profit - bill_disc, sales - returns - bill_disc), 'percent')),
    'Cost is the average purchase cost at the time of each sale.', multi);
END $$;

-- Sales trend: all chosen shops added up per day (or month for more than 62 days).
CREATE OR REPLACE FUNCTION rpt.r_trend(s uuid[], f timestamptz, t timestamptz, off int) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE fs text := rpt.rfc(f); ts text := rpt.rfc(t); monthly boolean := (t - f) > interval '62 days'; rows jsonb;
        pf text; pt text; cb bigint; cs bigint; cp bigint; pb bigint; ps bigint; pp bigint;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(NULL, per, bills, sales, profit, CASE WHEN bills > 0 THEN trunc(sales::numeric / bills)::bigint ELSE 0 END) ORDER BY per COLLATE "C"), '[]'::jsonb)
  INTO rows FROM (
    SELECT CASE WHEN monthly THEN rpt.month(sa.created_at, off) ELSE rpt.day(sa.created_at, off) END AS per, count(*)::bigint AS bills, sum(sa.total_paisa)::bigint AS sales,
      sum(sa.total_paisa - sa.tax_paisa - (SELECT coalesce(sum(cogs_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id))::bigint AS profit
    FROM mirror.sales sa WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts GROUP BY 1
  ) x;
  pf := rpt.rfc(f - (t - f) - interval '1 millisecond');
  pt := rpt.rfc(f - interval '1 millisecond');
  SELECT count(*), coalesce(sum(sa.total_paisa), 0),
         coalesce(sum(sa.total_paisa - sa.tax_paisa - (SELECT coalesce(sum(cogs_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id)), 0)
  INTO cb, cs, cp FROM mirror.sales sa WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts;
  SELECT count(*), coalesce(sum(sa.total_paisa), 0),
         coalesce(sum(sa.total_paisa - sa.tax_paisa - (SELECT coalesce(sum(cogs_paisa), 0) FROM mirror.sale_lines sl WHERE sl.shop_id = sa.shop_id AND sl.sale_id = sa.id)), 0)
  INTO pb, ps, pp FROM mirror.sales sa WHERE sa.shop_id = ANY (s) AND sa.status = 'posted' AND sa.created_at >= pf AND sa.created_at <= pt;
  RETURN rpt.finish('analysis_trend', fs, ts, true,
    jsonb_build_array(CASE WHEN monthly THEN rpt.col('period','Month','text') ELSE rpt.col('period','Date','date') END,
      rpt.col('bills','Bills','int'), rpt.col('sales','Sales','money'), rpt.col('profit','Profit','money'), rpt.col('avg','Average bill','money')),
    rows, ARRAY['bills','sales','profit'],
    jsonb_build_array(rpt.stat('Sales this period', to_jsonb(cs), 'money'), rpt.stat('Sales previous period', to_jsonb(ps), 'money'),
      rpt.stat('Sales change', CASE WHEN ps = 0 THEN 'null'::jsonb ELSE to_jsonb(round(round((cs - ps)::numeric / ps * 1000) / 10, 1)) END, 'percent'),
      rpt.stat('Profit change', CASE WHEN pp = 0 THEN 'null'::jsonb ELSE to_jsonb(round(round((cp - pp)::numeric / pp * 1000) / 10, 1)) END, 'percent'),
      rpt.stat('Bills change', CASE WHEN pb = 0 THEN 'null'::jsonb ELSE to_jsonb(round(round((cb - pb)::numeric / pb * 1000) / 10, 1)) END, 'percent')),
    'Previous period = the same number of days just before the chosen dates.', false);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_movers(s uuid[], fs text, ts text, f timestamptz, t timestamptz, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE days numeric := greatest(floor(extract(epoch FROM (t - f)) / 3600) / 24.0, 1.0); rows jsonb;
BEGIN
  WITH m AS (
    SELECT pv.shop_id, pv.id AS vid, p.name, u.code AS unit,
      coalesce((SELECT sum(-sm.qty_signed_milli) FROM mirror.stock_movements sm WHERE sm.shop_id = pv.shop_id AND sm.variant_id = pv.id AND sm.movement_type = 'sale' AND sm.occurred_at >= fs AND sm.occurred_at <= ts), 0)::bigint AS sold,
      coalesce((SELECT sum(sl.total_paisa) FROM mirror.sale_lines sl JOIN mirror.sales sa ON sa.shop_id = sl.shop_id AND sa.id = sl.sale_id
                WHERE sl.shop_id = pv.shop_id AND sl.variant_id = pv.id AND sa.status = 'posted' AND sa.created_at >= fs AND sa.created_at <= ts), 0)::bigint AS sales,
      coalesce(ib.on_hand_milli, 0) AS stock,
      (SELECT max(sa.created_at) FROM mirror.sale_lines sl JOIN mirror.sales sa ON sa.shop_id = sl.shop_id AND sa.id = sl.sale_id
       WHERE sl.shop_id = pv.shop_id AND sl.variant_id = pv.id AND sa.status = 'posted') AS last_sold
    FROM mirror.product_variants pv JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    JOIN mirror.units u ON u.shop_id = p.shop_id AND u.id = p.base_unit_id
    LEFT JOIN mirror.inventory_balances ib ON ib.shop_id = pv.shop_id AND ib.variant_id = pv.id
    WHERE pv.shop_id = ANY (s) AND p.is_service = 0 AND p.active = 1
  ), r AS (
    SELECT m.*, (row_number() OVER (ORDER BY sold DESC, shop_id, vid) - 1) AS idx,
      ceil((count(*) FILTER (WHERE sold > 0) OVER ()) * 0.2) AS fast_cut,
      round(sold / days)::bigint AS per_day,
      CASE WHEN sold > 0 THEN round(greatest(stock, 0) / (sold / days))::bigint END AS days_left
    FROM m
  ), st AS (
    SELECT r.*, CASE WHEN sold = 0 AND stock > 0 THEN 'Not selling' WHEN sold = 0 THEN '' WHEN idx < fast_cut THEN 'Fast'
                     WHEN coalesce(days_left > 90, false) THEN 'Slow' ELSE 'Normal' END AS status FROM r
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(shop_id), name, unit, sold, sales, stock, per_day, days_left, last_sold, status) ORDER BY idx), '[]'::jsonb)
  INTO rows FROM st;
  RETURN rpt.finish('analysis_movers', fs, ts, true,
    jsonb_build_array(rpt.col('name','Product','text'), rpt.col('unit','Unit','text'), rpt.col('sold','Sold','qty'), rpt.col('sales','Sales','money'),
      rpt.col('stock','Stock now','qty'), rpt.col('per_day','Sold per day','qty'), rpt.col('days_left','Days of stock','int'),
      rpt.col('last_sold','Last sold','date'), rpt.col('status','Status','text')),
    rows, ARRAY[]::text[],
    jsonb_build_array(rpt.stat('Fast items', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>9 = 'Fast')), 'int'),
      rpt.stat('Slow items (more than 90 days of stock)', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>9 = 'Slow')), 'int'),
      rpt.stat('Not selling (stock but no sale)', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>9 = 'Not selling')), 'int')),
    'Fast = top 20% by quantity sold. Days of stock = stock now ÷ sold per day.', multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_margin(s uuid[], fs text, ts text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(x.shop_id), x.name, x.qty, x.sales, x.cost, x.sales - x.cost, rpt.pct(x.sales - x.cost, x.sales),
           CASE WHEN x.sales - x.cost < 0 THEN 'Sold below cost' WHEN x.sales > 0 AND (x.sales - x.cost) * 100 < x.sales * 5 THEN 'Under 5% margin' ELSE '' END)
           ORDER BY CASE WHEN x.sales > 0 THEN (x.sales - x.cost)::double precision / x.sales ELSE 0 END DESC, x.shop_id, x.vid), '[]'::jsonb)
  INTO rows FROM rpt.product_profit(s, fs, ts) x;
  RETURN rpt.finish('analysis_margin', fs, ts, true,
    jsonb_build_array(rpt.col('name','Product','text'), rpt.col('qty','Qty sold','qty'), rpt.col('sales','Sales','money'), rpt.col('cost','Cost','money'),
      rpt.col('profit','Profit','money'), rpt.col('margin','Margin %','percent'), rpt.col('flag','Note','text')),
    rows, ARRAY['sales','cost','profit'],
    CASE WHEN jsonb_array_length(rows) > 0 THEN jsonb_build_array(rpt.stat('Best margin', rows->0->1, 'text')) ELSE '[]'::jsonb END
    || jsonb_build_array(rpt.stat('Products sold below cost', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>7 = 'Sold below cost')), 'int')),
    NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_list_products(s uuid[], multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; n text := rpt.rfc(now());
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(p.shop_id), pv.sku, p.name, CASE WHEN p.is_service = 1 THEN 'Service' ELSE 'Product' END,
           coalesce(c.name, ''), coalesce(b.name, ''), u.code,
           coalesce((SELECT bc.value FROM mirror.barcodes bc WHERE bc.shop_id = pv.shop_id AND bc.variant_id = pv.id ORDER BY bc.created_at, bc.id LIMIT 1), ''),
           coalesce((SELECT pr.price_paisa FROM mirror.prices pr WHERE pr.shop_id = pv.shop_id AND pr.variant_id = pv.id AND pr.price_list_id = 'retail' ORDER BY pr.valid_from, pr.id LIMIT 1), 0),
           (SELECT pr.price_paisa FROM mirror.prices pr WHERE pr.shop_id = pv.shop_id AND pr.variant_id = pv.id AND pr.price_list_id = 'wholesale' ORDER BY pr.valid_from, pr.id LIMIT 1),
           coalesce(ib.avg_cost_paisa, 0),
           CASE WHEN p.is_service = 1 THEN NULL ELSE coalesce(ib.on_hand_milli, 0) END,
           coalesce(p.reorder_level_milli, 0))
           ORDER BY p.created_at DESC, p.shop_id, p.id), '[]'::jsonb)
  INTO rows
  FROM mirror.products p JOIN mirror.product_variants pv ON pv.shop_id = p.shop_id AND pv.product_id = p.id AND pv.is_default = 1
  LEFT JOIN mirror.categories c ON c.shop_id = p.shop_id AND c.id = p.category_id
  LEFT JOIN mirror.brands b ON b.shop_id = p.shop_id AND b.id = p.brand_id
  LEFT JOIN mirror.units u ON u.shop_id = p.shop_id AND u.id = p.base_unit_id
  LEFT JOIN mirror.inventory_balances ib ON ib.shop_id = pv.shop_id AND ib.variant_id = pv.id
  WHERE p.shop_id = ANY (s);
  RETURN rpt.finish('list_products', n, n, false,
    jsonb_build_array(rpt.col('sku','SKU','text'), rpt.col('name','Name','text'), rpt.col('type','Type','text'), rpt.col('category','Category','text'),
      rpt.col('brand','Company','text'), rpt.col('unit','Unit','text'), rpt.col('barcode','Barcode','text'), rpt.col('price','Sale price','money'),
      rpt.col('wholesale','Wholesale','money'), rpt.col('cost','Avg cost','money'), rpt.col('stock','Stock','qty'), rpt.col('alert','Low stock alert','qty')),
    rows, ARRAY[]::text[], jsonb_build_array(rpt.stat('Products', to_jsonb(jsonb_array_length(rows)), 'int')), NULL, multi);
END $$;

CREATE OR REPLACE FUNCTION rpt.r_list_parties(s uuid[], p_kind text, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE rows jsonb; customers boolean := p_kind = 'list_customers'; n text := rpt.rfc(now());
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(pa.shop_id), pa.name, coalesce(pa.phone, ''), coalesce(pa.cnic, ''), pa.credit_limit_paisa,
           coalesce((SELECT balance_paisa FROM mirror.party_ledger pl WHERE pl.shop_id = pa.shop_id AND pl.party_id = pa.id ORDER BY occurred_at DESC, id DESC LIMIT 1), pa.opening_balance_paisa))
           ORDER BY lower(pa.name), pa.shop_id, pa.id), '[]'::jsonb)
  INTO rows FROM mirror.parties pa
  WHERE pa.shop_id = ANY (s) AND pa.active = 1 AND pa.party_type IN (CASE WHEN customers THEN 'customer' ELSE 'vendor' END, 'both');
  RETURN rpt.finish(p_kind, n, n, false,
    jsonb_build_array(rpt.col('name','Name','text'), rpt.col('phone','Phone','text'), rpt.col('cnic','CNIC','text'), rpt.col('limit','Credit limit','money'),
      rpt.col('balance', CASE WHEN customers THEN 'Due from them' ELSE 'We owe them' END, 'money')),
    rows, ARRAY['balance'], jsonb_build_array(rpt.stat(CASE WHEN customers THEN 'Customers' ELSE 'Vendors' END, to_jsonb(jsonb_array_length(rows)), 'int')), NULL, multi);
END $$;

-- ------------------------------------------------------------------ the one entry point

CREATE OR REPLACE FUNCTION public.report(p_kind text, p_from text, p_to text, p_offset_min integer, p_shops uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, rpt, mirror AS $$
DECLARE f timestamptz; t timestamptz; fs text; ts text; off int := least(greatest(coalesce(p_offset_min, 300), -720), 840);
        multi boolean; sh uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Log in first' USING ERRCODE = '28000'; END IF;
  IF p_shops IS NULL OR coalesce(array_length(p_shops, 1), 0) = 0 THEN RAISE EXCEPTION 'Choose a shop'; END IF;
  FOREACH sh IN ARRAY p_shops LOOP
    IF NOT (CASE WHEN p_kind = 'activity' THEN np_is_owner(sh) ELSE np_can_view(sh) END) THEN
      RAISE EXCEPTION 'You do not have permission to see this report' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF rpt.title(p_kind) IS NULL THEN RAISE EXCEPTION 'Unknown report ''%''', p_kind; END IF;
  BEGIN f := p_from::timestamptz; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Choose a valid from date'; END;
  BEGIN t := p_to::timestamptz; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Choose a valid to date'; END;
  IF t < f THEN RAISE EXCEPTION 'The ''to'' date is before the ''from'' date'; END IF;
  IF t - f > interval '3700 days' THEN RAISE EXCEPTION 'Choose a period of at most 10 years'; END IF;
  fs := rpt.rfc(f); ts := rpt.rfc(t);
  multi := array_length(p_shops, 1) > 1;
  RETURN CASE p_kind
    WHEN 'stock' THEN rpt.r_stock(p_shops, fs, ts, t, multi)
    WHEN 'purchases' THEN rpt.r_purchases(p_shops, fs, ts, multi)
    WHEN 'purchase_returns' THEN rpt.r_purchase_returns(p_shops, fs, ts, multi)
    WHEN 'sales' THEN rpt.r_sales(p_shops, fs, ts, multi)
    WHEN 'sale_returns' THEN rpt.r_sale_returns(p_shops, fs, ts, multi)
    WHEN 'services' THEN rpt.r_services(p_shops, fs, ts, multi)
    WHEN 'daily' THEN rpt.r_daily(p_shops, fs, ts, off, multi)
    WHEN 'recovery' THEN rpt.r_recovery(p_shops, fs, ts, multi)
    WHEN 'salesman' THEN rpt.r_salesman(p_shops, fs, ts, multi)
    WHEN 'claims' THEN rpt.r_claims(p_shops, fs, ts, multi)
    WHEN 'profit' THEN rpt.r_profit(p_shops, fs, ts, multi)
    WHEN 'activity' THEN rpt.r_activity(p_shops, fs, ts, multi)
    WHEN 'analysis_trend' THEN rpt.r_trend(p_shops, f, t, off)
    WHEN 'analysis_movers' THEN rpt.r_movers(p_shops, fs, ts, f, t, multi)
    WHEN 'analysis_margin' THEN rpt.r_margin(p_shops, fs, ts, multi)
    WHEN 'list_products' THEN rpt.r_list_products(p_shops, multi)
    WHEN 'list_customers' THEN rpt.r_list_parties(p_shops, 'list_customers', multi)
    WHEN 'list_vendors' THEN rpt.r_list_parties(p_shops, 'list_vendors', multi)
  END;
END $$;

REVOKE EXECUTE ON FUNCTION public.report(text, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report(text, text, text, integer, uuid[]) TO authenticated;
