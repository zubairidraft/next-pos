// Next POS Cloud — admin website. Owners and managers see the reports of
// their shops from anywhere. Read-only: sales, stock and khata are changed
// only on the shop PC.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Loader2,
  LogOut,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Store,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { ReportTable } from "../lib/api";
import { CloudBackup, cloudApi, cloudConfigured, cloudError, CloudManager, CloudShop } from "../lib/cloud";
import { fileStem, formatCell, isNumericKind, periodText, reportPdf, reportXlsx, saveFile } from "../lib/exporter";
import { A4_LANDSCAPE, A4_PAGE, printElement } from "../lib/print";
import { endOf, QUICK_RANGES, quickRange, REPORT_GROUPS, startOf } from "../lib/reportCatalog";
import { useToast } from "../lib/toast";

const field = "w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
const card = "bg-white rounded-2xl border border-slate-200";
const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-40";

function ago(s: string | null): string {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(s).toLocaleDateString();
}

// ------------------------------------------------------------ root

export function AdminApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(() => window.location.hash.includes("type=recovery"));

  useEffect(() => {
    if (!cloudConfigured) return;
    cloudApi.session().then(setSession);
    const sub = cloudApi.onAuth((s) => setSession(s));
    return () => sub.unsubscribe();
  }, []);

  if (!cloudConfigured) {
    return <Centered><p className="text-slate-600">Next POS Cloud is not set up in this build.</p></Centered>;
  }
  if (session === undefined) return <Centered><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></Centered>;
  if (session && recovery) return <NewPassword onDone={() => { setRecovery(false); history.replaceState(null, "", window.location.pathname); }} />;
  if (!session) return <Login />;
  return <Shell email={session.user.email || ""} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-4">{children}</div>;
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><Cloud className="w-5 h-5" /></div>
      <div className="leading-tight">
        <div className="font-extrabold tracking-tight">Next POS Cloud</div>
        <div className="text-[11px] text-slate-500">All your shops, anywhere</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ login

function Login() {
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote("");
    try {
      if (mode === "login") await cloudApi.logIn(email, pw);
      else if (mode === "signup") {
        if (pw.length < 8) throw new Error("Use at least 8 characters for the password.");
        const r = await cloudApi.signUp(email, pw);
        if (r === "confirm") setNote("We sent you an email. Open the link in it, then log in here.");
      } else {
        await cloudApi.resetPassword(email);
        setNote("If this email has an account, a link to set a new password is on its way.");
      }
    } catch (err) {
      toast.error(cloudError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <form onSubmit={submit} className={`${card} w-full max-w-sm p-6 space-y-4 shadow-sm`}>
        <Brand />
        <h1 className="text-lg font-bold">{mode === "login" ? "Log in" : mode === "signup" ? "Create your account" : "Forgot password"}</h1>
        <label className="block text-xs font-semibold text-slate-600">Email<input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} /></label>
        {mode !== "forgot" && (
          <label className="block text-xs font-semibold text-slate-600">Password<input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className={`${field} mt-1`} /></label>
        )}
        {note && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">{note}</p>}
        <button disabled={busy} className={`${btn} w-full justify-center py-2.5 bg-emerald-600 text-white`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send link"}
        </button>
        <div className="flex justify-between text-sm">
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => setMode("signup")} className="text-emerald-700 font-semibold">Create account</button>
              <button type="button" onClick={() => setMode("forgot")} className="text-slate-500">Forgot password?</button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("login")} className="text-emerald-700 font-semibold">Back to log in</button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">Managers: create an account with the email your shop owner added.</p>
      </form>
    </Centered>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Centered>
      <form
        className={`${card} w-full max-w-sm p-6 space-y-4`}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (pw.length < 8) throw new Error("Use at least 8 characters.");
            await cloudApi.setPassword(pw);
            toast.success("Password changed.");
            onDone();
          } catch (err) {
            toast.error(cloudError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Brand />
        <h1 className="text-lg font-bold">Set a new password</h1>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        <button disabled={busy} className={`${btn} w-full justify-center bg-emerald-600 text-white`}>Save password</button>
      </form>
    </Centered>
  );
}

// ------------------------------------------------------------ app shell

type Page = "reports" | "shops" | "backups";

function Shell({ email }: { email: string }) {
  const toast = useToast();
  const [page, setPage] = useState<Page>("reports");
  const [shops, setShops] = useState<CloudShop[] | null>(null);

  const load = useCallback(() => {
    cloudApi.shops().then(setShops).catch((e) => toast.error(cloudError(e)));
  }, [toast]);
  useEffect(load, [load]);

  const isOwner = !!shops?.some((s) => s.role === "owner");
  const nav: [Page, string, React.ReactNode][] = [
    ["reports", "Reports", <BarChart3 key="r" className="w-4 h-4" />],
    ["shops", "Shops", <Store key="s" className="w-4 h-4" />],
    ...(isOwner ? ([["backups", "Backups", <HardDriveDownload key="b" className="w-4 h-4" />]] as [Page, string, React.ReactNode][]) : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Brand />
          <nav className="flex gap-1 ml-2 overflow-x-auto">
            {nav.map(([k, label, icon]) => (
              <button key={k} onClick={() => setPage(k)} className={`${btn} ${page === k ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}>
                {icon}
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-500 truncate max-w-[220px]">{email}</span>
            <button onClick={() => cloudApi.logOut()} className={`${btn} text-slate-600 hover:bg-slate-50`} title="Log out"><LogOut className="w-4 h-4" /><span className="hidden sm:inline">Log out</span></button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
        {shops === null ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : page === "reports" ? (
          shops.length ? <Reports shops={shops} /> : <NoShops onAdd={() => setPage("shops")} />
        ) : page === "shops" ? (
          <Shops shops={shops} reload={load} />
        ) : (
          <Backups shops={shops.filter((s) => s.role === "owner")} />
        )}
      </main>
    </div>
  );
}

function NoShops({ onAdd }: { onAdd: () => void }) {
  return (
    <div className={`${card} p-10 text-center max-w-lg mx-auto`}>
      <Store className="w-10 h-10 mx-auto text-slate-300" />
      <h2 className="font-bold text-lg mt-3">No shops yet</h2>
      <p className="text-sm text-slate-500 mt-1">Add your shop, then link its PC. If you are a manager, ask the owner to add your email.</p>
      <button onClick={onAdd} className={`${btn} mt-4 bg-emerald-600 text-white`}><Plus className="w-4 h-4" /> Add a shop</button>
    </div>
  );
}

// ------------------------------------------------------------ reports

function Reports({ shops }: { shops: CloudShop[] }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(() => shops.map((s) => s.id));
  const [kind, setKind] = useState("daily");
  const [from, setFrom] = useState(() => quickRange("today")[0]);
  const [to, setTo] = useState(() => quickRange("today")[1]);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"" | "pdf" | "xlsx">("");
  const printRef = useRef<HTMLDivElement>(null);

  const ownerOfAll = picked.every((id) => shops.find((s) => s.id === id)?.role === "owner");
  const groups = REPORT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.owner || ownerOfAll) })).filter((g) => g.items.length);
  const label = groups.flatMap((g) => g.items).find((i) => i.kind === kind)?.label || "";
  const shopLabel = picked.length === shops.length && shops.length > 1 ? "All shops" : shops.filter((s) => picked.includes(s.id)).map((s) => s.name).join(", ");

  const run = useCallback(
    async (k: string, f: string, t: string, ids: string[]) => {
      if (!ids.length) return setTable(null);
      if (f > t) return toast.error("The 'from' date is after the 'to' date.");
      setLoading(true);
      try {
        setTable(await cloudApi.report(k, startOf(f), endOf(t), ids, -new Date().getTimezoneOffset()));
      } catch (e) {
        setTable(null);
        toast.error(cloudError(e));
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );
  useEffect(() => {
    if (!groups.some((g) => g.items.some((i) => i.kind === kind))) setKind("daily");
    else run(kind, from, to, picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, picked]);

  const shown = useMemo(() => {
    if (!table) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return table;
    const rows = table.rows.filter((r) => r.some((v) => String(v ?? "").toLowerCase().includes(q)));
    const totals = table.totals.length ? table.totals.map((v, i) => (typeof v === "number" ? rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : v)) : [];
    return { ...table, rows, totals, note: [table.note, `Filtered: ${rows.length} of ${table.rows.length} rows.`].filter(Boolean).join(" ") };
  }, [table, filter]);

  const exportAs = async (fmt: "pdf" | "xlsx") => {
    if (!shown) return;
    setBusy(fmt);
    try {
      const data = fmt === "pdf" ? await reportPdf(shown, shopLabel) : await reportXlsx(shown, shopLabel);
      await saveFile(`${fileStem(shown, shopLabel)}.${fmt}`, data, fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (e) {
      toast.error(cloudError(e));
    } finally {
      setBusy("");
    }
  };

  const stale = shops.filter((s) => picked.includes(s.id) && (!s.last_sync_at || Date.now() - new Date(s.last_sync_at).getTime() > 60 * 60000));

  return (
    <div className="grid lg:grid-cols-[230px_1fr] gap-5">
      <aside className="space-y-4">
        {shops.length > 1 && (
          <div className={`${card} p-3`}>
            <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400 mb-2">Shops</div>
            <button onClick={() => setPicked(shops.map((s) => s.id))} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm font-semibold ${picked.length === shops.length ? "bg-emerald-50 text-emerald-700" : ""}`}>All shops</button>
            {shops.map((s) => (
              <button key={s.id} onClick={() => setPicked([s.id])} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm ${picked.length === 1 && picked[0] === s.id ? "bg-emerald-50 text-emerald-700 font-semibold" : ""}`}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <nav className={`${card} p-3`}>
          {groups.map((g) => (
            <div key={g.title} className="mb-2 last:mb-0">
              <div className="text-[11px] uppercase tracking-wide font-bold text-slate-400 px-2 mb-1">{g.title}</div>
              {g.items.map((i) => (
                <button key={i.kind} onClick={() => setKind(i.kind)} className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between ${kind === i.kind ? "bg-emerald-50 text-emerald-700 font-semibold" : "hover:bg-slate-50"}`}>
                  {i.label}
                  {kind === i.kind && <ChevronRight className="w-4 h-4" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className={`${card} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold mr-auto">{label}<span className="ml-2 text-sm font-medium text-slate-500">{shopLabel}</span></h1>
            {loading && <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />}
            <button onClick={() => exportAs("pdf")} disabled={!shown || !!busy} className={`${btn} bg-slate-100`}>{busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF</button>
            <button onClick={() => exportAs("xlsx")} disabled={!shown || !!busy} className={`${btn} bg-slate-100`}>{busy === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel</button>
            <button
              onClick={() => printRef.current && shown && printElement(printRef.current, { ...(shown.columns.length > 6 ? A4_LANDSCAPE : A4_PAGE), title: shown.title })}
              disabled={!shown}
              className={`${btn} bg-slate-100`}
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
          {!kind.startsWith("list_") && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1 py-2`} /></label>
              <label className="text-xs font-semibold text-slate-500">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1 py-2`} /></label>
              <button onClick={() => run(kind, from, to, picked)} className={`${btn} bg-emerald-600 text-white`}><RefreshCw className="w-4 h-4" /> Show</button>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_RANGES.map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => {
                      const [f, t] = quickRange(k);
                      setFrom(f);
                      setTo(t);
                      run(kind, f, t, picked);
                    }}
                    className="px-2.5 py-1.5 rounded-full text-xs font-semibold bg-slate-100 hover:bg-slate-200"
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search in this report" className={`${field} pl-9`} />
          </div>
          {stale.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
              {stale.map((s) => `${s.name}: last update ${ago(s.last_sync_at)}`).join(" · ")}. Figures are as of the last update from the shop PC.
            </p>
          )}
        </div>

        {shown && (
          <div ref={printRef} className="space-y-3">
            <div className="text-xs text-slate-500">{periodText(shown)}</div>
            {shown.summary.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {shown.summary.map((s) => (
                  <div key={s.label} className={`${card} p-3`}>
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className="text-lg font-extrabold mt-0.5">{formatCell(s.value, s.kind)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className={`${card} overflow-x-auto`}>
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {shown.columns.map((c) => (
                      <th key={c.key} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${isNumericKind(c.kind) ? "text-right" : "text-left"}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.rows.length === 0 && (
                    <tr><td colSpan={shown.columns.length} className="px-3 py-10 text-center text-slate-500">Nothing in this period.</td></tr>
                  )}
                  {shown.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {r.map((v, j) => (
                        <td key={j} className={`px-3 py-2 whitespace-nowrap ${isNumericKind(shown.columns[j].kind) ? "text-right tabular-nums" : ""}`}>{formatCell(v, shown.columns[j].kind)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {shown.totals.length > 0 && shown.rows.length > 0 && (
                  <tfoot className="bg-emerald-50 font-bold">
                    <tr>
                      {shown.totals.map((v, j) => (
                        <td key={j} className={`px-3 py-2 whitespace-nowrap border-t-2 border-emerald-600 ${isNumericKind(shown.columns[j].kind) ? "text-right tabular-nums" : ""}`}>
                          {typeof v === "string" ? v : formatCell(v, shown.columns[j].kind)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {shown.note && <p className="text-xs text-slate-500">{shown.note}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------ shops

function Shops({ shops, reload }: { shops: CloudShop[]; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkFor, setLinkFor] = useState<CloudShop | null>(null);
  const [teamFor, setTeamFor] = useState<CloudShop | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await cloudApi.createShop(name.trim());
      setName("");
      reload();
      setLinkFor({ id, name: name.trim(), role: "owner", pc_name: null, linked_at: null, last_sync_at: null, last_backup_at: null, created_at: new Date().toISOString() });
    } catch (err) {
      toast.error(cloudError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <form onSubmit={add} className={`${card} p-4 flex flex-wrap gap-2 items-end`}>
        <label className="text-xs font-semibold text-slate-600 flex-1 min-w-[220px]">New shop name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Madina Store – Gulberg" className={`${field} mt-1`} /></label>
        <button disabled={busy || !name.trim()} className={`${btn} bg-emerald-600 text-white`}><Plus className="w-4 h-4" /> Add shop</button>
      </form>
      {shops.length === 0 && <p className="text-sm text-slate-500">No shops yet.</p>}
      {shops.map((s) => (
        <div key={s.id} className={`${card} p-4 flex flex-wrap items-center gap-3`}>
          <div className="min-w-0 flex-1">
            <div className="font-bold flex items-center gap-2">
              {s.name}
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.role === "owner" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.role === "owner" ? "Owner" : "Manager"}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {s.linked_at ? <>PC: {s.pc_name || "linked"} · last update {ago(s.last_sync_at)}{s.role === "owner" && <> · last backup {ago(s.last_backup_at)}</>}</> : "PC not linked yet"}
            </div>
          </div>
          {s.role === "owner" && (
            <>
              <button onClick={() => setLinkFor(s)} className={`${btn} bg-slate-100`}><Cloud className="w-4 h-4" /> {s.linked_at ? "Link a new PC" : "Link PC"}</button>
              <button onClick={() => setTeamFor(s)} className={`${btn} bg-slate-100`}><Users className="w-4 h-4" /> Managers</button>
              <button
                onClick={async () => {
                  const n = window.prompt("Shop name", s.name);
                  if (!n || n.trim() === s.name) return;
                  try {
                    await cloudApi.renameShop(s.id, n.trim());
                    reload();
                  } catch (e) {
                    toast.error(cloudError(e));
                  }
                }}
                className={`${btn} bg-slate-100`}
              >
                Rename
              </button>
              <button
                onClick={async () => {
                  const n = window.prompt(`This removes "${s.name}" and its whole cloud copy (the shop PC keeps its own data). Type the shop name to confirm.`);
                  if (n !== s.name) return;
                  try {
                    await cloudApi.deleteShop(s.id);
                    reload();
                  } catch (e) {
                    toast.error(cloudError(e));
                  }
                }}
                className={`${btn} text-rose-600 hover:bg-rose-50`}
                title="Remove shop"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ))}
      {linkFor && <LinkDialog shop={linkFor} onClose={() => { setLinkFor(null); reload(); }} />}
      {teamFor && <TeamDialog shop={teamFor} onClose={() => setTeamFor(null)} />}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`${card} w-full max-w-lg p-5 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h2 className="font-bold text-lg mr-auto">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LinkDialog({ shop, onClose }: { shop: CloudShop; onClose: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    cloudApi.linkCode(shop.id).then(setCode).catch((e) => toast.error(cloudError(e)));
  }, [shop.id, toast]);
  return (
    <Dialog title={`Link the PC of ${shop.name}`} onClose={onClose}>
      <ol className="text-sm space-y-1.5 list-decimal pl-5 text-slate-700">
        <li>On the shop PC open Next POS and log in as Owner.</li>
        <li>Go to <b>More → Backup</b>, find <b>Next POS Cloud</b>.</li>
        <li>Paste this code and press <b>Link this shop</b>.</li>
      </ol>
      <div className="mt-3 flex gap-2">
        <input readOnly value={code || "Making a code…"} className={`${field} font-mono text-xs`} onFocus={(e) => e.target.select()} />
        <button
          disabled={!code}
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={`${btn} bg-emerald-600 text-white`}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">The code works once and only for 30 minutes. Linking a new PC stops the old one from sending.</p>
    </Dialog>
  );
}

function TeamDialog({ shop, onClose }: { shop: CloudShop; onClose: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<CloudManager[] | null>(null);
  const [email, setEmail] = useState("");
  const load = useCallback(() => cloudApi.managers(shop.id).then(setList).catch((e) => toast.error(cloudError(e))), [shop.id, toast]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Dialog title={`Managers of ${shop.name}`} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">Managers can see this shop's reports (not the activity log or backups). They cannot change anything.</p>
      <form
        className="flex gap-2 mb-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await cloudApi.addManager(shop.id, email);
            toast.success(r === "added" ? "Manager added." : "Invited. They get access when they create an account with this email.");
            setEmail("");
            load();
          } catch (err) {
            toast.error(cloudError(err));
          }
        }}
      >
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@email.com" className={field} />
        <button className={`${btn} bg-emerald-600 text-white`}><UserPlus className="w-4 h-4" /> Add</button>
      </form>
      <div className="divide-y divide-slate-100">
        {list?.length === 0 && <p className="text-sm text-slate-500 py-2">No managers yet.</p>}
        {list?.map((m) => (
          <div key={m.email} className="py-2 flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{m.email}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${m.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{m.status === "active" ? "Active" : "Invited"}</span>
            <button
              onClick={async () => {
                try {
                  await cloudApi.removeManager(shop.id, m.email);
                  load();
                } catch (e) {
                  toast.error(cloudError(e));
                }
              }}
              className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
              aria-label={`Remove ${m.email}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------ backups

function Backups({ shops }: { shops: CloudShop[] }) {
  const toast = useToast();
  const [shop, setShop] = useState(shops[0]?.id || "");
  const [list, setList] = useState<CloudBackup[] | null>(null);
  useEffect(() => {
    if (!shop) return;
    setList(null);
    cloudApi.backups(shop).then(setList).catch((e) => toast.error(cloudError(e)));
  }, [shop, toast]);
  if (!shops.length) return <p className="text-sm text-slate-500">Only shop owners see backups.</p>;
  return (
    <div className="max-w-3xl space-y-4">
      <div className={`${card} p-4`}>
        <h1 className="text-xl font-extrabold">Cloud backups</h1>
        <p className="text-sm text-slate-600 mt-1">
          Each linked PC uploads a backup once a day, locked with the backup password set on that PC. To restore: download the file, then on the
          (new) PC use <b>More → Backup → Restore</b> with the same password. The latest 30 are kept.
        </p>
        {shops.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {shops.map((s) => (
              <button key={s.id} onClick={() => setShop(s.id)} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${shop === s.id ? "bg-emerald-600 text-white" : "bg-slate-100"}`}>{s.name}</button>
            ))}
          </div>
        )}
      </div>
      <div className={`${card} divide-y divide-slate-100`}>
        {list === null && <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>}
        {list?.length === 0 && <p className="p-4 text-sm text-slate-500">No backups yet. Turn on "Daily cloud backup" on the shop PC (More → Backup → Next POS Cloud).</p>}
        {list?.map((b) => (
          <div key={b.id} className="p-3 flex items-center gap-3 text-sm">
            <HardDriveDownload className="w-4 h-4 text-slate-400" />
            <span className="flex-1">{new Date(b.created_at).toLocaleString()}</span>
            <span className="text-slate-500">{b.size_bytes ? `${(b.size_bytes / 1048576).toFixed(1)} MB` : ""}</span>
            <button
              onClick={async () => {
                try {
                  window.location.href = await cloudApi.backupLink(shop, b.path);
                } catch (e) {
                  toast.error(cloudError(e));
                }
              }}
              className={`${btn} bg-slate-100`}
            >
              <Download className="w-4 h-4" /> Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
