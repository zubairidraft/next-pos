import { useEffect, useState } from "react";
import { Copy, Key, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { api, errorText, LicenseInfo, licenseLabel } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";

export function LicenseView() {
  const toast = useToast();
  const { refresh } = useSession();
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.licenseInfo().then(setInfo).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const st = await api.installLicense(token.trim());
      toast.success(licenseLabel(st));
      setToken("");
      load();
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const ok = info && ["Active", "TrialActive", "GracePeriod"].includes(info.status.status);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <section className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900">
        <h2 className="text-base font-bold flex items-center gap-2 mb-3"><Key className="w-5 h-5 text-emerald-500" /> License</h2>
        {!info ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : (
          <>
            <div className={`p-3 rounded-xl flex items-center gap-2 font-semibold ${ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
              {ok ? <ShieldCheck className="w-5 h-5" /> : <ShieldX className="w-5 h-5" />} {licenseLabel(info.status)}
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-500">This PC's ID (send it to your dealer to get a license key)</div>
              <div className="flex items-center gap-2 mt-1">
                <code className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-sm select-all">{info.machine_id}</code>
                <button onClick={() => navigator.clipboard?.writeText(info.machine_id).then(() => toast.success("Copied"))} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800" aria-label="Copy PC ID"><Copy className="w-4 h-4" /></button>
              </div>
            </div>
          </>
        )}
      </section>

      <form onSubmit={activate} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-bold mb-2">Enter license key</h3>
        <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="NPL1.…" className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono text-xs" />
        <button disabled={busy || !token.trim().startsWith("NPL1.")} className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-1">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Activate
        </button>
        <p className="text-xs text-slate-500 mt-2">The key works only on this PC. After a license ends there are 7 extra days; then new sales stop, but reports, khata and backups keep working.</p>
      </form>
    </div>
  );
}
