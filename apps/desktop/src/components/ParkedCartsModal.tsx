import { useEffect, useState } from "react";
import { Clock, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { api, errorText, formatPkr, ParkedCartSummary } from "../lib/api";
import { useToast } from "../lib/toast";

/** Held carts are saved in the database, so they survive a restart. */
export function ParkedCartsModal({ onRecall, onClose }: { onRecall: (id: string) => void; onClose: () => void }) {
  const toast = useToast();
  const [carts, setCarts] = useState<ParkedCartSummary[] | null>(null);

  const load = () => api.listParked().then(setCarts).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async (c: ParkedCartSummary) => {
    if (!(await toast.confirm(`Delete held cart "${c.cart_name}"?`, undefined, { danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api.deleteParked(c.id);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /> Held carts</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          {carts === null && <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />}
          {carts?.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No held carts.</p>}
          {carts?.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{c.cart_name}</div>
                <div className="text-xs text-slate-500">{c.item_count} items · {formatPkr(c.total_paisa)} · {new Date(c.parked_at).toLocaleTimeString()}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => remove(c)} aria-label="Delete held cart" className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => onRecall(c.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Recall</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
