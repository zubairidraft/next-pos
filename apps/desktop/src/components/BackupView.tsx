import { useEffect, useState } from "react";
import { Camera, Cloud, CloudOff, HardDriveDownload, Loader2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { api, BackupFileInfo, CloudActionResult, CloudStatus, errorText, SnapshotInfo } from "../lib/api";
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
  const [st, setSt] = useState<CloudStatus | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.cloudStatus().then(setSt).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    if (!can("SettingsManage")) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!can("SettingsManage")) return null;

  const run = async (what: string, f: () => Promise<unknown>, ok?: string) => {
    setBusy(what);
    try {
      const r = await f();
      if (r && typeof r === "object" && "status" in (r as object)) {
        setSt((r as CloudActionResult).status);
        toast.success((r as CloudActionResult).message);
      } else {
        if (r) setSt(r as CloudStatus);
        if (ok) toast.success(ok);
      }
    } catch (e) {
      toast.error(errorText(e));
      load();
    } finally {
      setBusy(null);
    }
  };
  const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "never");
  const btn = "px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 disabled:opacity-40";

  return (
    <section className={box}>
      <h2 className="text-base font-bold flex items-center gap-2 mb-1">
        {st?.linked ? <Cloud className="w-5 h-5 text-emerald-500" /> : <CloudOff className="w-5 h-5 text-slate-400" />} Next POS Cloud (Owner only)
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Keeps a read-only copy of this shop on your cloud account, so you and your managers can see all reports of all your shops from anywhere
        (admin website and phone). Sales keep working fully offline; changes wait on this PC and are sent when there is internet. Passwords and
        PINs never leave this PC. Nothing is sent until you link the shop.
      </p>
      {st && !st.linked && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
            Link code (admin website → Shops → Link PC)
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NPC1.…" className={field} />
          </label>
          <button onClick={() => run("link", () => api.cloudLink(code.trim()), "This shop is linked. The first upload has started.")} disabled={!!busy || !code.trim().startsWith("NPC1.")} className={`${btn} bg-emerald-600 text-white`}>
            {busy === "link" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />} Link this shop
          </button>
        </div>
      )}
      {st && st.linked && (
        <>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3">
            <span>Status: <b className={st.last_error ? "text-amber-600" : "text-emerald-600"}>{st.last_error ? "Waiting for internet" : st.pending ? "Sending…" : "Up to date"}</b></span>
            <span>Waiting to send: <b>{st.pending}</b></span>
            <span>Last sent: {when(st.last_synced_at)}</span>
            <span>Linked: {when(st.linked_at)}</span>
          </div>
          {st.last_error && <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">{st.last_error}</p>}
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => run("sync", () => api.cloudSyncNow())} disabled={!!busy} className={`${btn} bg-emerald-600 text-white`}>
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Send now
            </button>
            <button onClick={() => run("resend", () => api.cloudResendAll(), "The whole shop will be sent again.")} disabled={!!busy} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
              Send everything again
            </button>
            <button
              onClick={() => {
                if (window.confirm("Stop sending this shop to the cloud? The copy already on the cloud stays there.")) run("unlink", () => api.cloudUnlink(), "Cloud sending is off.");
              }}
              disabled={!!busy}
              className={`${btn} bg-rose-600 text-white`}
            >
              Unlink
            </button>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <h3 className="text-sm font-bold mb-1">Daily cloud backup</h3>
            <p className="text-xs text-slate-500 mb-2">
              Once a day the whole shop is backed up to the cloud, locked with this password. Write the password down: without it the backup cannot be
              opened, not even by us. Restore it on a new PC with "Restore backup" above.
            </p>
            <div className="text-sm mb-2">
              {st.backup_password_set ? <>Last backup: <b>{when(st.last_backup_at)}</b></> : <span className="text-slate-500">Off (no password set)</span>}
              {st.last_backup_error && <span className="block text-xs text-amber-700 dark:text-amber-400">{st.last_backup_error}</span>}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Backup password (8+ characters)<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} /></label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Password again<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} /></label>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => run("pw", () => api.cloudSetBackupPassword(pw), "Daily cloud backup is on.").then(() => { setPw(""); setPw2(""); })}
                disabled={!!busy || pw.length < 8 || pw !== pw2}
                className={`${btn} bg-emerald-600 text-white`}
              >
                <ShieldCheck className="w-4 h-4" /> {st.backup_password_set ? "Change password" : "Turn on daily backup"}
              </button>
              {st.backup_password_set && (
                <>
                  <button onClick={() => run("backup", () => api.cloudBackupNow())} disabled={!!busy} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
                    {busy === "backup" ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />} Back up now
                  </button>
                  <button onClick={() => run("pwoff", () => api.cloudSetBackupPassword(""), "Daily cloud backup is off.")} disabled={!!busy} className={`${btn} bg-slate-100 dark:bg-slate-800`}>
                    Turn off
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
