import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy, HardDriveDownload, KeyRound, Layers, Loader2, ShieldAlert, Store } from "lucide-react";
import { api, BackupFileInfo, errorText } from "../lib/api";
import { useSession } from "../context/SessionContext";

const input =
  "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500";
const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300";

/** First run: shop details → Owner account → recovery phrase (shown once). */
export const FirstRunWizard: React.FC = () => {
  const { setSession, refresh } = useSession();
  const [mode, setMode] = useState<"new" | "restore">("new");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [savedPhrase, setSavedPhrase] = useState(false);
  const [pendingSession, setPendingSession] = useState<Parameters<typeof setSession>[0]>(null);

  const [f, setF] = useState({
    name: "",
    name_ur: "",
    phone: "",
    address: "",
    ntn: "",
    tax_mode: "inclusive" as "inclusive" | "exclusive",
    packs: ["grocery"] as string[],
    demo: false,
    username: "owner",
    password: "",
    password2: "",
    pin: "",
  });
  const set = (k: keyof typeof f, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const step1Ok = f.name.trim().length > 0;
  const step2Ok =
    f.username.trim().length >= 3 && f.password.length >= 8 && f.password === f.password2 && /^\d{4,8}$/.test(f.pin);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.setupFirstRun(
        {
          name: f.name.trim(),
          name_ur: f.name_ur.trim() || null,
          phone: f.phone.trim() || null,
          address: f.address.trim() || null,
          ntn: f.ntn.trim() || null,
          tax_mode: f.tax_mode,
          enabled_packs: f.packs,
          demo_catalog: f.demo,
        },
        { username: f.username.trim(), password: f.password, pin: f.pin }
      );
      setPhrase(r.recovery_phrase);
      setPendingSession(r.session);
      setStep(3);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Next POS Setup</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Set up this shop once. Takes about two minutes.</p>
        </div>

        {step === 1 && (
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5 text-xs font-semibold">
            <button className={`flex-1 py-2 rounded-lg ${mode === "new" ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white" : "text-slate-500"}`} onClick={() => setMode("new")}>
              <Store className="w-3.5 h-3.5 inline mr-1" /> New shop
            </button>
            <button className={`flex-1 py-2 rounded-lg ${mode === "restore" ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white" : "text-slate-500"}`} onClick={() => setMode("restore")}>
              <HardDriveDownload className="w-3.5 h-3.5 inline mr-1" /> Restore a backup (new PC)
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {mode === "restore" && step === 1 ? (
          <RestorePanel onRestored={refresh} />
        ) : (
          <>
            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Store className="w-4 h-4 text-emerald-500" /> Shop details</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className={label}>Shop name *<input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></label>
                  <label className={label}>Shop name in Urdu<input className={input} dir="rtl" value={f.name_ur} onChange={(e) => set("name_ur", e.target.value)} /></label>
                  <label className={label}>Phone<input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" /></label>
                  <label className={label}>NTN (optional)<input className={input} value={f.ntn} onChange={(e) => set("ntn", e.target.value)} /></label>
                </div>
                <label className={label}>Address<input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className={label}>
                    Prices are
                    <select className={input} value={f.tax_mode} onChange={(e) => set("tax_mode", e.target.value)}>
                      <option value="inclusive">Tax included (MRP)</option>
                      <option value="exclusive">Tax added at the counter</option>
                    </select>
                  </label>
                  <div className={label}>
                    Business type
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {[["grocery", "Grocery"], ["electronics", "Electronics"], ["apparel", "Clothing"]].map(([k, l]) => (
                        <label key={k} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={f.packs.includes(k)} onChange={(e) => set("packs", e.target.checked ? [...f.packs, k] : f.packs.filter((x) => x !== k))} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 pt-1">
                  {[
                    [false, "Empty shop", "Start with no products. Enter or import your real catalog."],
                    [true, "Demo products", "Adds 5 sample products with stock and one sample customer, for training."],
                  ].map(([v, t, d]) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => set("demo", v)}
                      className={`text-left p-3 rounded-xl border ${f.demo === v ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-700"}`}
                    >
                      <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><Layers className="w-4 h-4 text-emerald-500" /> {t as string}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{d as string}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-emerald-500" /> Owner account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">The Owner can do everything, including backups and adding cashiers. Choose a password nobody else knows.</p>
                <label className={label}>Username<input className={input} value={f.username} onChange={(e) => set("username", e.target.value)} autoFocus /></label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className={label}>Password (8+ characters)<input type="password" className={input} value={f.password} onChange={(e) => set("password", e.target.value)} /></label>
                  <label className={label}>Password again<input type="password" className={input} value={f.password2} onChange={(e) => set("password2", e.target.value)} /></label>
                </div>
                {f.password2 && f.password !== f.password2 && <p className="text-xs text-rose-600">Passwords do not match.</p>}
                <label className={label}>
                  Quick PIN (4–8 digits, for switching users and approvals)
                  <input inputMode="numeric" className={input} value={f.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, "").slice(0, 8))} />
                </label>
              </div>
            )}

            {step === 3 && phrase && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> Write down your recovery phrase</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Your shop data is encrypted. If Windows is reinstalled or this PC breaks, this phrase is the only way to open the data again.
                  Write it on paper and keep it somewhere safe. It is shown only now.
                </p>
                <div className="font-mono text-sm break-all p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-slate-900 dark:text-amber-100 select-all">
                  {phrase}
                </div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(phrase)} className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <input type="checkbox" checked={savedPhrase} onChange={(e) => setSavedPhrase(e.target.checked)} />
                  I have written it down
                </label>
              </div>
            )}

            <div className="flex justify-between mt-6">
              {step === 2 ? (
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              ) : (
                <span />
              )}
              {step === 1 && (
                <button disabled={!step1Ok} onClick={() => setStep(2)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 disabled:opacity-40 text-white flex items-center gap-1">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {step === 2 && (
                <button disabled={!step2Ok || busy} onClick={finish} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 disabled:opacity-40 text-white flex items-center gap-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create shop
                </button>
              )}
              {step === 3 && (
                <button disabled={!savedPhrase} onClick={() => setSession(pendingSession)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 disabled:opacity-40 text-white flex items-center gap-1">
                  Start using Next POS <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function RestorePanel({ onRestored }: { onRestored: () => void }) {
  const [dir, setDir] = useState("");
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async (d: string) => {
    try {
      const list = await api.listBackups(d || null);
      setFiles(list);
      if (list[0]) setPath(list[0].path);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  useEffect(() => {
    api.defaultBackupDir().then((d) => {
      setDir(d);
      load(d);
    }).catch(() => {});
  }, []);

  const restore = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.restoreBackup(path, password);
      setMsg({ ok: true, text: "Backup restored. Log in with the Owner account from the backup." });
      onRestored();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300">Moving to a new PC? Plug in the USB with your <b>.kpos</b> backup, pick the file and enter its backup password.</p>
      <div className="flex gap-2">
        <label className={label + " flex-1"}>Backup folder<input className={input} value={dir} onChange={(e) => setDir(e.target.value)} placeholder="E:\\" /></label>
        <button onClick={() => load(dir)} className="self-end px-3 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Look</button>
      </div>
      {files.length > 0 ? (
        <label className={label}>
          Backup file
          <select className={input} value={path} onChange={(e) => setPath(e.target.value)}>
            {files.map((f) => (
              <option key={f.path} value={f.path}>
                {f.filename} ({(f.size_bytes / 1024 / 1024).toFixed(1)} MB)
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-slate-500">No .kpos files in this folder.</p>
      )}
      <label className={label}>Backup password<input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {msg && <p className={`text-xs font-semibold ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</p>}
      <button disabled={!path || password.length < 8 || busy} onClick={restore} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 disabled:opacity-40 text-white flex items-center gap-1">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />} Restore
      </button>
    </div>
  );
}
