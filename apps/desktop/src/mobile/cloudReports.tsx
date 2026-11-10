// Reports over the internet (Next POS Cloud): works anywhere, no shop WiFi
// needed. Read-only. Sales, purchases and the scanner still need the shop PC.
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Cloud, Loader2, LogOut, Store } from "lucide-react";
import { cloudApi, cloudConfigured, cloudError, CloudShop } from "../lib/cloud";
import { REPORT_GROUPS } from "../lib/reportCatalog";
import { useToast } from "../lib/toast";
import { bigBtn, card } from "./MobileApp";
import { ReportDetail, ReportMenu } from "./screens";

const input = "w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-base";

export function CloudReports({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!cloudConfigured) return;
    cloudApi.session().then(setSession);
    const sub = cloudApi.onAuth(setSession);
    return () => sub.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-emerald-700 text-white px-4 py-3 flex items-center gap-2 shadow">
        <button onClick={onBack} aria-label="Back to shop PC" className="p-2 rounded-xl bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="font-bold flex items-center gap-1.5"><Cloud className="w-4 h-4" /> Next POS Cloud</div>
          <div className="text-[11px] text-emerald-100 truncate">{session ? session.user.email : "Reports from anywhere"}</div>
        </div>
        {session && (
          <button onClick={() => cloudApi.logOut()} aria-label="Log out" className="p-2 rounded-xl bg-white/10"><LogOut className="w-5 h-5" /></button>
        )}
      </header>
      <main className="flex-1 pb-6">
        {!cloudConfigured ? (
          <p className="p-6 text-sm text-slate-500">Next POS Cloud is not set up in this app.</p>
        ) : session === undefined ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>
        ) : session ? (
          <CloudBody />
        ) : (
          <CloudLogin />
        )}
      </main>
    </div>
  );
}

function CloudLogin() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="p-4 space-y-3 max-w-sm mx-auto"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await cloudApi.logIn(email, pw);
        } catch (err) {
          toast.error(cloudError(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={`${card} p-4 text-sm text-slate-600 dark:text-slate-300`}>
        Log in with your Next POS Cloud account (the one you use on the admin website) to see your shops' reports anywhere.
      </div>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className={input} />
      <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="Password" className={input} />
      <button disabled={busy} className={`${bigBtn} bg-emerald-600 text-white`}>{busy && <Loader2 className="w-5 h-5 animate-spin" />} Log in</button>
    </form>
  );
}

function CloudBody() {
  const toast = useToast();
  const [shops, setShops] = useState<CloudShop[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  useEffect(() => {
    cloudApi
      .shops()
      .then((s) => {
        setShops(s);
        setPicked(s.map((x) => x.id));
      })
      .catch((e) => toast.error(cloudError(e)));
  }, [toast]);

  const load = useCallback(
    (k: string, from: string, to: string) => cloudApi.report(k, from, to, picked, -new Date().getTimezoneOffset()),
    [picked]
  );

  if (shops === null) return <div className="p-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>;
  if (!shops.length)
    return (
      <div className="p-6">
        <div className={`${card} p-5 text-center text-sm text-slate-600`}>
          <Store className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          No shops on this account yet. The owner adds shops on the admin website; managers are added by the owner.
        </div>
      </div>
    );

  const ownerOfAll = picked.every((id) => shops.find((s) => s.id === id)?.role === "owner");
  const shopText = picked.length === shops.length && shops.length > 1 ? "All shops" : shops.filter((s) => picked.includes(s.id)).map((s) => s.name).join(", ");
  const updated = shops
    .filter((s) => picked.includes(s.id))
    .map((s) => `${s.name}: ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : "not linked yet"}`)
    .join(" · ");

  if (kind) return <ReportDetail kind={kind} label={label} subtitle={shopText} load={load} onBack={() => setKind(null)} />;

  return (
    <div className="pt-3">
      {shops.length > 1 && (
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          <button onClick={() => setPicked(shops.map((s) => s.id))} className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${picked.length === shops.length ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800"}`}>All shops</button>
          {shops.map((s) => (
            <button key={s.id} onClick={() => setPicked([s.id])} className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${picked.length === 1 && picked[0] === s.id ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <p className="px-4 pb-2 text-[11px] text-slate-500">Last update from the shop PC — {updated}</p>
      <ReportMenu
        ownerReports={ownerOfAll}
        onPick={(k) => {
          setLabel(REPORT_GROUPS.flatMap((g) => g.items).find((i) => i.kind === k)?.label || k);
          setKind(k);
        }}
      />
    </div>
  );
}
