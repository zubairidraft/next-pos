-- Stock report: Sale price and Wholesale columns (same as the shop PC).
CREATE OR REPLACE FUNCTION rpt.r_stock(s uuid[], fs text, ts text, t timestamptz, multi boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE rows jsonb; to_now boolean := t >= now() - interval '5 minutes';
BEGIN
  WITH base AS (
    SELECT pv.shop_id, p.name, p.sku, u.code AS unit,
      coalesce(sum(CASE WHEN sm.occurred_at < fs THEN sm.qty_signed_milli END), 0)::bigint AS opening,
      coalesce(sum(CASE WHEN sm.occurred_at >= fs AND sm.qty_signed_milli > 0 THEN sm.qty_signed_milli END), 0)::bigint AS qin,
      coalesce(sum(CASE WHEN sm.occurred_at >= fs AND sm.qty_signed_milli < 0 THEN -sm.qty_signed_milli END), 0)::bigint AS qout,
      coalesce(ib.on_hand_milli, 0) AS on_hand, coalesce(ib.avg_cost_paisa, 0) AS cost, p.reorder_level_milli AS reorder, pv.id AS vid,
      coalesce((SELECT pr.price_paisa FROM mirror.prices pr WHERE pr.shop_id = pv.shop_id AND pr.variant_id = pv.id AND pr.unit_id = p.base_unit_id
                AND pr.price_list_id = 'retail' ORDER BY pr.valid_from, pr.id LIMIT 1), 0) AS price,
      (SELECT pr.price_paisa FROM mirror.prices pr WHERE pr.shop_id = pv.shop_id AND pr.variant_id = pv.id AND pr.unit_id = p.base_unit_id
       AND pr.price_list_id = 'wholesale' ORDER BY pr.valid_from, pr.id LIMIT 1) AS wholesale
    FROM mirror.product_variants pv
    JOIN mirror.products p ON p.shop_id = pv.shop_id AND p.id = pv.product_id
    JOIN mirror.units u ON u.shop_id = p.shop_id AND u.id = p.base_unit_id
    LEFT JOIN mirror.stock_movements sm ON sm.shop_id = pv.shop_id AND sm.variant_id = pv.id AND sm.occurred_at <= ts
    LEFT JOIN mirror.inventory_balances ib ON ib.shop_id = pv.shop_id AND ib.variant_id = pv.id
    WHERE pv.shop_id = ANY (s) AND p.is_service = 0 AND p.active = 1
    GROUP BY pv.shop_id, pv.id, p.name, p.sku, u.code, ib.on_hand_milli, ib.avg_cost_paisa, p.reorder_level_milli, p.base_unit_id
  ), calc AS (
    SELECT *, CASE WHEN to_now THEN on_hand - qin + qout ELSE opening END AS op2,
              CASE WHEN to_now THEN on_hand ELSE opening + qin - qout END AS closing
    FROM base
  ), st AS (
    SELECT *, CASE WHEN closing <= 0 THEN 'Out of stock' WHEN reorder > 0 AND closing <= reorder THEN 'Low' ELSE '' END AS status FROM calc
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(rpt.shop_name(shop_id), name, sku, unit, op2, qin, qout, closing, cost, price, wholesale,
         greatest(closing, 0) * cost / 1000, status) ORDER BY lower(name), shop_id, vid), '[]'::jsonb)
  INTO rows FROM st;
  RETURN rpt.finish('stock', fs, ts, true,
    jsonb_build_array(rpt.col('name','Product','text'), rpt.col('sku','SKU','text'), rpt.col('unit','Unit','text'), rpt.col('opening','Opening','qty'),
      rpt.col('in','In','qty'), rpt.col('out','Out','qty'), rpt.col('closing','Closing','qty'), rpt.col('cost','Avg cost','money'),
      rpt.col('price','Sale price','money'), rpt.col('wholesale','Wholesale','money'),
      rpt.col('value','Value','money'), rpt.col('status','Status','text')),
    rows, ARRAY['value'],
    jsonb_build_array(
      rpt.stat('Products', to_jsonb(jsonb_array_length(rows)), 'int'),
      rpt.stat('Low stock', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>12 = 'Low')), 'int'),
      rpt.stat('Out of stock', to_jsonb((SELECT count(*) FROM jsonb_array_elements(rows) r WHERE r->>12 = 'Out of stock')), 'int'),
      rpt.stat('Stock value (at cost)', to_jsonb((SELECT coalesce(sum((r->>11)::bigint), 0) FROM jsonb_array_elements(rows) r)), 'money')),
    NULL, multi);
END $$;
