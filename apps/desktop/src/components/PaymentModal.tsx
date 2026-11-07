import { useMemo, useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, Plus, Smartphone, Trash2, Wallet, X } from "lucide-react";
import { CustomerSummary, formatPkr, PaymentTenderInput, TenderMethod } from "../lib/api";

const METHODS: { id: TenderMethod; label: string; icon: React.ReactNode; needsRef?: boolean }[] = [
  { id: "cash", label: "Cash", icon: <Banknote className="w-4 h-4" /> },
  { id: "card", label: "Card", icon: <CreditCard className="w-4 h-4" />, needsRef: true },
  { id: "jazzcash", label: "JazzCash", icon: <Smartphone className="w-4 h-4" />, needsRef: true },
  { id: "easypaisa", label: "Easypaisa", icon: <Smartphone className="w-4 h-4" />, needsRef: true },
  { id: "raast", label: "Raast", icon: <Smartphone className="w-4 h-4" />, needsRef: true },
  { id: "bank", label: "Bank transfer", icon: <Landmark className="w-4 h-4" />, needsRef: true },
  { id: "cheque", label: "Cheque", icon: <Landmark className="w-4 h-4" />, needsRef: true },
  { id: "credit", label: "Khata (credit)", icon: <Wallet className="w-4 h-4" /> },
];

const toPaisa = (s: string) => Math.round((parseFloat(s) || 0) * 100);

/**
 * Collects one or more tenders. Totals come from the backend quote; the backend
 * checks them again when the sale is posted.
 */
export function PaymentModal({
  totalPaisa,
  customer,
  busy,
  onPay,
  onClose,
}: {
  totalPaisa: number;
  customer: CustomerSummary | null;
  busy: boolean;
  onPay: (tenders: PaymentTenderInput[]) => void;
  onClose: () => void;
}) {
  const [tenders, setTenders] = useState<PaymentTenderInput[]>([]);
  const [method, setMethod] = useState<TenderMethod>("cash");
  const [amount, setAmount] = useState((totalPaisa / 100).toString());
  const [reference, setReference] = useState("");

  const paid = tenders.reduce((s, t) => s + t.amount_paisa, 0);
  const remaining = Math.max(0, totalPaisa - paid);
  const cashPaid = tenders.filter((t) => t.method === "cash").reduce((s, t) => s + t.amount_paisa, 0);
  const nonCash = paid - cashPaid;
  const change = Math.max(0, paid - totalPaisa);
  const creditAvailable = customer ? Math.max(0, customer.credit_limit_paisa - customer.balance_paisa) : 0;

  const problem = useMemo(() => {
    if (paid < totalPaisa) return `Still to pay: ${formatPkr(remaining)}`;
    if (nonCash > totalPaisa) return "Card, digital and khata can't be more than the bill. Only cash can give change.";
    if (tenders.some((t) => t.method === "credit") && !customer) return "Pick a customer for a khata sale.";
    return null;
  }, [paid, totalPaisa, remaining, nonCash, tenders, customer]);

  const add = (m: TenderMethod = method, amt = toPaisa(amount)) => {
    if (amt <= 0) return;
    const def = METHODS.find((x) => x.id === m)!;
    setTenders((t) => [...t, { method: m, amount_paisa: amt, reference: def.needsRef && reference.trim() ? reference.trim() : null }]);
    setReference("");
    const left = Math.max(0, totalPaisa - paid - amt);
    setAmount(left ? (left / 100).toString() : "");
  };

  const quickCash = [totalPaisa, ...[500, 1000, 5000].map((n) => n * 100).filter((v) => v > totalPaisa)].slice(0, 4);
  const sel = METHODS.find((m) => m.id === method)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Payment</h2>
            <p className="text-xs text-slate-500">Bill total {formatPkr(totalPaisa)}{customer ? ` · ${customer.name}` : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 grid md:grid-cols-2 gap-5 overflow-y-auto">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  disabled={m.id === "credit" && !customer}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold disabled:opacity-40 ${
                    method === m.id ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            {method === "credit" && customer && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Balance {formatPkr(customer.balance_paisa)} · limit {formatPkr(customer.credit_limit_paisa)} · available {formatPkr(creditAvailable)}. Going over needs a Manager PIN.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
              className="space-y-2"
            >
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Amount (Rs)
                <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-lg font-bold text-slate-900 dark:text-white" />
              </label>
              {sel.needsRef && (
                <input placeholder="Reference / last 4 digits (optional)" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              )}
              <button className="w-full py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-1">
                <Plus className="w-4 h-4" /> Add {sel.label}
              </button>
            </form>
            {method === "cash" && (
              <div className="flex flex-wrap gap-2">
                {quickCash.map((v) => (
                  <button key={v} onClick={() => add("cash", v)} className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                    {v === totalPaisa ? "Exact " : ""}{formatPkr(v)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">Payments added</h3>
            <div className="flex-1 space-y-1.5 min-h-[80px]">
              {tenders.length === 0 && <p className="text-xs text-slate-400">Nothing yet. Add a payment on the left.</p>}
              {tenders.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm">
                  <span className="font-semibold capitalize">{METHODS.find((m) => m.id === t.method)?.label}{t.reference ? <span className="text-xs text-slate-400"> · {t.reference}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    {formatPkr(t.amount_paisa)}
                    <button aria-label="Remove payment" onClick={() => setTenders((x) => x.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-rose-500" /></button>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-sm">
              <div className="flex justify-between"><span>Paid</span><b>{formatPkr(paid)}</b></div>
              <div className="flex justify-between text-lg"><span>Change</span><b className="text-emerald-600">{formatPkr(change)}</b></div>
            </div>
            {problem && <p className="text-xs font-semibold text-amber-600 mt-2">{problem}</p>}
            <button
              disabled={!!problem || busy}
              onClick={() => onPay(tenders)}
              className="mt-3 w-full py-3 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Complete sale
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
