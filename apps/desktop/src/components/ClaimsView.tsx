import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, ShieldCheck } from "lucide-react";
import { api, Claim, ClaimKind, ClaimStatus, errorText, formatPkr, formatQty, ProductRow } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { ItemSearch, ItemSearchHandle, numeric, PartyLite, PartyTypeAhead } from "./entry/keyboard";

const KINDS: { id: ClaimKind; label: string; help: string; key: string }[] = [
  { id: "warranty", label: "Warranty", help: "Customer's item sent to the company for repair / replacement", key: "1" },
  { id: "damaged", label: "Damaged", help: "Damaged stock claimed from the company / vendor", key: "2" },
  { id: "expired", label: "Expired", help: "Expired stock claimed from the company / vendor", key: "3" },
];

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  open: "Open",
  sent: "Sent to company",
  replaced: "Replaced",
  credited: "Credit received",
  rejected: "Rejected",
  closed: "Closed",
};

const NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  open: ["sent", "replaced", "credited", "rejected"],
  sent: ["replaced", "credited", "rejected"],
  replaced: ["closed"],
  credited: ["closed"],
  rejected: ["closed"],
  closed: [],
};

const box = "w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

/** Warranty and damaged / expired claims: make them and follow them to the end. */
export function ClaimsView() {
  const toast = useToast();
  const { can } = useSession();
  const [filter, setFilter] = useState<"open" | "done" | null>("open");
  const [list, setList] = useState<Claim[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setList(null);
    api.listClaims(filter).then(setList).catch((e) => (setList([]), toast.error(errorText(e))));
  }, [filter, toast]);
  useEffect(load, [load]);

  const move = async (c: Claim, status: ClaimStatus) => {
    let credit: number | null = null;
    if (status === "credited") {
      const v = await toast.prompt(`Credit from ${c.vendor_name || "vendor"}`, "Amount credited (Rs)", { type: "number", initial: String(c.value_paisa / 100), message: "This lowers what you owe the vendor." });
      if (v === null) return;
      credit = Math.round((parseFloat(v) || 0) * 100);
    }
    const note = await toast.prompt(`${c.doc_no}: ${STATUS_LABEL[status]}`, "Note (optional)");
    if (note === null) return;
    try {
      await api.updateClaim(c.id, status, note.trim() || null, credit);
      toast.success(`${c.doc_no}: ${STATUS_LABEL[status]}`);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
          {([["open", "Open"], ["done", "Finished"], [null, "All"]] as const).map(([f, l]) => (
            <button key={l} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg ${filter === f ? "bg-white dark:bg-slate-900 shadow" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> New claim</button>
      </div>
      {creating && <NewClaim onDone={() => (setCreating(false), load())} onCancel={() => setCreating(false)} />}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
            <tr className="text-left">
              <th className="px-3 py-2">Claim</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Customer / company</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2">Next step</th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={7} className="py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>}
            {list?.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No claims here.</td></tr>}
            {list?.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold">{c.doc_no}</div>
                  <div className="text-[11px] text-slate-400">{new Date(c.created_at).toLocaleDateString()}</div>
                </td>
                <td className="px-3 py-2 capitalize">{c.kind}</td>
                <td className="px-3 py-2">
                  <div>{c.product_name} × {formatQty(c.qty_milli, c.unit_code)}</div>
                  {(c.serial || c.sale_doc) && <div className="text-[11px] text-slate-400">{c.serial ? `Serial ${c.serial}` : ""}{c.serial && c.sale_doc ? " · " : ""}{c.sale_doc ? `Invoice ${c.sale_doc}` : ""}</div>}
                  {c.notes && <div className="text-[11px] text-slate-500 whitespace-pre-line">{c.notes}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{[c.customer_name, c.vendor_name].filter(Boolean).join(" → ") || "—"}</td>
                <td className="px-3 py-2 text-xs font-semibold">{STATUS_LABEL[c.status]}{c.credit_paisa > 0 ? ` · ${formatPkr(c.credit_paisa)}` : ""}</td>
                <td className="px-3 py-2 text-right">{c.value_paisa ? formatPkr(c.value_paisa) : "—"}</td>
                <td className="px-3 py-2">
                  {can("InventoryAdjust") && (
                    <div className="flex flex-wrap gap-1">
                      {NEXT[c.status]
                        .filter((s) => !(s === "credited" && c.kind === "warranty"))
                        .map((s) => (
                          <button key={s} onClick={() => move(c, s)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">{STATUS_LABEL[s]}</button>
                        ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Damaged / expired: the stock comes out when you make the claim. "Replaced" puts it back in stock; "Credit received" lowers what you owe the vendor; "Rejected" is a loss.
        Warranty: the customer's item, stock does not change.
      </p>
    </div>
  );
}

function NewClaim({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const { can } = useSession();
  const [kind, setKind] = useState<ClaimKind>("warranty");
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState("1");
  const [customer, setCustomer] = useState<PartyLite | null>(null);
  const [vendor, setVendor] = useState<PartyLite | null>(null);
  const [serial, setSerial] = useState("");
  const [saleDoc, setSaleDoc] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const itemRef = useRef<ItemSearchHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const searchItems = useCallback((q: string) => api.searchProducts(q, 12).then((r) => r.filter((p) => !p.is_service)), []);
  const searchCustomers = useCallback((q: string) => api.listCustomers(q), []);
  const searchVendors = useCallback((q: string) => api.listVendors(q), []);
  const choose = (p: ProductRow) => {
    setProduct(p);
    setTimeout(() => qtyRef.current?.focus(), 0);
  };

  const save = async () => {
    if (!product) return toast.error("Choose the product.");
    const milli = Math.round((parseFloat(qty) || 0) * 1000);
    if (milli <= 0) return toast.error("Enter the quantity.");
    if (kind !== "warranty" && !can("InventoryAdjust")) return toast.error("Only an Owner or Manager can claim damaged / expired stock.");
    setBusy(true);
    try {
      const c = await api.createClaim({
        kind,
        variant_id: product.variant_id,
        qty_milli: milli,
        customer_id: kind === "warranty" ? customer?.id ?? null : null,
        vendor_id: vendor?.id ?? null,
        serial: serial.trim() || null,
        sale_doc: saleDoc.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Claim ${c.doc_no} made${kind !== "warranty" ? ". Stock reduced." : "."}`);
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "F9") {
          e.preventDefault();
          save();
        }
        if (e.altKey && ["1", "2", "3"].includes(e.key)) setKind(KINDS[Number(e.key) - 1].id);
      }}
    >
      <div className="font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> New claim</div>
      <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Claim type">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={`text-left p-2.5 rounded-xl border text-xs ${kind === k.id ? "border-emerald-500 bg-white dark:bg-slate-900" : "border-slate-300 dark:border-slate-700"}`}>
            <div className="font-bold">{k.label} <span className="text-slate-400 font-normal">(Alt+{k.key})</span></div>
            <div className="text-[11px] text-slate-500">{k.help}</div>
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-[1fr_8rem] gap-3 items-end relative z-20">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Product {product && <b className="text-slate-800 dark:text-slate-100">· {product.name} (stock {formatQty(product.on_hand_milli, product.base_unit_code)})</b>}</span>
          <ItemSearch ref={itemRef} search={searchItems} onCode={async (code) => {
            const f = (await api.searchProducts(code, 5)).find((p) => p.barcode === code || p.sku === code);
            if (f) choose(f);
            return !!f;
          }} onPick={choose} placeholder="Scan or type the product" />
        </div>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Qty</span>
          <input ref={qtyRef} aria-label="Claim quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(numeric(e.target.value))} className={box} />
        </label>
      </div>
      <div className="grid md:grid-cols-2 gap-3 relative z-10">
        {kind === "warranty" && <PartyTypeAhead label="Customer" value={customer} onChange={setCustomer} search={searchCustomers} emptyText="Type customer name" balanceLabel="due" />}
        <PartyTypeAhead label="Company / vendor" value={vendor} onChange={setVendor} search={searchVendors} emptyText="Type vendor name" balanceLabel="we owe" />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <input aria-label="Serial / IMEI" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial / IMEI (optional)" className={box} />
        <input aria-label="Sale invoice no." value={saleDoc} onChange={(e) => setSaleDoc(e.target.value)} placeholder="Sale invoice no. (optional)" className={box} />
        <input aria-label="Problem / notes" value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} placeholder="Problem / notes — Enter saves" className={box} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">Cancel (Esc)</button>
        <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save claim (F9)</button>
      </div>
    </div>
  );
}
