import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  Database,
  Download,
  Upload,
  HardDrive,
  RefreshCw,
  Lock,
  CheckCircle,
  History,
  FileArchive,
  Cloud,
  CheckCircle2,
} from "lucide-react";
import { api, SnapshotInfo } from "../lib/api";

export function BackupView() {
  const { t } = useTranslation();

  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFilePath, setBackupFilePath] = useState("");
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudSyncMsg, setCloudSyncMsg] = useState<string | null>(null);

  const loadSnapshots = async () => {
    try {
      const list = await api.listDatabaseSnapshots();
      setSnapshots(list);
    } catch (e) {
      console.warn("Failed to load snapshots:", e);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, []);

  const handleSyncToCloud = async () => {
    setIsSyncingCloud(true);
    setCloudSyncMsg(null);
    try {
      const res = await api.syncToCloud();
      setCloudSyncMsg(res.message);
    } catch (err: any) {
      setCloudSyncMsg("Sync failed: " + (err?.message || String(err)));
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      const snap = await api.createLiveSnapshot();
      setBannerMsg(`Live VACUUM snapshot created: ${snap.filename} (${(snap.file_size_bytes / 1024).toFixed(1)} KB)`);
      loadSnapshots();
      setTimeout(() => setBannerMsg(null), 5000);
    } catch (err: any) {
      alert("Snapshot creation failed: " + (err?.message || String(err)));
    }
  };

  const handleExportBackup = async () => {
    if (!exportPassword || exportPassword.length < 8) {
      alert("Please provide a secure backup passphrase of at least 8 characters.");
      return;
    }
    setIsExporting(true);
    try {
      const msg = await api.exportBackup(exportPassword);
      setBannerMsg(msg);
      setShowExportModal(false);
      setExportPassword("");
      setTimeout(() => setBannerMsg(null), 5000);
    } catch (err: any) {
      alert("Backup export failed: " + (err?.message || String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!backupPassword) {
      alert("Please enter the backup decryption passphrase.");
      return;
    }
    if (!backupFilePath.trim()) {
      alert("Please provide the full path to the .kpos backup file.");
      return;
    }
    setIsRestoring(true);
    setRestoreStatus("Verifying Argon2id password, cryptographic checksum and SQLite tables...");
    try {
      const res = await api.restoreBackup(backupPassword, backupFilePath.trim());
      alert(res);
      setShowRestoreModal(false);
      setBackupPassword("");
      setBackupFilePath("");
      setRestoreStatus(null);
      loadSnapshots();
    } catch (err: any) {
      alert("Restore failed: " + (err?.message || String(err)));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            {t("backup.title") || "Database Protection & Encrypted Backup"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automated 30-minute WAL live snapshots, 24-hour rolling retention, and AES encrypted USB export.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateSnapshot}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
            Snapshot Now
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to USB (.kpos)</span>
          </button>
          <button
            onClick={() => setShowRestoreModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60 transition"
          >
            <Upload className="w-3.5 h-3.5 text-rose-500" />
            Restore Database
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {/* Supabase Multi-Store Cloud Sync Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-white to-slate-50 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Supabase PostgreSQL Cloud Gateway</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                  Active (ap-south-1)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Multi-Store Event Log • Outbox Pattern • Sub-5ms Local Billing with Zero Lag
              </p>
            </div>
          </div>

          <button
            onClick={handleSyncToCloud}
            disabled={isSyncingCloud}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-md transition active:scale-95 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? "animate-spin" : ""}`} />
            <span>{isSyncingCloud ? "Syncing..." : "Sync to Cloud Now"}</span>
          </button>
        </div>

        {cloudSyncMsg && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-slate-950/60 border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{cloudSyncMsg}</span>
          </div>
        )}
      </div>

      {/* Snapshot Strategy & Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Active Snapshot Policy</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Every 30 Minutes</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Non-blocking online copy powered by SQLite <code className="text-emerald-600 dark:text-emerald-400 font-mono">VACUUM INTO</code>. Zero downtime during busy checkout.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg border border-sky-200 dark:border-sky-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Rolling Retention</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">24 Hourly Snapshots</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Older snapshots are rotated out automatically to save disk space while guaranteeing point-in-time recovery.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-200 dark:border-indigo-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Archive Encryption</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">256-bit Keystream & Checksum</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Exports are encrypted and checksummed to guard against bit rot, USB tampering, or unauthorized data access.
          </p>
        </div>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-emerald-500" />
            Recent Snapshots on Disk
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Location: ./snapshots/</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="pb-2 font-medium">Snapshot File</th>
                <th className="pb-2 font-medium">Created Time</th>
                <th className="pb-2 font-medium text-right">Size</th>
                <th className="pb-2 font-medium text-center">Integrity</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No snapshots recorded yet. Click "Snapshot Now" to create a live SQLite backup.
                  </td>
                </tr>
              ) : (
                snapshots.map((s, idx) => (
                  <tr key={s.path || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      {s.filename}
                    </td>
                    <td className="py-2.5 text-slate-700 dark:text-slate-300">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                      {(s.file_size_bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <CheckCircle className="w-3 h-3" />
                        {s.is_valid ? "Valid WAL Replica" : "Pending"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => {
                          setBackupFilePath(s.path);
                          setShowRestoreModal(true);
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold underline underline-offset-2"
                      >
                        Restore This
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Database Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-500/30">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Encrypted Standalone Backup (.kpos)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Argon2id Key Derivation + SQLCipher Export</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Export an encrypted, standalone single-file archive of the entire database. You will need this passphrase to restore transactions on any other PC.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Set Backup Passphrase (min 8 chars)</label>
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Enter strong passphrase..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowExportModal(false)}
                disabled={isExporting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExportBackup}
                disabled={isExporting}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
              >
                {isExporting ? "Encrypting..." : "Create Backup (.kpos)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Database Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-500/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Disaster Recovery Restore</h3>
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">Overwrites current active database</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Restoring from a <code className="text-emerald-600 dark:text-emerald-400 font-mono">.kpos</code> backup package will replace current transactions. A pre-restore safety copy (<code className="text-slate-500">.pre_restore_safety</code>) will automatically be created before any changes take effect.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Backup File Path (.kpos / .kdb)</label>
              <input
                type="text"
                value={backupFilePath}
                onChange={(e) => setBackupFilePath(e.target.value)}
                placeholder="C:\path\to\backup_20261104.kpos"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Backup Decryption Passphrase</label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter 256-bit passphrase..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {restoreStatus && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-slate-950 border border-amber-200 dark:border-slate-800 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {restoreStatus}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowRestoreModal(false)}
                disabled={isRestoring}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition"
              >
                {isRestoring ? "Restoring..." : "Confirm & Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
