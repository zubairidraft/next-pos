import { useEffect, useState } from "react";
import { BookOpen, FileText, Loader2, MessageCircle, Plus, Printer, Search, UserPlus, Wallet, X } from "lucide-react";
import { AgingReportBucket, api, CustomerSummary, errorText, formatPkr, isBrowserTest, KhataStatement } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { A4_PAGE, printElement } from "../lib/print";

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

/** Customer and vendor khata: balances, statements, payments received, WhatsApp reminders. */
export function KhataView() {
  const toast = useToast();
  const { can } = useSession();
  const [tab, setTab] = useState<"customer" | "vendor">("customer");
  const [query, setQuery] = useState("");
  const [parties, setParties] = useState<CustomerSummary[] | null>(null);
  const [aging, setAging] = useState<AgingReportBucket[]>([]);
  const [payFor, setPayFor] = useState<CustomerSummary | null>(null);
  const [statementFor, setStatementFor] = useState<CustomerSummary | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () => {
    setParties(null);
    (tab === "customer" ? api.listCustomers(query) : api.listVendors(query))
      .then(setParties)
      .catch((e) => {
        setParties([]);
        toast.error(errorText(e));
      });
  };

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query]);

  useEffect(() => {
    if (can("ReportsView")) api.aging(tab).then(setAging).catch(() => setAging([]));
    else setAging([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const total = (parties || []).reduce((s, p) => s + p.balance_paisa, 0);

  const whatsapp = async (p: CustomerSummary) => {
    try {
      const url = await api.openWhatsappReminder(p.id);
      // Browser test mode: the desktop app opens the link itself.
      if (isBrowserTest && url.startsWith("https://wa.me/")) window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-emerald-500" /> Khata</h2>
          <p className="text-xs text-slate-500">Who owes the shop, and whom the shop owes.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
            {(["customer", "vendor"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg ${tab === t ? "bg-white dark:bg-slate-900 shadow" : "text-slate-500"}`}>
                {t === "customer" ? "Customers" : "Vendors"}
              </button>
            ))}
          </div>
          {(tab === "customer" ? can("SalesCreate") : can("PurchaseEntry")) && (
            <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> Add {tab}
            </button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or phone" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
        </div>
        <div className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
          {tab === "customer" ? "Customers owe" : "Shop owes vendors"} <b>{formatPkr(Math.abs(total))}</b>
        </div>
      </div>

      {aging.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {aging.map((b) => (
            <div key={b.bucket_name} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div className="text-slate-500">{b.bucket_name}</div>
              <div className="text-sm font-bold">{formatPkr(b.amount_paisa)}</div>
              <div className="text-slate-400">{b.invoice_count} invoices</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
            <tr className="text-left">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2 text-right">Credit limit</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {parties === null && (
              <tr><td colSpan={5} className="py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>
            )}
            {parties?.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-500">No {tab}s yet.</td></tr>
            )}
            {parties?.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold">{p.name}{p.name_ur && <span className="block text-xs font-normal text-slate-400" dir="rtl">{p.name_ur}</span>}</td>
                <td className="px-3 py-2 text-slate-500">{p.phone || "—"}</td>
                <td className="px-3 py-2 text-right">{p.credit_limit_paisa ? formatPkr(p.credit_limit_paisa) : "—"}</td>
                <td className={`px-3 py-2 text-right font-bold ${p.balance_paisa > 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatPkr(p.balance_paisa)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setStatementFor(p)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Statement</button>
                    {tab === "customer" && (
                      <>
                        <button onClick={() => setPayFor(p)} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Receive</button>
                        {p.phone && p.balance_paisa > 0 && (
                          <button onClick={() => whatsapp(p)} title="Send a WhatsApp reminder" className="px-2 py-1 rounded-lg bg-green-600 text-white text-xs font-semibold"><MessageCircle className="w-3.5 h-3.5" /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tab === "vendor" && <p className="text-xs text-slate-500">Vendor balances come from purchase invoices. Recording payments to vendors is not available yet.</p>}

      {payFor && <ReceivePayment party={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); }} />}
      {statementFor && <Statement party={statementFor} onClose={() => setStatementFor(null)} />}
      {adding && <AddParty type={tab} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full ${wide ? "max-w-3xl" : "max-w-md"} shadow-2xl max-h-[92vh] flex flex-col`}>
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const field = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

function ReceivePayment({ party, onClose, onDone }: { party: CustomerSummary; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(party.balance_paisa > 0 ? String(party.balance_paisa / 100) : "");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.receivePayment(party.id, Math.round((parseFloat(amount) || 0) * 100), method, reference || null);
      const n = r.allocations.length;
      toast.success(`Received ${formatPkr(r.total_payment_paisa)}. Settled ${n} invoice${n === 1 ? "" : "s"}. New balance ${formatPkr(r.new_party_balance_paisa)}.`);
      onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Receive payment · ${party.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm">Current balance: <b>{formatPkr(party.balance_paisa)}</b>. The payment settles the oldest invoices first.</p>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Amount (Rs)<input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={field + " text-lg font-bold"} /></label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
            <option value="cash">Cash</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
            <option value="raast">Raast</option>
            <option value="bank">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="card">Card</option>
          </select>
        </label>
        {method !== "cash" && <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Reference<input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></label>}
        <button disabled={busy || !(parseFloat(amount) > 0)} className="w-full py-2.5 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save payment
        </button>
      </form>
    </Modal>
  );
}

function Statement({ party, onClose }: { party: CustomerSummary; onClose: () => void }) {
  const toast = useToast();
  const [from, setFrom] = useState(monthsAgo(3));
  const [to, setTo] = useState(today());
  const [st, setSt] = useState<KhataStatement | null>(null);

  useEffect(() => {
    setSt(null);
    // Whole local (Pakistan) days, sent as exact UTC instants.
    const start = new Date(`${from}T00:00:00`).toISOString();
    const end = new Date(`${to}T23:59:59.999`).toISOString();
    api.khataStatement(party.id, start, end).then(setSt).catch((e) => toast.error(errorText(e)));
  }, [party.id, from, to, toast]);

  return (
    <Modal title={`Statement · ${party.name}`} onClose={onClose} wide>
      <div className="flex flex-wrap gap-3 items-end mb-3">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
        <button
          onClick={() => {
            const el = document.getElementById("khata-statement-print");
            if (el) printElement(el, { ...A4_PAGE, title: `Statement ${party.name}` });
          }}
          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>
      {!st ? (
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
      ) : (
        <div id="khata-statement-print">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="text-left border-b border-slate-200 dark:border-slate-800">
                <th className="py-1.5">Date</th>
                <th>Document</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <td className="py-1.5" colSpan={4}>Opening balance</td>
                <td className="text-right">{formatPkr(st.opening_balance_paisa)}</td>
              </tr>
              {st.entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-1.5">{new Date(e.occurred_at).toLocaleDateString()}</td>
                  <td>{e.source_doc}<span className="text-xs text-slate-400"> · {e.entry_type}</span></td>
                  <td className="text-right">{e.debit_paisa ? formatPkr(e.debit_paisa) : ""}</td>
                  <td className="text-right">{e.credit_paisa ? formatPkr(e.credit_paisa) : ""}</td>
                  <td className="text-right font-semibold">{formatPkr(e.balance_paisa)}</td>
                </tr>
              ))}
              {st.entries.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-slate-500">No entries in these dates.</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-end gap-6 mt-3 text-sm">
            <span>Debit {formatPkr(st.total_debit_paisa)}</span>
            <span>Credit {formatPkr(st.total_credit_paisa)}</span>
            <b>Closing {formatPkr(st.closing_balance_paisa)}</b>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddParty({ type, onClose, onDone }: { type: "customer" | "vendor"; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [f, setF] = useState({ name: "", name_ur: "", phone: "", cnic: "", ntn: "", limit: "", opening: "", wholesale: false });
  const [busy, setBusy] = useState(false);
  const money = can("PriceEdit");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createParty({
        party_type: type,
        name: f.name.trim(),
        name_ur: f.name_ur || null,
        phone: f.phone || null,
        cnic: f.cnic || null,
        ntn: f.ntn || null,
        credit_limit_paisa: money ? Math.round((parseFloat(f.limit) || 0) * 100) : 0,
        opening_balance_paisa: money ? Math.round((parseFloat(f.opening) || 0) * 100) : 0,
        price_list_id: type === "customer" && f.wholesale ? "wholesale" : null,
      });
      toast.success(`${f.name} added`);
      onDone();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Add ${type}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 col-span-2">Name *<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Urdu name<input dir="rtl" value={f.name_ur} onChange={(e) => setF({ ...f, name_ur: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={field} placeholder="03xx-xxxxxxx" /></label>
          {type === "customer" ? (
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">CNIC<input value={f.cnic} onChange={(e) => setF({ ...f, cnic: e.target.value })} className={field} /></label>
          ) : (
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">NTN<input value={f.ntn} onChange={(e) => setF({ ...f, ntn: e.target.value })} className={field} /></label>
          )}
          {money && type === "customer" && (
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Credit limit (Rs)<input inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} className={field} /></label>
          )}
          {money && (
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Opening balance (Rs)<input inputMode="decimal" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} className={field} /></label>
          )}
        </div>
        {type === "customer" && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={f.wholesale} onChange={(e) => setF({ ...f, wholesale: e.target.checked })} /> Charge wholesale prices
          </label>
        )}
        {!money && <p className="text-xs text-slate-500">Only an Owner or Manager can set a credit limit or opening balance.</p>}
        <button disabled={busy || !f.name.trim()} className="w-full py-2.5 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save
        </button>
      </form>
    </Modal>
  );
}
