import { useState, useEffect } from "react";
import { Loader2, RotateCcw, Search, X } from "lucide-react";
import { api, ApprovalInput, errorText, formatPkr, formatQty, RefundMethod, ReturnableSale } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { ApprovalDialog } from "./ApprovalDialog";

/** Customer return against a real invoice. Refund amounts are worked out by the backend. */
export function SaleReturnsModal({
  onClose,
  onDone,
  initialDocNo,
}: {
  onClose: () => void;
  onDone: () => void;
  initialDocNo?: string;
}) {
  const toast = useToast();
  const { can } = useSession();
  const [docNo, setDocNo] = useState(initialDocNo || "");
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [askApproval, setAskApproval] = useState(false);

  useEffect(() => {
    if (initialDocNo) {
      setBusy(true);
      api
        .findSaleForReturn(initialDocNo.trim())
        .then((s) => {
          setSale(s);
          setQty({});
          setDamaged({});
          setMethod(s.customer_name ? "credit" : "cash");
        })
        .catch((err) => {
          setSale(null);
          toast.error(errorText(err));
        })
        .finally(() => setBusy(false));
    }
  }, [initialDocNo]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !askApproval) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [askApproval, onClose]);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.findSaleForReturn(docNo.trim());
      setSale(s);
      setQty({});
      setDamaged({});
      setMethod(s.customer_name ? "credit" : "cash");
    } catch (err) {
      setSale(null);
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const lines = sale
    ? sale.lines
        .map((l) => ({ l, q: Math.round((parseFloat(qty[l.sale_line_id] || "0") || 0) * 1000) }))
        .filter((x) => x.q > 0)
    : [];
  const tooMuch = lines.find((x) => x.q > x.l.qty_milli - x.l.returned_qty_milli);

  const submit = async (approval: ApprovalInput | null) => {
    if (!sale) return;
    setBusy(true);
    try {
      const r = await api.postReturn({
        sale_id: sale.id,
        lines: lines.map((x) => ({ sale_line_id: x.l.sale_line_id, qty_milli: x.q, damaged: !!damaged[x.l.sale_line_id] })),
        reason: reason || null,
        refund_method: method,
        approval,
      });
      toast.success(`Return ${r.doc_no} saved. Refund ${formatPkr(r.refund_paisa)}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
      setAskApproval(false);
    }
  };

  // Cashiers need an Owner/Manager PIN; managers approve their own returns.
  const start = () => (can("SalesVoid") ? submit(null) : setAskApproval(true));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><RotateCcw className="w-5 h-5 text-amber-500" /> Customer return</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          <form onSubmit={find} className="flex gap-2">
            <input autoFocus value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="Invoice number, e.g. INV-000123" className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            <button disabled={!docNo.trim() || busy} className="px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-semibold flex items-center gap-1"><Search className="w-4 h-4" /> Find</button>
          </form>

          {sale && (
            <>
              <p className="text-xs text-slate-500 mt-3">
                {sale.doc_no} · {new Date(sale.created_at).toLocaleString()} · {formatPkr(sale.total_paisa)}{sale.customer_name ? ` · ${sale.customer_name}` : ""}
              </p>
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1.5">Item</th>
                    <th>Sold</th>
                    <th>Already returned</th>
                    <th>Return qty</th>
                    <th>Damaged</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((l) => {
                    const left = l.qty_milli - l.returned_qty_milli;
                    return (
                      <tr key={l.sale_line_id} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="py-1.5">{l.name}<div className="text-xs text-slate-400">{formatPkr(l.unit_price_paisa)} / {l.unit_code}</div></td>
                        <td>{formatQty(l.qty_milli, l.unit_code)}</td>
                        <td>{formatQty(l.returned_qty_milli)}</td>
                        <td>
                          <input
                            disabled={left <= 0}
                            inputMode="decimal"
                            value={qty[l.sale_line_id] || ""}
                            onChange={(e) => setQty({ ...qty, [l.sale_line_id]: e.target.value.replace(/[^\d.]/g, "") })}
                            className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                          />
                        </td>
                        <td><input type="checkbox" checked={!!damaged[l.sale_line_id]} onChange={(e) => setDamaged({ ...damaged, [l.sale_line_id]: e.target.checked })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tooMuch && <p className="text-xs text-rose-600 mt-2">{tooMuch.l.name}: only {formatQty(tooMuch.l.qty_milli - tooMuch.l.returned_qty_milli, tooMuch.l.unit_code)} can still be returned.</p>}
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Refund as
                  <select value={method} onChange={(e) => setMethod(e.target.value as RefundMethod)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
                    <option value="cash">Cash from drawer</option>
                    {sale.customer_name && <option value="credit">Reduce customer's khata</option>}
                    <option value="card">Card</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">Easypaisa</option>
                    <option value="raast">Raast</option>
                    <option value="bank">Bank transfer</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Reason
                  <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-2">The refund is what the customer actually paid for these items (after any bill discount). It is worked out when you save.</p>
              <button onClick={start} disabled={busy || lines.length === 0 || !!tooMuch} className="mt-4 w-full py-3 rounded-xl bg-amber-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save return
              </button>
            </>
          )}
        </div>
      </div>
      {askApproval && (
        <ApprovalDialog title="Manager approval" reason="Returns need an Owner or Manager PIN." onApprove={(a) => submit(a)} onCancel={() => setAskApproval(false)} />
      )}
    </div>
  );
}
