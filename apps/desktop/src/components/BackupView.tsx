import { useEffect, useState } from "react";
import { Camera, Cloud, CloudOff, HardDriveDownload, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { api, BackupFileInfo, CloudSettingsView, errorText, SnapshotInfo } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";

const field = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const box = "border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900";

export function BackupView() {
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <Backups />
      <Snapshots />
      <CloudSync />
    </div>
  );
}

function Backups() {
  const toast = useToast();
  const { refresh } = useSession();
  const [dir, setDir] = useState("");
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const load = (d = dir) => api.listBackups(d || null).then(setFiles).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    api.defaultBackupDir().then((d) => (setDir(d), load(d))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const f = await api.createBackup(pw, dir || null);
      toast.success(`Backup saved: ${f.filename} (${mb(f.size_bytes)})`);
      setPw("");
      setPw2("");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (f: BackupFileInfo) => {
    const p = await toast.prompt(`Check ${f.filename}`, "Backup password", { type: "password" });
    if (!p) return;
    try {
      const m = await api.verifyBackup(f.path, p);
      toast.success(`Backup is good (made ${new Date(m.created_at).toLocaleString()}, app ${m.app_version}).`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const restore = async (f: BackupFileInfo) => {
    const ok = await toast.confirm(
      `Restore ${f.filename}?`,
      "All data on this PC will be replaced by the backup. The current data is kept aside as a safety copy. Everyone is logged out.",
      { danger: true, confirmLabel: "Continue" }
    );
    if (!ok) return;
    const p = await toast.prompt("Restore backup", "Backup password", { type: "password" });
    if (!p) return;
    setBusy(true);
    try {
      const r = await api.restoreBackup(f.path, p);
      toast.success(`Restored. Safety copy of the old data: ${r.safety_copy_path || "none"}`);
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={box}>
      <h2 className="text-base font-bold flex items-center gap-2 mb-1"><HardDriveDownload className="w-5 h-5 text-emerald-500" /> Backups</h2>
      <p className="text-xs text-slate-500 mb-4">An encrypted copy of all shop data. Save it on a USB drive and keep the drive away from the shop PC. You need the backup password to restore.</p>
      <div className="grid md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Folder (e.g. E:\)<input value={dir} onChange={(e) => setDir(e.target.value)} onBlur={() => load()} className={field} /></label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Backup password (8+)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} /></label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Password again<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} /></label>
        <button onClick={create} disabled={busy || pw.length < 8 || pw !== pw2} className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-1 h-[38px]">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />} Back up now
        </button>
      </div>
      {pw2 && pw !== pw2 && <p className="text-xs text-rose-600 mt-1">Passwords do not match.</p>}
      <p className="text-xs text-amber-600 mt-2">Write the backup password down. Without it the backup cannot be opened, by anyone.</p>

      <table className="w-full text-sm mt-4">
        <thead className="text-xs text-slate-500"><tr className="text-left border-b border-slate-200 dark:border-slate-800"><th className="py-1.5">File</th><th>Date</th><th className="text-right">Size</th><th /></tr></thead>
        <tbody>
          {files.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-500">No backups in this folder.</td></tr>}
          {files.map((f) => (
            <tr key={f.path} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-1.5 font-mono text-xs">{f.filename}{!f.manifest && <span className="text-rose-600"> (damaged)</span>}</td>
              <td>{new Date(f.modified_at).toLocaleString()}</td>
              <td className="text-right">{mb(f.size_bytes)}</td>
              <td className="text-right space-x-2 whitespace-nowrap">
                <button onClick={() => verify(f)} className="text-xs font-semibold text-emerald-600"><ShieldCheck className="w-3.5 h-3.5 inline" /> Check</button>
                <button onClick={() => restore(f)} disabled={busy} className="text-xs font-semibold text-rose-600"><RotateCcw className="w-3.5 h-3.5 inline" /> Restore</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Snapshots() {
  const toast = useToast();
  const [list, setList] = useState<SnapshotInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.listSnapshots().then(setList).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = async () => {
    setBusy(true);
    try {
      await api.createSnapshot();
      toast.success("Snapshot saved");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={box}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2"><Camera className="w-5 h-5 text-emerald-500" /> Automatic snapshots</h2>
          <p className="text-xs text-slate-500">Taken every 30 minutes on this PC (last 48, plus one a day for 30 days). They protect against mistakes, not against a broken PC. Use backups for that.</p>
        </div>
        <button onClick={take} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Take one now
        </button>
      </div>
      <p className="text-sm mt-3">
        {list.length ? `${list.length} snapshots. Latest: ${new Date(list[0].created_at).toLocaleString()} (${mb(list[0].file_size_bytes)}).` : "No snapshots yet."}
      </p>
    </section>
  );
}

function CloudSync() {
  const toast = useToast();
  const { can } = useSession();
  const [st, setSt] = useState<CloudSettingsView | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.cloudSettings().then((s) => {
      setSt(s);
      setUrl(s.url || "");
    }).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    if (can("SettingsManage")) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!can("SettingsManage")) return null;

  const save = async (enabled: boolean) => {
    setBusy(true);
    try {
      const s = await api.saveCloudSettings({ enabled, url: url.trim() || null, api_key: key ? key.trim() : null });
      setSt(s);
      setKey("");
      toast.success(enabled ? "Cloud sync is on" : "Cloud sync is off");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.syncToCloud();
      toast.success(r.message);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={box}>
      <h2 className="text-base font-bold flex items-center gap-2 mb-1">
        {st?.enabled ? <Cloud className="w-5 h-5 text-emerald-500" /> : <CloudOff className="w-5 h-5 text-slate-400" />} Cloud sync (optional, Owner only)
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Off by default. When on, a summary of each sale and refund (invoice number, totals, customer ID) is sent to your own cloud server so you can see
        several shops in one place. Nothing is sent while it is off. The app keeps working fully offline either way.
      </p>
      {st && (
        <>
          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <span>Status: <b className={st.enabled ? "text-emerald-600" : "text-slate-500"}>{st.enabled ? "On" : "Off"}</b></span>
            <span>Waiting to send: <b>{st.pending_events}</b></span>
            {st.last_synced_at && <span>Last sync: {new Date(st.last_synced_at).toLocaleString()}</span>}
            {st.consent_at && <span className="text-slate-500">Turned on by Owner: {new Date(st.consent_at).toLocaleDateString()}</span>}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Server URL (https://…)<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" className={field} /></label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Server key {st.key_set && <span className="font-normal text-slate-400">(saved; type to replace)</span>}
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} className={field} />
            </label>
          </div>
          {!st.enabled && (
            <label className="flex items-start gap-2 text-xs mt-3 text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              I am the shop Owner and I agree that sale summaries are sent to the server above.
            </label>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {st.enabled ? (
              <>
                <button onClick={sync} disabled={busy} className="px-3 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
                </button>
                <button onClick={() => save(true)} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">Save changes</button>
                <button onClick={() => save(false)} disabled={busy} className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold">Turn off</button>
              </>
            ) : (
              <button onClick={() => save(true)} disabled={busy || !agree || !url.trim() || (!key && !st.key_set)} className="px-3 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold">
                Turn on cloud sync
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
