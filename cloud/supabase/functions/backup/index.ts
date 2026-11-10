// Next POS Cloud: encrypted backups of each shop PC.
//
//   start    (shop PC, shop key)  -> a one-time upload address for today's file
//   done     (shop PC, shop key)  -> records the file, keeps the latest 30
//   download (owner, logged in)   -> a 10-minute download link
//
// The files are locked with the backup password the owner set on the PC; the
// cloud cannot open them. Deploy with verify_jwt = false (the shop PC has no
// user login; it proves itself with its shop key).
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const BUCKET = "backups";
const KEEP = 30;
const MAX_BYTES = 50 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const uuidOk = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

async function shopKeyOk(shop: string, key: string): Promise<boolean> {
  const { data, error } = await admin.rpc("np_shop_key_ok", { p_shop: shop, p_key: key });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return reply(400, { error: "Bad request" });
  }
  const shop = String(b.shop_id ?? "");
  if (!uuidOk(shop)) return reply(400, { error: "Bad shop" });

  if (b.action === "start" || b.action === "done") {
    if (!(await shopKeyOk(shop, String(b.shop_key ?? "")))) {
      return reply(403, { error: "This shop is not linked to Next POS Cloud any more. Link it again from the admin website." });
    }
    if (b.action === "start") {
      const size = Number(b.size ?? 0);
      if (!(size > 0) || size > MAX_BYTES) return reply(400, { error: "The backup is too large for the cloud (50 MB)." });
      const path = `${shop}/${new Date().toISOString().replace(/[:.]/g, "-")}.kpos`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return reply(500, { error: error?.message ?? "Could not prepare the upload" });
      return reply(200, { path, upload_url: data.signedUrl });
    }
    // done
    const path = String(b.path ?? "");
    if (!path.startsWith(`${shop}/`) || path.includes("..")) return reply(400, { error: "Bad file" });
    const { error } = await admin.rpc("np_backup_saved", { p_shop: shop, p_path: path, p_size: Number(b.size ?? 0) });
    if (error) return reply(500, { error: error.message });
    // keep the latest KEEP backups of this shop
    const { data: old } = await admin.from("shop_backups").select("id, path").eq("shop_id", shop)
      .order("created_at", { ascending: false }).range(KEEP, KEEP + 500);
    if (old && old.length) {
      await admin.storage.from(BUCKET).remove(old.map((o) => o.path));
      await admin.from("shop_backups").delete().in("id", old.map((o) => o.id));
    }
    return reply(200, { ok: true });
  }

  if (b.action === "download") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return reply(401, { error: "Log in first" });
    const { data: shopRow } = await admin.from("shops").select("owner_id").eq("id", shop).maybeSingle();
    if (!shopRow || shopRow.owner_id !== u.user.id) return reply(403, { error: "Only the owner can download backups" });
    const path = String(b.path ?? "");
    if (!path.startsWith(`${shop}/`) || path.includes("..")) return reply(400, { error: "Bad file" });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 600, { download: true });
    if (error || !data) return reply(500, { error: error?.message ?? "Could not make a download link" });
    return reply(200, { url: data.signedUrl });
  }
  return reply(400, { error: "Unknown action" });
});
