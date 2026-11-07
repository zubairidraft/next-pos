// The phone's connection to the shop PC.
// In the Android app every call goes through Rust (pinned TLS over the shop
// WiFi, see crates/pos-lan). In browser test mode it goes to pos-dev-server,
// which plays the PC and treats this browser tab as a paired phone.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/api";

export interface LinkInfo {
  store_name: string;
  hosts: string[];
  device_id: string;
}

export type LinkErrorKind = "offline" | "not_paired" | "wrong_pc" | "refused";

export class LinkError extends Error {
  kind: LinkErrorKind;
  constructor(kind: LinkErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

function toLinkError(e: unknown): LinkError {
  if (e instanceof LinkError) return e;
  const m = typeof e === "string" ? e : (e as Error)?.message || String(e);
  if (m.startsWith("PC_OFFLINE: ")) return new LinkError("offline", m.slice(12));
  if (m.startsWith("NOT_PAIRED: ")) return new LinkError("not_paired", m.slice(12));
  if (m.startsWith("WRONG_PC: ")) return new LinkError("wrong_pc", m.slice(10));
  return new LinkError("refused", m);
}

/** Tell the app about the link: online / offline / not paired any more. */
export const LINK_EVENT = "nextpos:link";
export type LinkState = "online" | "offline" | "unpaired";
let lastState: LinkState | null = null;
/** Only changes are announced, so listeners never loop on repeated results. */
function announce(state: LinkState) {
  if (state === lastState) return;
  lastState = state;
  window.dispatchEvent(new CustomEvent<LinkState>(LINK_EVENT, { detail: state }));
}

// ------------------------------------------------------------ browser test mode

const DEV_SERVER = (import.meta.env.VITE_DEV_SERVER as string | undefined) || "http://127.0.0.1:4848";
const STORE_KEY = "nextpos_test_phone_pairing";
interface TestPairing extends LinkInfo {
  secret: string;
}
function testPairing(): TestPairing | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as TestPairing) : null;
  } catch {
    return null;
  }
}
async function devPhone<T>(what: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DEV_SERVER}/phone/${what}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-NextPOS-Dev": "1" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LinkError("offline", "Cannot reach the shop PC (browser test server is not running).");
  }
  const out = await res.json().catch(() => null);
  if (!res.ok) throw toLinkError(out?.error || `Error ${res.status}`);
  return out as T;
}
function withSecret(extra: Record<string, unknown>) {
  const p = testPairing();
  if (!p) throw new LinkError("not_paired", "This phone is not connected to a shop PC yet.");
  return { device_id: p.device_id, secret: p.secret, ...extra };
}

// ------------------------------------------------------------ the link

async function guarded<T>(f: () => Promise<T>): Promise<T> {
  try {
    const v = await f();
    announce("online");
    return v;
  } catch (e) {
    const err = toLinkError(e);
    if (err.kind === "offline") announce("offline");
    else if (err.kind === "not_paired" || err.kind === "wrong_pc") announce("unpaired");
    else announce("online");
    throw err;
  }
}

export const link = {
  async info(): Promise<LinkInfo | null> {
    if (isTauri) return invoke<LinkInfo | null>("link_info");
    const p = testPairing();
    return p ? { store_name: p.store_name, hosts: p.hosts, device_id: p.device_id } : null;
  },

  async pair(qr: string, deviceName: string): Promise<LinkInfo> {
    try {
      if (isTauri) return await invoke<LinkInfo>("link_pair", { qr, device_name: deviceName });
      const p = await devPhone<TestPairing>("pair", { qr, device_name: deviceName });
      localStorage.setItem(STORE_KEY, JSON.stringify(p));
      return { store_name: p.store_name, hosts: p.hosts, device_id: p.device_id };
    } catch (e) {
      throw toLinkError(e);
    }
  },

  async forget(): Promise<void> {
    if (isTauri) return invoke<void>("link_forget");
    localStorage.removeItem(STORE_KEY);
  },

  /** Run a Next POS command on the PC (same names and arguments as the PC app). */
  rpc<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    return guarded(() => (isTauri ? invoke<T>("link_rpc", { cmd, args }) : devPhone<T>("rpc", withSecret({ cmd, args }))));
  },

  /** Send a barcode to the screen open on the PC. */
  scan(code: string): Promise<void> {
    return guarded(async () => {
      if (isTauri) await invoke("link_scan", { code });
      else await devPhone("scan", withSecret({ code }));
    });
  },

  ping(): Promise<{ store_name: string; user: string | null }> {
    return guarded(() => (isTauri ? invoke("link_ping") : devPhone("ping", withSecret({}))));
  },
};
