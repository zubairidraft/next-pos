import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, Play, Save, Search, Tag } from "lucide-react";
import { api, errorText, formatPkr, formatQty, InventoryBalanceView, StockCountSession } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { useRemoteScan } from "../lib/remoteScan";
import { BarcodeLabelsModal } from "./BarcodeLabelsModal";

/**
 * Physical stock count. Counts are saved as you go; applying the count posts
 * the differences as stock adjustments (Owner/Manager only).
 */
export function StockAuditView() {
  const toast = useToast();
  const { can } = useSession();
  const [session, setSession] = useState<StockCountSession | null | undefined>(undefined);
  const [stock, setStock] = useState<InventoryBalanceView[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);

  const load = async () => {
    try {
      const [s, st] = await Promise.all([api.currentStockCount(), api.stockList()]);
      setSession(s);
      setStock(st);
      const c: Record<string, string> = {};
      s?.lines.forEach((l) => (c[l.variant_id] = String(l.counted_qty_milli / 1000)));
      setCounts(c);
    } catch (e) {
      setSession(null);
      toast.error(errorText(e));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saved = useMemo(() => new Map(session?.lines.map((l) => [l.variant_id, l]) || []), [session]);
  const shown = stock.filter((r) => !q || r.product_name.toLowerCase().includes(q.toLowerCase()) || r.sku.toLowerCase().includes(q.toLowerCase()) || (r.barcode || "") === q);
  const unsaved = Object.entries(counts).filter(([v, c]) => c !== "" && (!saved.has(v) || saved.get(v)!.counted_qty_milli !== Math.round(parseFloat(c) * 1000)));
  const varianceValue = session?.lines.reduce((s, l) => s + l.variance_value_paisa, 0) || 0;

  // A paired phone's camera finds the product in the list, like a USB scanner.
  useRemoteScan((scanned) => setQ(scanned), !!session);

  const start = async () => {
    try {
      await api.startStockCount(null);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const saveCounts = async () => {
    if (!session || unsaved.length === 0) return;
    setBusy(true);
    try {
      await api.recordStockCounts(
        session.id,
        unsaved.map(([variant_id, c]) => ({ variant_id, counted_qty_milli: Math.round((parseFloat(c) || 0) * 1000) }))
      );
      toast.success(`${unsaved.length} counts saved`);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!session) return;
    if (unsaved.length > 0) return toast.error("Save the counts first.");
    const ok = await toast.confirm(
      `Apply stock count ${session.doc_no}?`,
      `${session.lines.length} items counted. Stock will be changed to the counted quantities (difference at cost: ${formatPkr(varianceValue)}). Items you did not count are not changed.`,
      { confirmLabel: "Apply count" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.finalizeStockCount(session.id);
      toast.success("Stock count applied");
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-amber-500" /> Stock count</h2>
          <p className="text-xs text-slate-500">{session ? `Count ${session.doc_no} started ${new Date(session.started_at).toLocaleString()}` : "Count the shelves and correct the stock."}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLabelsOpen(true)} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1"><Tag className="w-4 h-4" /> Shelf labels</button>
          {session && (
            <>
              <button onClick={saveCounts} disabled={busy || unsaved.length === 0} className="px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1">
                <Save className="w-4 h-4" /> Save counts{unsaved.length ? ` (${unsaved.length})` : ""}
              </button>
              {can("PriceEdit") && (
                <button onClick={apply} disabled={busy || session.lines.length === 0} className="px-3 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Apply count
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {session === undefined && <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />}
      {session === null && (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500 mb-4">No count is open.</p>
          <button onClick={start} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2"><Play className="w-4 h-4" /> Start a stock count</button>
        </div>
      )}

      {session && (
        <>
          {!can("PriceEdit") && <p className="text-xs text-slate-500">Enter and save the counts. An Owner or Manager applies the count.</p>}
          <div className="relative sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan barcode or search" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
          </div>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
                <tr className="text-left">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">System stock</th>
                  <th className="px-3 py-2">Counted</th>
                  <th className="px-3 py-2 text-right">Difference</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No products found.</td></tr>}
                {shown.map((r) => {
                  const line = saved.get(r.variant_id);
                  const typed = counts[r.variant_id];
                  const diff = typed !== undefined && typed !== "" ? Math.round(parseFloat(typed) * 1000) - r.on_hand_milli : null;
                  return (
                    <tr key={r.variant_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2"><span className="font-semibold">{r.product_name}</span><span className="text-xs text-slate-400"> · {r.sku}</span></td>
                      <td className="px-3 py-2 text-right">{formatQty(r.on_hand_milli, r.unit_code)}</td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={typed ?? ""}
                          onChange={(e) => setCounts({ ...counts, [r.variant_id]: e.target.value.replace(/[^\d.]/g, "") })}
                          className={`w-24 px-2 py-1 rounded-lg border bg-white dark:bg-slate-800 ${line ? "border-emerald-400" : "border-slate-300 dark:border-slate-600"}`}
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${diff ? (diff < 0 ? "text-rose-600" : "text-emerald-600") : ""}`}>{diff === null ? "" : formatQty(diff)}</td>
                      <td className="px-3 py-2 text-right">{line ? formatPkr(line.variance_value_paisa) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Saved counts have a green box. Difference at cost so far: <b>{formatPkr(varianceValue)}</b>.</p>
        </>
      )}
      <BarcodeLabelsModal isOpen={labelsOpen} onClose={() => setLabelsOpen(false)} />
    </div>
  );
}
