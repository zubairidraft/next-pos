// Next POS Mobile: pairing, login and the phone screens.
import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  Delete,
  Loader2,
  LogOut,
  Menu,
  QrCode,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  Smartphone,
  Truck,
  Unlink,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, errorText, formatPkr, isBrowserTest, Permission, UserSummary } from "../lib/api";
import { SessionProvider, useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { link, LINK_EVENT, LinkError, LinkInfo, LinkState } from "./link";
import { scanWithCamera } from "./camera";
import { PurchaseScreen, ReportsScreen, SaleScreen, ScannerScreen, StockScreen } from "./screens";

export const card = "bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm";
export const bigBtn = "w-full py-3.5 rounded-2xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition";

/** Top level: is this phone paired with a shop PC? */
export function MobileRoot() {
  const toast = useToast();
  const [info, setInfo] = useState<LinkInfo | null | undefined>(undefined);
  const [linkState, setLinkState] = useState<LinkState>("online");

  useEffect(() => {
    link.info().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const f = async (e: Event) => {
      const state = (e as CustomEvent<LinkState>).detail;
      if (state === "unpaired") {
        await link.forget().catch(() => undefined);
        setInfo((cur) => {
          if (cur) toast.error("This phone is no longer connected to the shop PC. Connect it again.");
          return null;
        });
      } else setLinkState(state);
    };
    window.addEventListener(LINK_EVENT, f);
    return () => window.removeEventListener(LINK_EVENT, f);
  }, [toast]);

  if (info === undefined) return <FullSpinner />;
  if (!info) return <PairScreen onPaired={setInfo} />;
  return (
    <SessionProvider key={info.device_id}>
      <MobileShell info={info} linkState={linkState} onDisconnected={() => setInfo(null)} />
    </SessionProvider>
  );
}

function FullSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
    </div>
  );
}

function TestBadge() {
  return isBrowserTest ? (
    <div className="fixed bottom-20 left-2 z-30 px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold shadow pointer-events-none">Browser test mode · phone</div>
  ) : null;
}

// ------------------------------------------------------------ pairing

function PairScreen({ onPaired }: { onPaired: (i: LinkInfo) => void }) {
  const toast = useToast();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("nextpos_phone_name") || "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);

  const pair = async () => {
    setBusy(true);
    try {
      const text = await scanWithCamera((t, l) => toast.prompt(t, l), "pairing");
      if (!text) return;
      const deviceName = name.trim() || "Android phone";
      try {
        localStorage.setItem("nextpos_phone_name", deviceName);
      } catch {
        /* no storage */
      }
      const info = await link.pair(text, deviceName);
      toast.success(`Connected to ${info.store_name}`);
      onPaired(info);
    } catch (e) {
      toast.error(e instanceof LinkError ? e.message : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-600 to-emerald-800 text-white flex flex-col p-6">
      <div className="flex-1 flex flex-col justify-center gap-6 max-w-sm mx-auto w-full">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 flex items-center justify-center mb-3"><Smartphone className="w-8 h-8" /></div>
          <h1 className="text-2xl font-extrabold">Next POS Mobile</h1>
          <p className="text-emerald-100 text-sm mt-1">Connect this phone to your shop PC</p>
        </div>
        <ol className="bg-white/10 rounded-2xl p-4 space-y-2 text-sm list-decimal pl-8">
          <li>Connect this phone to the <b>shop WiFi</b> (same as the PC).</li>
          <li>On the PC: <b>More → Mobile phones → Connect a phone</b>.</li>
          <li>Press <b>Scan PC code</b> below and point the camera at the QR code.</li>
        </ol>
        <label className="text-sm font-semibold">
          Name of this phone
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="e.g. Counter phone, Ali's phone"
            className="mt-1 w-full px-4 py-3 rounded-xl text-slate-900 text-base"
          />
        </label>
        <button onClick={pair} disabled={busy} className={`${bigBtn} bg-white text-emerald-700`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />} Scan PC code
        </button>
      </div>
      <TestBadge />
    </div>
  );
}

// ------------------------------------------------------------ shell

type Tab = "sale" | "scan" | "stock" | "buy" | "reports";
const TABS: { id: Tab; label: string; icon: typeof ShoppingCart; perm: Permission | null }[] = [
  { id: "sale", label: "Sale", icon: ShoppingCart, perm: "SalesCreate" },
  { id: "scan", label: "Scanner", icon: ScanLine, perm: null },
  { id: "stock", label: "Stock", icon: Boxes, perm: null },
  { id: "buy", label: "Purchase", icon: Truck, perm: "PurchaseEntry" },
  { id: "reports", label: "Reports", icon: BarChart3, perm: "ReportsView" },
];

function MobileShell({ info, linkState, onDisconnected }: { info: LinkInfo; linkState: LinkState; onDisconnected: () => void }) {
  const toast = useToast();
  const { loading, startupError, status, session, refresh, logout, can } = useSession();
  const [tab, setTab] = useState<Tab>("sale");
  const [menu, setMenu] = useState(false);
  const [scannerOnly, setScannerOnly] = useState(false);

  // Check the PC every 20 s so the dot is right; reload when it comes back.
  useEffect(() => {
    const t = setInterval(() => link.ping().catch(() => undefined), 20000);
    return () => clearInterval(t);
  }, []);
  const [wasOffline, setWasOffline] = useState(false);
  useEffect(() => {
    if (linkState === "offline") setWasOffline(true);
    if (linkState === "online" && wasOffline) {
      setWasOffline(false);
      refresh();
    }
  }, [linkState, wasOffline, refresh]);

  const tabs = TABS.filter((t) => !t.perm || can(t.perm));
  useEffect(() => {
    if (session && !tabs.some((t) => t.id === tab)) setTab(tabs[0]?.id || "scan");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user_id]);

  const disconnect = async () => {
    setMenu(false);
    const ok = await toast.confirm("Disconnect this phone?", `It will stop working with ${info.store_name}. To use it again, scan a new code from the PC.`, { confirmLabel: "Disconnect", danger: true });
    if (!ok) return;
    if (session) await api.logout().catch(() => undefined);
    await link.forget();
    onDisconnected();
  };

  const closeShift = async () => {
    setMenu(false);
    try {
      const shift = await api.activeShift();
      if (!shift) return toast.info("You have no open shift.");
      const typed = await toast.prompt("Close shift", "Cash you are handing over (Rs)", { type: "number", message: "Count the cash you collected on this phone." });
      if (typed === null) return;
      const z = await api.closeShift(Math.round((parseFloat(typed) || 0) * 100));
      toast.success(`Shift closed. Sales ${formatPkr(z.net_sales_paisa)}, expected cash ${formatPkr(z.expected_cash_paisa)}${z.variance_paisa ? `, difference ${formatPkr(z.variance_paisa)}` : ""}.`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const header = (
    <header className="sticky top-0 z-30 bg-emerald-700 text-white px-4 py-3 flex items-center justify-between gap-2 shadow">
      <div className="min-w-0">
        <div className="font-bold truncate">{status?.store_name || info.store_name}</div>
        <div className="text-[11px] text-emerald-100 flex items-center gap-1">
          {linkState === "offline" ? <WifiOff className="w-3 h-3 text-amber-300" /> : <Wifi className="w-3 h-3" />}
          {linkState === "offline" ? "PC not reachable" : "Connected to shop PC"}
          {session && <span> · {session.username}</span>}
        </div>
      </div>
      <button onClick={() => setMenu(true)} aria-label="Menu" className="p-2 rounded-xl bg-white/10"><Menu className="w-5 h-5" /></button>
    </header>
  );

  const menuSheet = menu && (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setMenu(false)}>
      <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2">
          <div className="text-sm text-slate-500">{info.store_name}{info.hosts[0] ? ` · PC ${info.hosts[0]}` : ""}</div>
          <button onClick={() => setMenu(false)} aria-label="Close menu"><X className="w-5 h-5" /></button>
        </div>
        {session && can("SalesCreate") && (
          <button onClick={closeShift} className="w-full text-left px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold">Close my shift</button>
        )}
        {session && (
          <button onClick={() => { setMenu(false); logout(); }} className="w-full text-left px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold flex items-center gap-2"><LogOut className="w-4 h-4" /> Log out</button>
        )}
        <button onClick={disconnect} className="w-full text-left px-4 py-3 rounded-xl bg-rose-50 text-rose-700 font-semibold flex items-center gap-2"><Unlink className="w-4 h-4" /> Disconnect from shop</button>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (loading) body = <div className="p-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>;
  else if (startupError || !status)
    body = (
      <div className="p-6">
        <div className={`${card} p-5 text-center space-y-3`}>
          <WifiOff className="w-10 h-10 mx-auto text-amber-500" />
          <div className="font-bold">Cannot reach the shop PC</div>
          <p className="text-sm text-slate-500">{startupError?.replace(/^PC_OFFLINE: /, "") || "Check the WiFi."}</p>
          <p className="text-xs text-slate-400">The phone must be on the shop WiFi and Next POS must be open on the PC.</p>
          <button onClick={refresh} className={`${bigBtn} bg-emerald-600 text-white`}><RefreshCw className="w-5 h-5" /> Try again</button>
        </div>
      </div>
    );
  else if (status.needs_setup) body = <div className="p-6 text-center text-sm">Set up the shop on the PC first.</div>;
  else if (!session && !scannerOnly) body = <PhoneLogin users={status.users} onScanner={() => setScannerOnly(true)} />;
  else if (!session)
    body = (
      <>
        <div className="px-4 pt-3">
          <button onClick={() => setScannerOnly(false)} className="text-sm font-semibold text-emerald-700">← Log in</button>
        </div>
        <ScannerScreen />
      </>
    );
  else
    body = (
      <>
        {tab === "sale" && <SaleScreen />}
        {tab === "scan" && <ScannerScreen />}
        {tab === "stock" && <StockScreen />}
        {tab === "buy" && <PurchaseScreen />}
        {tab === "reports" && <ReportsScreen />}
      </>
    );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {header}
      {linkState === "offline" && status && (
        <div className="bg-amber-100 text-amber-900 text-xs px-4 py-2">PC not reachable. Sales and purchases need the PC. Stock counts are kept on the phone and sent later.</div>
      )}
      <main className={`flex-1 ${session ? "pb-24" : "pb-6"}`}>{body}</main>
      {session && (
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-semibold ${tab === t.id ? "text-emerald-600" : "text-slate-500"}`}>
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          ))}
        </nav>
      )}
      {menuSheet}
      <TestBadge />
    </div>
  );
}

// ------------------------------------------------------------ login

function PhoneLogin({ users, onScanner }: { users: UserSummary[]; onScanner: () => void }) {
  const toast = useToast();
  const { setSession } = useSession();
  const pinUsers = users.filter((u) => u.active && u.has_pin);
  const [user, setUser] = useState<UserSummary | null>(pinUsers[0] || null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState<null | { username: string; password: string }>(pinUsers.length ? null : { username: "", password: "" });

  const submitPin = useCallback(
    async (value: string) => {
      if (!user) return;
      setBusy(true);
      try {
        setSession(await api.loginPin(user.id, value));
      } catch (e) {
        toast.error(errorText(e));
        setPin("");
      } finally {
        setBusy(false);
      }
    },
    [user, setSession, toast]
  );

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };

  const submitPassword = async () => {
    if (!pw) return;
    setBusy(true);
    try {
      setSession(await api.loginPassword(pw.username.trim(), pw.password));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-sm mx-auto">
      <button onClick={onScanner} className={`${bigBtn} bg-slate-800 text-white`}>
        <ScanLine className="w-5 h-5" /> Use as scanner for the PC
      </button>
      <div className="text-center text-xs text-slate-400">or log in to sell, count stock and more</div>

      {pw ? (
        <div className={`${card} p-4 space-y-3`}>
          <input aria-label="Username" value={pw.username} onChange={(e) => setPw({ ...pw, username: e.target.value })} placeholder="Username" autoCapitalize="none" className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <input aria-label="Password" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitPassword()} placeholder="Password" className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950" />
          <button onClick={submitPassword} disabled={busy || !pw.username || !pw.password} className={`${bigBtn} bg-emerald-600 text-white`}>{busy && <Loader2 className="w-5 h-5 animate-spin" />} Log in</button>
          {pinUsers.length > 0 && <button onClick={() => setPw(null)} className="w-full text-sm text-emerald-700 font-semibold">Use PIN instead</button>}
        </div>
      ) : (
        <div className={`${card} p-4 space-y-4`}>
          <div className="flex flex-wrap gap-2">
            {pinUsers.map((u) => (
              <button key={u.id} onClick={() => { setUser(u); setPin(""); }} className={`px-3 py-2 rounded-xl text-sm font-semibold ${user?.id === u.id ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}>
                {u.username}
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-3 h-6" aria-label="PIN entered">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span key={i} className={`w-3.5 h-3.5 rounded-full ${i < pin.length ? "bg-emerald-600" : "bg-slate-200 dark:bg-slate-700"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} onClick={() => press(d)} className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xl font-bold active:bg-slate-200">{d}</button>
            ))}
            <button onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete digit" className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Delete className="w-5 h-5" /></button>
            <button onClick={() => press("0")} className="py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xl font-bold">0</button>
            <button onClick={() => submitPin(pin)} disabled={busy || pin.length < 4} className="py-4 rounded-2xl bg-emerald-600 text-white font-bold disabled:opacity-40">{busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "OK"}</button>
          </div>
          <button onClick={() => setPw({ username: "", password: "" })} className="w-full text-sm text-emerald-700 font-semibold">Log in with password</button>
        </div>
      )}
    </div>
  );
}
