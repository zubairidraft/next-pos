import { useEffect, useState } from "react";
import { Activity, Barcode, CheckCircle, Loader2, Printer, RefreshCw, X, XCircle } from "lucide-react";
import { api, DiagnosticsInfo, errorText } from "../lib/api";

/** Real health checks from the backend, plus a scanner test box. Owner only. */
export function SystemDiagnosticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<DiagnosticsInfo | null>(null);
  const [printers, setPrinters] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scan, setScan] = useState("");
  const [scans, setScans] = useState<string[]>([]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p] = await Promise.all([api.diagnostics(), api.listPrinters().catch(() => [])]);
      setInfo(d);
      setPrinters(p);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) run();
  }, [isOpen]);

  if (!isOpen) return null;

  const row = (ok: boolean, label: string, detail: string) => (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
      {ok ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-slate-500 break-all">{detail}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Activity className="w-5 h-5 text-amber-500" /> System health</h2>
          <div className="flex gap-1">
            <button onClick={run} aria-label="Run again" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}</button>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto">
          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
          {info && (
            <>
              {row(info.integrity_ok, "Database check", info.integrity_ok ? "No damage found (quick_check)." : "The database check reported a problem. Make a backup and contact your dealer.")}
              {row(!!info.sqlcipher_version, "Encryption", info.sqlcipher_version ? `SQLCipher ${info.sqlcipher_version}` : "Not encrypted")}
              {row(info.schema_version === info.latest_schema_version, "Database version", `V${info.schema_version} (this app knows up to V${info.latest_schema_version})`)}
              {row(!!info.last_snapshot, "Last automatic snapshot", info.last_snapshot ? new Date(info.last_snapshot).toLocaleString() : "None yet")}
              {row(true, "Data", `${info.products} products · ${info.sales} sales · ${info.customers} customers · ${(info.db_size_bytes / 1024 / 1024).toFixed(1)} MB`)}
              {row(true, "Database file", info.db_path)}
            </>
          )}
          {printers && row(printers.length > 0 && printers[0] !== "Default Printer", "Printers", printers.join(", ") || "None found")}

          <div className="mt-4">
            <div className="text-sm font-semibold flex items-center gap-2 mb-1"><Barcode className="w-4 h-4" /> Scanner test</div>
            <p className="text-xs text-slate-500 mb-2">Click the box and scan any barcode. It should appear below, followed by Enter.</p>
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && scan.trim()) {
                  setScans((s) => [scan.trim(), ...s].slice(0, 5));
                  setScan("");
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono text-sm"
            />
            {scans.map((s, i) => (
              <div key={i} className="text-xs font-mono mt-1 flex items-center gap-1"><Printer className="w-3 h-3 opacity-0" />{s} ({s.length} digits)</div>
            ))}
          </div>
          {info && <p className="text-xs text-slate-400 mt-4">Next POS {info.app_version}</p>}
        </div>
      </div>
    </div>
  );
}
