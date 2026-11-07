import { useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, Loader2, Printer, X } from "lucide-react";
import { api, errorText, formatPkr, printerPrefs, ZReportData } from "../lib/api";
import { useToast } from "../lib/toast";

const NOTES = [5000, 1000, 500, 100, 50, 20, 10] as const;

/**
 * Blind close: the cashier counts the drawer first. The expected amount and the
 * difference are shown only after the count is saved.
 */
export function ShiftCloseModal({ onClose, onClosed }: { onClose: () => void; onClosed: () => void }) {
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [coins, setCoins] = useState(0);
  const [busy, setBusy] = useState(false);
  const [z, setZ] = useState<ZReportData | null>(null);
  const [printing, setPrinting] = useState(false);

  const counted = NOTES.reduce((s, n) => s + (counts[n] || 0) * n * 100, 0) + Math.round(coins * 100);

  const close = async () => {
    if (!(await toast.confirm("Close the shift?", `Counted cash: ${formatPkr(counted)}. This cannot be undone.`, { confirmLabel: "Close shift" }))) return;
    setBusy(true);
    try {
      const r = await api.closeShift(counted);
      setZ(r);
      onClosed();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const printZ = async () => {
    const p = printerPrefs();
    setPrinting(true);
    try {
      await api.printZReport(p.name, p.width);
      toast.success("Z report printed");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPrinting(false);
    }
  };

  const row = (label: string, v: number, strong = false) => (
    <div className={`flex justify-between py-1 ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{formatPkr(v)}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Banknote className="w-5 h-5 text-emerald-500" /> {z ? "Z report" : "Close shift: count the drawer"}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        {!z ? (
          <div className="p-5 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NOTES.map((n) => (
                <label key={n} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Rs {n} ×
                  <input
                    inputMode="numeric"
                    value={counts[n] || ""}
                    onChange={(e) => setCounts({ ...counts, [n]: parseInt(e.target.value.replace(/\D/g, "")) || 0 })}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Coins (Rs)
                <input
                  inputMode="decimal"
                  value={coins || ""}
                  onChange={(e) => setCoins(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </label>
            </div>
            <div className="mt-5 flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <span className="text-sm font-semibold">Counted cash</span>
              <span className="text-xl font-bold">{formatPkr(counted)}</span>
            </div>
            <button onClick={close} disabled={busy} className="mt-4 w-full py-3 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save count and close shift
            </button>
          </div>
        ) : (
          <div className="p-5 overflow-y-auto text-sm">
            <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 font-semibold ${z.variance_paisa === 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>
              {z.variance_paisa === 0 ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              {z.variance_paisa === 0 ? "Drawer matches." : `Difference: ${formatPkr(z.variance_paisa)} (${z.variance_paisa > 0 ? "extra" : "short"})`}
            </div>
            {row("Opening cash", z.opening_float_paisa)}
            {row(`Sales (${z.sales_count})`, z.gross_sales_paisa)}
            {row("Discounts", z.discounts_paisa)}
            {row("Cash received", z.tender_cash_paisa)}
            {row("Card", z.tender_card_paisa)}
            {row("Digital / bank", z.tender_digital_paisa)}
            {row("Khata (credit)", z.tender_khata_paisa)}
            {row("Refunds", z.refunds_paisa)}
            {row("Cash drops", z.cash_drops_paisa)}
            {row("Expected cash", z.expected_cash_paisa, true)}
            {row("Counted cash", z.counted_cash_paisa, true)}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={printZ} disabled={printing} className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 dark:bg-slate-700 text-white flex items-center gap-1">
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Print Z report
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
