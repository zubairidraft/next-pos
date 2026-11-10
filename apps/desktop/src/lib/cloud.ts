// Next POS Cloud from a browser (admin website) or the phone app: log in,
// list shops, link codes, managers, reports and backups. Read-only for shop
// data — sales, stock and khata are only ever changed on the shop PC.
//
// The cloud address and public (anon) key: cloudConfig.ts, or
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time.
import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";
import type { ReportTable } from "./api";
import { CLOUD_ANON_KEY, CLOUD_URL } from "./cloudConfig";

const URL_ = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || CLOUD_URL).replace(/\/+$/, "");
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || CLOUD_ANON_KEY;

export const cloudConfigured = !!(URL_ && ANON);

let client: SupabaseClient | null = null;
export function cloud(): SupabaseClient {
  if (!cloudConfigured) throw new Error("Next POS Cloud is not set up in this build.");
  if (!client) client = createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "nextpos-cloud" } });
  return client;
}

export interface CloudShop {
  id: string;
  name: string;
  role: "owner" | "manager";
  pc_name: string | null;
  linked_at: string | null;
  last_sync_at: string | null;
  last_backup_at: string | null;
  created_at: string;
}

export interface CloudManager {
  email: string;
  status: "active" | "invited";
  since: string;
}

export interface CloudBackup {
  id: string;
  path: string;
  size_bytes: number | null;
  created_at: string;
}

/** Plain-language error text from Supabase / PostgREST errors. */
export function cloudError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(m)) return "Open the confirmation email we sent you, then log in.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "No internet. Check the connection and try again.";
  if (/JWT expired/i.test(m)) return "You were logged out. Log in again.";
  return m;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await cloud().rpc(fn, args);
  if (error) throw new Error(cloudError(error));
  return data as T;
}

export const cloudApi = {
  session: async (): Promise<Session | null> => (await cloud().auth.getSession()).data.session,
  onAuth: (f: (s: Session | null) => void) => cloud().auth.onAuthStateChange((_e, s) => f(s)).data.subscription,
  logIn: async (email: string, password: string) => {
    const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(cloudError(error));
    await rpc<number>("claim_invites").catch(() => 0);
  },
  signUp: async (email: string, password: string): Promise<"ready" | "confirm"> => {
    const { data, error } = await cloud().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw new Error(cloudError(error));
    if (data.session) await rpc<number>("claim_invites").catch(() => 0);
    return data.session ? "ready" : "confirm";
  },
  resetPassword: async (email: string) => {
    const { error } = await cloud().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) throw new Error(cloudError(error));
  },
  setPassword: async (password: string) => {
    const { error } = await cloud().auth.updateUser({ password });
    if (error) throw new Error(cloudError(error));
  },
  logOut: async () => {
    await cloud().auth.signOut();
  },

  shops: () => rpc<CloudShop[]>("my_shops"),
  createShop: (name: string) => rpc<string>("create_shop", { p_name: name }),
  renameShop: (shop: string, name: string) => rpc<void>("rename_shop", { p_shop: shop, p_name: name }),
  deleteShop: (shop: string) => rpc<void>("delete_shop", { p_shop: shop }),
  /** The code the owner pastes on the shop PC (Backup → Next POS Cloud). Valid 30 minutes, once. */
  linkCode: async (shop: string): Promise<string> => {
    const c = await rpc<string>("new_link_code", { p_shop: shop });
    const json = JSON.stringify({ u: URL_, a: ANON, c });
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `NPC1.${b64}`;
  },

  managers: (shop: string) => rpc<CloudManager[]>("list_managers", { p_shop: shop }),
  addManager: (shop: string, email: string) => rpc<"added" | "invited">("add_manager", { p_shop: shop, p_email: email }),
  removeManager: (shop: string, email: string) => rpc<void>("remove_manager", { p_shop: shop, p_email: email }),

  report: (kind: string, from: string, to: string, shops: string[], offsetMin = 300) =>
    rpc<ReportTable>("report", { p_kind: kind, p_from: from, p_to: to, p_offset_min: offsetMin, p_shops: shops }),

  backups: async (shop: string): Promise<CloudBackup[]> => {
    const { data, error } = await cloud().from("shop_backups").select("id, path, size_bytes, created_at").eq("shop_id", shop).order("created_at", { ascending: false });
    if (error) throw new Error(cloudError(error));
    return (data || []) as CloudBackup[];
  },
  backupLink: async (shop: string, path: string): Promise<string> => {
    const { data, error } = await cloud().functions.invoke("backup", { body: { action: "download", shop_id: shop, path } });
    if (error) throw new Error(cloudError(error));
    return (data as { url: string }).url;
  },
};
