-- Next POS Cloud: owners, shops, managers and the door the shop PCs send through.
--
-- Read-only for people: owners and managers can SEE their shops' data; nothing
-- here lets anyone change a sale, stock or khata. Only the shop PC writes, with
-- its own secret key, through public.ingest().

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------------ tables

CREATE TABLE IF NOT EXISTS public.shops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    key_hash text,                 -- sha256 of the linked PC's secret key
    pc_name text,                  -- shop name set on the PC
    linked_at timestamptz,
    last_sync_at timestamptz,
    last_backup_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shops_owner ON public.shops(owner_id);

CREATE TABLE IF NOT EXISTS public.shop_members (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'manager' CHECK (role = 'manager'),
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, user_id)
);
CREATE INDEX IF NOT EXISTS shop_members_user ON public.shop_members(user_id);

-- A manager invited before they made an account.
CREATE TABLE IF NOT EXISTS public.shop_invites (
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    email text NOT NULL,
    invited_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, email)
);

-- One-time codes that link a shop PC (30 minutes).
CREATE TABLE IF NOT EXISTS public.link_codes (
    code_hash text PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);

-- Encrypted backups the shop PCs uploaded (files live in Storage: backups/<shop>/...).
CREATE TABLE IF NOT EXISTS public.shop_backups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    path text NOT NULL UNIQUE,
    size_bytes bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_backups_shop ON public.shop_backups(shop_id, created_at DESC);

-- ------------------------------------------------------------------ who may see what

CREATE OR REPLACE FUNCTION public.np_is_owner(p_shop uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.np_can_view(p_shop uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM shop_members WHERE shop_id = p_shop AND user_id = auth.uid());
$$;

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shops_read ON public.shops;
CREATE POLICY shops_read ON public.shops FOR SELECT TO authenticated USING (public.np_can_view(id));
DROP POLICY IF EXISTS members_read ON public.shop_members;
CREATE POLICY members_read ON public.shop_members FOR SELECT TO authenticated USING (public.np_is_owner(shop_id) OR user_id = auth.uid());
DROP POLICY IF EXISTS invites_read ON public.shop_invites;
CREATE POLICY invites_read ON public.shop_invites FOR SELECT TO authenticated USING (public.np_is_owner(shop_id));
DROP POLICY IF EXISTS backups_read ON public.shop_backups;
CREATE POLICY backups_read ON public.shop_backups FOR SELECT TO authenticated USING (public.np_is_owner(shop_id));
-- No insert / update / delete policies: changes go only through the functions below.

-- Supabase gives new tables to anon/authenticated by default: take it all back first.
REVOKE ALL ON public.shops, public.shop_members, public.shop_invites, public.link_codes, public.shop_backups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shop_members, public.shop_invites, public.shop_backups TO authenticated;
-- Every column except the secret key hash.
GRANT SELECT (id, owner_id, name, pc_name, linked_at, last_sync_at, last_backup_at, created_at) ON public.shops TO authenticated;

-- ------------------------------------------------------------------ owner actions

CREATE OR REPLACE FUNCTION public.my_shops()
RETURNS TABLE (id uuid, name text, role text, pc_name text, linked_at timestamptz, last_sync_at timestamptz, last_backup_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, CASE WHEN s.owner_id = auth.uid() THEN 'owner' ELSE 'manager' END,
         s.pc_name, s.linked_at, s.last_sync_at, s.last_backup_at, s.created_at
  FROM shops s
  WHERE s.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM shop_members m WHERE m.shop_id = s.id AND m.user_id = auth.uid())
  ORDER BY s.created_at;
$$;

CREATE OR REPLACE FUNCTION public.create_shop(p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Log in first' USING ERRCODE = '28000'; END IF;
  IF (SELECT count(*) FROM shops WHERE owner_id = auth.uid()) >= 50 THEN
    RAISE EXCEPTION 'You already have 50 shops';
  END IF;
  INSERT INTO shops (owner_id, name) VALUES (auth.uid(), trim(p_name)) RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.rename_shop(p_shop uuid, p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can rename this shop' USING ERRCODE = '42501'; END IF;
  UPDATE shops SET name = trim(p_name) WHERE id = p_shop;
END $$;

-- Removes the shop and its whole cloud copy (the PC keeps its own data).
CREATE OR REPLACE FUNCTION public.delete_shop(p_shop uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, mirror AS $$
DECLARE t text;
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can remove this shop' USING ERRCODE = '42501'; END IF;
  FOREACH t IN ARRAY mirror.synced_tables() LOOP
    EXECUTE format('DELETE FROM mirror.%I WHERE shop_id = $1', t) USING p_shop;
  END LOOP;
  DELETE FROM shops WHERE id = p_shop;
END $$;

-- A one-time code for linking (or re-linking) the shop PC. 30 minutes.
CREATE OR REPLACE FUNCTION public.new_link_code(p_shop uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c text;
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can link this shop' USING ERRCODE = '42501'; END IF;
  c := upper(substr(translate(encode(gen_random_bytes(12), 'base64'), '+/=0O1Il', ''), 1, 12));
  DELETE FROM link_codes WHERE shop_id = p_shop OR expires_at < now() - interval '1 day';
  INSERT INTO link_codes (code_hash, shop_id, expires_at) VALUES (encode(digest(c, 'sha256'), 'hex'), p_shop, now() + interval '30 minutes');
  RETURN c;
END $$;

-- Called by the shop PC with the one-time code. Returns the shop's id and a new
-- secret key; any PC linked earlier with the old key stops sending.
CREATE OR REPLACE FUNCTION public.link_shop(p_code text, p_pc_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r link_codes; k text;
BEGIN
  SELECT * INTO r FROM link_codes WHERE code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR r.used_at IS NOT NULL OR r.expires_at < now() THEN
    RAISE EXCEPTION 'This link code has expired or was already used. Make a new one on the admin website.' USING ERRCODE = '28000';
  END IF;
  k := encode(gen_random_bytes(32), 'hex');
  UPDATE link_codes SET used_at = now() WHERE code_hash = r.code_hash;
  UPDATE shops SET key_hash = encode(digest(k, 'sha256'), 'hex'), linked_at = now(), pc_name = left(p_pc_name, 80) WHERE id = r.shop_id;
  RETURN jsonb_build_object('shop_id', r.shop_id, 'shop_key', k, 'shop_name', (SELECT name FROM shops WHERE id = r.shop_id));
END $$;

-- The shop's PC sends its changes here. Rows: [{t, k, op: 'u'|'d', d}].
CREATE OR REPLACE FUNCTION public.ingest(p_shop uuid, p_key text, p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, mirror AS $$
DECLARE t text; ups jsonb; dels jsonb; n integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND key_hash IS NOT NULL AND key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex')) THEN
    RAISE EXCEPTION 'This shop is not linked to Next POS Cloud any more. Link it again from the admin website.' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Bad batch';
  END IF;
  FOR t IN SELECT DISTINCT r->>'t' FROM jsonb_array_elements(p_rows) r LOOP
    -- A table this server does not know yet (newer PC app): skipped, sent again after "Resend all".
    CONTINUE WHEN NOT (t = ANY (mirror.synced_tables()));
    SELECT coalesce(jsonb_agg(r->'d'), '[]'::jsonb) INTO ups FROM jsonb_array_elements(p_rows) r WHERE r->>'t' = t AND r->>'op' = 'u';
    SELECT coalesce(jsonb_agg(r->'k'), '[]'::jsonb) INTO dels FROM jsonb_array_elements(p_rows) r WHERE r->>'t' = t AND r->>'op' = 'd';
    IF jsonb_array_length(ups) > 0 THEN EXECUTE format('SELECT mirror.%I($1, $2)', '_up_' || t) USING p_shop, ups; END IF;
    IF jsonb_array_length(dels) > 0 THEN EXECUTE format('SELECT mirror.%I($1, $2)', '_del_' || t) USING p_shop, dels; END IF;
    n := n + jsonb_array_length(ups) + jsonb_array_length(dels);
  END LOOP;
  UPDATE shops SET last_sync_at = now() WHERE id = p_shop;
  RETURN n;
END $$;

-- ------------------------------------------------------------------ managers

CREATE OR REPLACE FUNCTION public.add_manager(p_shop uuid, p_email text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid; e text := lower(trim(p_email));
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can add managers' USING ERRCODE = '42501'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  SELECT id INTO u FROM auth.users WHERE lower(email) = e;
  IF u = auth.uid() THEN RAISE EXCEPTION 'You are already the owner'; END IF;
  IF u IS NOT NULL THEN
    INSERT INTO shop_members (shop_id, user_id) VALUES (p_shop, u) ON CONFLICT DO NOTHING;
    RETURN 'added';
  END IF;
  INSERT INTO shop_invites (shop_id, email) VALUES (p_shop, e) ON CONFLICT DO NOTHING;
  RETURN 'invited';
END $$;

CREATE OR REPLACE FUNCTION public.remove_manager(p_shop uuid, p_email text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text := lower(trim(p_email));
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can remove managers' USING ERRCODE = '42501'; END IF;
  DELETE FROM shop_members WHERE shop_id = p_shop AND user_id IN (SELECT id FROM auth.users WHERE lower(email) = e);
  DELETE FROM shop_invites WHERE shop_id = p_shop AND email = e;
END $$;

CREATE OR REPLACE FUNCTION public.list_managers(p_shop uuid) RETURNS TABLE (email text, status text, since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT np_is_owner(p_shop) THEN RAISE EXCEPTION 'Only the owner can see managers' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT u.email::text, 'active'::text, m.added_at FROM shop_members m JOIN auth.users u ON u.id = m.user_id WHERE m.shop_id = p_shop
    UNION ALL
    SELECT i.email, 'invited', i.invited_at FROM shop_invites i WHERE i.shop_id = p_shop
    ORDER BY 1;
END $$;

-- After a manager logs in: shops they were invited to become theirs.
CREATE OR REPLACE FUNCTION public.claim_invites() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e text; n integer;
BEGIN
  SELECT lower(email) INTO e FROM auth.users WHERE id = auth.uid();
  IF e IS NULL THEN RETURN 0; END IF;
  INSERT INTO shop_members (shop_id, user_id) SELECT shop_id, auth.uid() FROM shop_invites WHERE email = e ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM shop_invites WHERE email = e;
  RETURN n;
END $$;

-- ------------------------------------------------------------------ backups (used by the backup edge function)

CREATE OR REPLACE FUNCTION public.np_shop_key_ok(p_shop uuid, p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM shops WHERE id = p_shop AND key_hash IS NOT NULL AND key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex'));
$$;

CREATE OR REPLACE FUNCTION public.np_backup_saved(p_shop uuid, p_path text, p_size bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO shop_backups (shop_id, path, size_bytes) VALUES (p_shop, p_path, p_size) ON CONFLICT (path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, created_at = now();
  UPDATE shops SET last_backup_at = now() WHERE id = p_shop;
$$;

-- ------------------------------------------------------------------ grants

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_shop(text, text), public.ingest(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.np_is_owner(uuid), public.np_can_view(uuid), public.my_shops(), public.create_shop(text),
  public.rename_shop(uuid, text), public.delete_shop(uuid), public.new_link_code(uuid), public.add_manager(uuid, text),
  public.remove_manager(uuid, text), public.list_managers(uuid), public.claim_invites() TO authenticated;
-- np_shop_key_ok / np_backup_saved: only the edge function (service role).
GRANT EXECUTE ON FUNCTION public.np_shop_key_ok(uuid, text), public.np_backup_saved(uuid, text, bigint) TO service_role;
