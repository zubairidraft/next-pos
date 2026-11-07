import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Clock,
  Loader2,
  LogOut,
  Printer,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  api,
  ApprovalInput,
  CashSession,
  CheckoutLineInput,
  CustomerSummary,
  errorText,
  formatPkr,
  formatQty,
  PaymentTenderInput,
  printerPrefs,
  ProductRow,
  Quote,
  ReceiptData,
} from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { useRemoteScan } from "../lib/remoteScan";
import { PaymentModal } from "./PaymentModal";
import { ReceiptModal } from "./ReceiptModal";
import { ParkedCartsModal } from "./ParkedCartsModal";
import { ShiftCloseModal } from "./ShiftCloseModal";
import { SaleReturnsModal } from "./SaleReturnsModal";
import { ApprovalDialog } from "./ApprovalDialog";
import { CellInput, focusCell, ItemSearch, ItemSearchHandle, Key, NumberBox, PartyTypeAhead, TypeAheadHandle } from "./entry/keyboard";

const rupeesToPaisa = (s: string | null) => Math.round((parseFloat(s || "") || 0) * 100);

export function CheckoutView() {
  const toast = useToast();
  const { status, can, refresh } = useSession();

  // ---- shift
  const [shift, setShift] = useState<CashSession | null | undefined>(undefined);
  const [openingCash, setOpeningCash] = useState("");
  const loadShift = useCallback(() => api.activeShift().then(setShift).catch((e) => toast.error(errorText(e))), [toast]);
  useEffect(() => {
    loadShift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- cart (ids and quantities only; every amount comes from the backend quote)
  const [lines, setLines] = useState<CheckoutLineInput[]>([]);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [billDiscount, setBillDiscount] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    if (lines.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(() => {
      api
        .quote(customer?.id ?? null, lines, billDiscount)
        .then((q) => !cancelled && (setQuote(q), setQuoteError(null)))
        .catch((e) => !cancelled && setQuoteError(errorText(e)))
        .finally(() => !cancelled && setQuoting(false));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [lines, customer, billDiscount]);

  const addLine = (variant_id: string, unit_id: string, qty_milli: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variant_id === variant_id && l.unit_id === unit_id && !l.price_override_paisa);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty_milli: next[i].qty_milli + qty_milli };
        return next;
      }
      return [...prev, { variant_id, unit_id, qty_milli, discount_paisa: 0 }];
    });
  };
  const updateLine = (i: number, patch: Partial<CheckoutLineInput>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i));
  const clearCart = () => {
    setLines([]);
    setCustomer(null);
    setBillDiscount(0);
  };

  // ---- item box and grid (keyboard first)
  const itemRef = useRef<ItemSearchHandle>(null);
  const custRef = useRef<TypeAheadHandle>(null);
  const discRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const [cashText, setCashText] = useState("");
  const focusItem = () => setTimeout(() => itemRef.current?.focus(), 0);
  const focusRow = (row: number, col: string) => setTimeout(() => focusCell("pos", row, col), 30);

  /** Add an item; returns the row it is on. */
  const addAndLocate = (variant_id: string, unit_id: string, qty_milli: number) => {
    const i = lines.findIndex((l) => l.variant_id === variant_id && l.unit_id === unit_id && !l.price_override_paisa);
    addLine(variant_id, unit_id, qty_milli);
    return i >= 0 ? i : lines.length;
  };

  // A scanned barcode / SKU: one more of it, stay in the item box for the next scan.
  const onCode = async (q: string) => {
    try {
      const hit = await api.scanCode(q);
      if (!hit) return false;
      addAndLocate(hit.product.variant_id, hit.unit_id, hit.qty_milli);
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return true;
    }
  };
  // Picked by name: go to its quantity.
  const pick = (p: ProductRow) => focusRow(addAndLocate(p.variant_id, p.base_unit_id, 1000), "qty");
  const searchSellable = useCallback((q: string) => api.searchSellable(q, 12), []);

  // A paired phone's camera works like the USB scanner.
  useRemoteScan(async (scanned) => {
    try {
      const hit = await api.scanCode(scanned);
      if (hit) addLine(hit.product.variant_id, hit.unit_id, hit.qty_milli);
      else toast.error(`No product with barcode or SKU "${scanned}"`);
    } catch (e) {
      toast.error(errorText(e));
    }
  });

  // ---- customers
  const searchCustomers = useCallback((q: string) => api.listCustomers(q), []);
  const createCustomer = async (name: string): Promise<CustomerSummary | null> => {
    const phone = await toast.prompt(`New customer: ${name}`, "Phone (for WhatsApp, optional)");
    if (phone === null) return null;
    let limit = 0;
    if (can("PriceEdit")) {
      const l = await toast.prompt(`New customer: ${name}`, "Khata credit limit (Rs, 0 = none)", { type: "number", initial: "0" });
      if (l === null) return null;
      limit = rupeesToPaisa(l);
    }
    try {
      const c = await api.createParty({ party_type: "customer", name, phone: phone.trim() || null, credit_limit_paisa: limit });
      toast.success(`Customer ${c.name} added`);
      return c;
    } catch (e) {
      toast.error(errorText(e));
      return null;
    }
  };

  // ---- modals and posting
  const [payOpen, setPayOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [approvalFor, setApprovalFor] = useState<null | { reason: string; tenders: PaymentTenderInput[] }>(null);

  const postSale = async (tenders: PaymentTenderInput[], approval: ApprovalInput | null = null) => {
    setPosting(true);
    try {
      const r = await api.checkout({ customer_id: customer?.id ?? null, lines, global_discount_paisa: billDiscount, tenders, approval });
      setPayOpen(false);
      setApprovalFor(null);
      setReceipt(r);
      setLastReceipt(r);
      clearCart();
      setCashText("");
      const p = printerPrefs();
      // Only with a receipt printer chosen: sending the kick code to the Windows
      // default printer (often an office printer) would print a junk page.
      if (p.autoKick && p.raw && tenders.some((t) => t.method === "cash")) {
        api.kickDrawer(p.name).catch((e) => toast.error(`Cash drawer: ${errorText(e)}`));
      }
    } catch (e) {
      const msg = errorText(e);
      // Price change, discount or credit over the limit: ask for a manager PIN and try again.
      if (!approval && /approval/i.test(msg)) {
        setApprovalFor({ reason: msg, tenders });
      } else {
        toast.error(`Sale NOT saved: ${msg}`);
        setApprovalFor(null);
      }
    } finally {
      setPosting(false);
    }
  };

  const hold = async () => {
    if (lines.length === 0) return toast.info("The cart is empty.");
    const name = await toast.prompt("Hold this cart", "Name or note", { placeholder: customer?.name || "e.g. Aslam bhai" });
    if (name === null) return;
    try {
      await api.parkCart(name || customer?.name || "", customer?.id ?? null, lines);
      clearCart();
      toast.success("Cart held. Recall it with F8.");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const recall = async (id: string) => {
    if (lines.length > 0 && !(await toast.confirm("Replace the current cart?", "The items now in the cart will be removed.", { danger: true }))) return;
    try {
      const r = await api.recallParked(id);
      setLines(r.lines.map((l) => ({ ...l, discount_paisa: 0 })));
      setBillDiscount(0);
      setCustomer(null);
      if (r.customer_id) {
        const list = await api.listCustomers("");
        setCustomer(list.find((c) => c.id === r.customer_id) || null);
      }
      setParkedOpen(false);
      toast.success("Held cart restored. Prices are today's prices.");
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const cashDrop = async () => {
    const amt = await toast.prompt("Cash drop / expense", "Amount taken out of the drawer (Rs)", { type: "number" });
    if (!amt) return;
    const reason = await toast.prompt("Cash drop / expense", "Reason", { placeholder: "e.g. handed to owner, tea, electricity" });
    if (reason === null) return;
    try {
      await api.cashDrop(rupeesToPaisa(amt), reason || "Cash drop");
      toast.success(`Recorded: ${formatPkr(rupeesToPaisa(amt))} taken out`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  // ---- grid cell edits (all checked again by the backend)
  const commitQty = (i: number, text: string) => {
    const milli = Math.round((parseFloat(text) || 0) * 1000);
    if (milli <= 0) {
      removeLine(i);
      focusItem();
    } else updateLine(i, { qty_milli: milli });
  };
  const commitRate = (i: number, text: string) => {
    const q = quote?.lines[i];
    if (!q) return false;
    const p = rupeesToPaisa(text);
    if (p <= 0) {
      toast.error("Enter a price.");
      return false;
    }
    if (q.min_price_paisa != null && p < q.min_price_paisa) {
      toast.error(`${formatPkr(p)} is below the wholesale price of ${formatPkr(q.min_price_paisa)} for ${q.name}.`);
      return false;
    }
    updateLine(i, { price_override_paisa: p === q.catalog_price_paisa ? null : p });
  };
  const commitDisc = (i: number, text: string) => {
    updateLine(i, { discount_paisa: rupeesToPaisa(text) });
  };
  const moveRow = (i: number, col: string, dir: -1 | 1) => {
    const n = i + dir;
    if (n < 0) return;
    if (n >= lines.length) return focusItem();
    focusRow(n, col);
  };

  const canPay = lines.length > 0 && !!quote && !quoteError && !quoting && !!status?.can_post_sales;

  /** Enter in "Cash received": finish the sale. Less than the total goes on the customer's khata. */
  const payCash = async () => {
    if (!canPay || !quote || posting) {
      if (!lines.length) focusItem();
      return;
    }
    const total = quote.total_paisa;
    const paid = cashText.trim() ? rupeesToPaisa(cashText) : total;
    if (paid >= total) return postSale([{ method: "cash", amount_paisa: paid, reference: null }]);
    if (!customer) {
      toast.error(`Short by ${formatPkr(total - paid)}. Enter the full amount, or choose a customer (F3) to put the rest on khata.`);
      return;
    }
    const ok = await toast.confirm(`Put ${formatPkr(total - paid)} on khata?`, `${customer.name} pays ${formatPkr(paid)} now. The rest is added to their khata.`, { confirmLabel: "Yes, on khata" });
    if (!ok) return cashRef.current?.focus();
    const tenders: PaymentTenderInput[] = [];
    if (paid > 0) tenders.push({ method: "cash", amount_paisa: paid, reference: null });
    tenders.push({ method: "credit", amount_paisa: total - paid, reference: null });
    postSale(tenders);
  };

  // ---- keyboard shortcuts
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (payOpen || receipt || parkedOpen || closeOpen || returnsOpen || approvalFor) return;
      const el = document.activeElement as HTMLElement | null;
      if (e.key === "Delete" && e.ctrlKey && el?.dataset.grid === "pos") {
        e.preventDefault();
        const r = Number(el.dataset.row);
        removeLine(r);
        lines.length > 1 ? focusRow(Math.max(0, r - 1), "qty") : focusItem();
        return;
      }
      const keys: Record<string, () => void> = {
        F2: () => itemRef.current?.focus(),
        F3: () => custRef.current?.focus(),
        F4: () => hold(),
        F6: () => discRef.current?.focus(),
        F7: () => can("SalesReturn") && setReturnsOpen(true),
        F8: () => setParkedOpen(true),
        F9: () => cashRef.current?.focus(),
        F10: () => canPay && setPayOpen(true),
      };
      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
      } else if (e.key === "Escape" && lines.length > 0 && el?.getAttribute("aria-label") === "Item" && !(el as HTMLInputElement).value) {
        if (await toast.confirm("Clear the bill?", undefined, { danger: true, confirmLabel: "Clear" })) clearCart();
        focusItem();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const itemCount = useMemo(() => lines.length, [lines]);
  const total = quote?.total_paisa ?? 0;
  const paidNow = cashText.trim() ? rupeesToPaisa(cashText) : total;

  // ---- no shift yet: ask for the opening cash
  if (shift === undefined) {
    return <Loader2 className="w-6 h-6 animate-spin mx-auto mt-20 text-slate-400" />;
  }
  if (shift === null) {
    return (
      <div className="max-w-sm mx-auto mt-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold flex items-center gap-2"><Banknote className="w-5 h-5 text-emerald-500" /> Start your shift</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">Count the cash in the drawer now and enter it. This is the opening cash for today's Z report.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setShift(await api.startShift(rupeesToPaisa(openingCash)));
              toast.success("Shift started");
            } catch (err) {
              toast.error(errorText(err));
            }
          }}
        >
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Opening cash (Rs)
            <input autoFocus inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value.replace(/[^\d.]/g, ""))} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-lg font-bold" />
          </label>
          <button disabled={openingCash === ""} className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold">Start shift</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full h-[calc(100vh-120px)] min-h-[520px]">
      {/* Left: item box, customer and the bill grid */}
      <section className="flex-1 flex flex-col gap-3 min-w-0 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end relative z-20">
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Item <Key k="F2" /> scan barcode, or type name and press Enter</span>
            <ItemSearch
              ref={itemRef}
              search={searchSellable}
              onCode={onCode}
              onPick={pick}
              placeholder="Scan barcode or type name / SKU"
              onEmptyEnter={() => lines.length && cashRef.current?.focus()}
              onArrowUpEmpty={() => lines.length && focusRow(lines.length - 1, "qty")}
            />
          </div>
          <div className="sm:w-72">
            <PartyTypeAhead
              ref={custRef}
              label="Customer (F3)"
              value={customer}
              onChange={(c) => setCustomer(c as CustomerSummary | null)}
              search={searchCustomers}
              onCreate={createCustomer}
              emptyText="Walk-in customer"
              balanceLabel="due"
              onDone={focusItem}
            />
          </div>
        </div>

        {quoteError && (
          <div role="alert" className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">{quoteError}</div>
        )}

        <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-16">
              <ShoppingCart className="w-10 h-10" />
              <p className="text-sm">Scan a barcode or type a product name to start a sale.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 z-10">
                <tr className="text-left">
                  <th className="px-2 py-2 w-8">#</th>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2 text-right">Stock</th>
                  <th className="px-2 py-2 text-right w-24">Qty</th>
                  <th className="px-2 py-2 text-right w-28">Rate</th>
                  <th className="px-2 py-2 text-right w-24">Disc.</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const q = quote?.lines[i];
                  const short = q && !q.is_service && q.qty_milli > q.on_hand_milli;
                  return (
                    <tr key={`${l.variant_id}-${i}`} className="border-t border-slate-100 dark:border-slate-800 align-middle">
                      <td className="px-2 py-1.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold leading-tight">{q?.name ?? "…"}</div>
                        <div className="text-[11px] text-slate-400">
                          {q?.sku}
                          {q && l.price_override_paisa != null && <span className="text-amber-600"> · price changed from {formatPkr(q.catalog_price_paisa)}</span>}
                          {q?.min_price_paisa != null && <span> · lowest {formatPkr(q.min_price_paisa)}</span>}
                        </div>
                      </td>
                      <td className={`px-2 py-1.5 text-right text-xs whitespace-nowrap ${short ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
                        {q ? (q.is_service ? "service" : `Stock ${formatQty(q.on_hand_milli, q.unit_code)}${short ? " (not enough)" : ""}`) : ""}
                      </td>
                      <td className="px-1 py-1">
                        <CellInput grid="pos" row={i} col="qty" label={`Qty line ${i + 1}`} value={String(l.qty_milli / 1000)} warn={!!short} onCommit={(t) => commitQty(i, t)} onEnter={() => focusRow(i, "rate")} onArrow={(d) => moveRow(i, "qty", d)} onEscape={focusItem} />
                      </td>
                      <td className="px-1 py-1">
                        <CellInput grid="pos" row={i} col="rate" label={`Rate line ${i + 1}`} value={q ? String(q.unit_price_paisa / 100) : ""} className={l.price_override_paisa != null ? "text-amber-600" : ""} onCommit={(t) => commitRate(i, t)} onEnter={() => focusRow(i, "disc")} onArrow={(d) => moveRow(i, "rate", d)} onEscape={focusItem} />
                      </td>
                      <td className="px-1 py-1">
                        <CellInput grid="pos" row={i} col="disc" label={`Discount line ${i + 1}`} value={String((l.discount_paisa || 0) / 100)} onCommit={(t) => commitDisc(i, t)} onEnter={focusItem} onArrow={(d) => moveRow(i, "disc", d)} onEscape={focusItem} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap">{q ? formatPkr(q.total_paisa) : ""}</td>
                      <td className="pr-1">
                        <button tabIndex={-1} aria-label="Remove item" onClick={() => removeLine(i)} className="p-1 text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
          <span><Key k="Enter" /> next box</span>
          <span><Key k="↑" /> <Key k="↓" /> rows</span>
          <span><Key k="Ctrl+Del" /> remove line</span>
          <span><Key k="Esc" /> back to item</span>
          <span>Qty 0 removes the line</span>
        </p>
      </section>

      {/* Right: totals and payment, all typed */}
      <aside className="w-full lg:w-[340px] flex flex-col gap-3 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm overflow-y-auto">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Items</span><span>{itemCount}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatPkr(quote?.subtotal_paisa)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>−{formatPkr(quote?.discount_paisa)}</span></div>
          {!!quote?.tax_paisa && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{formatPkr(quote.tax_paisa)}</span></div>}
          <div className="pt-2 mt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-emerald-600">TOTAL</div>
            <div className="text-3xl font-black flex items-center gap-2" data-testid="bill-total">{formatPkr(quote?.total_paisa)} {quoting && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}</div>
          </div>
        </div>

        <NumberBox
          ref={discRef}
          label="Bill discount (Rs)"
          hint="F6"
          value={billDiscount ? String(billDiscount / 100) : ""}
          placeholder="0"
          onChange={(v) => setBillDiscount(rupeesToPaisa(v))}
          onEnter={() => cashRef.current?.focus()}
        />
        <NumberBox
          ref={cashRef}
          big
          label="Cash received (Rs) · Enter = save sale"
          hint="F9"
          value={cashText}
          placeholder={quote ? String(total / 100) : "0"}
          onChange={setCashText}
          onEnter={payCash}
        />
        {quote && lines.length > 0 && (
          <div className={`text-sm font-bold text-right ${paidNow < total ? "text-rose-600" : "text-amber-600"}`} data-testid="change">
            {paidNow >= total ? `Change ${formatPkr(paidNow - total)}` : customer ? `${formatPkr(total - paidNow)} on ${customer.name}'s khata` : `Short ${formatPkr(total - paidNow)}`}
          </div>
        )}
        {!can("SalesDiscount") && (billDiscount > 0 || lines.some((l) => (l.discount_paisa ?? 0) > 0)) && <p className="text-[11px] text-amber-600">Discounts need a Manager PIN when you save.</p>}
        {!status?.can_post_sales && <p className="text-xs font-semibold text-rose-600">License is not active, so sales are blocked.</p>}

        <button disabled={!canPay || posting} onClick={payCash} className="py-3 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-base font-bold shadow flex items-center justify-center gap-2">
          {posting && <Loader2 className="w-4 h-4 animate-spin" />} Save sale (Enter in cash box)
        </button>
        <button disabled={!canPay} onClick={() => setPayOpen(true)} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold">
          Card / JazzCash / split payment (F10)
        </button>

        <div className="grid grid-cols-2 gap-2 text-xs font-semibold mt-auto">
          <button onClick={hold} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1"><Clock className="w-3.5 h-3.5" /> Hold (F4)</button>
          <button onClick={() => setParkedOpen(true)} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1"><Clock className="w-3.5 h-3.5" /> Recall (F8)</button>
          {can("SalesReturn") && (
            <button onClick={() => setReturnsOpen(true)} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Return (F7)</button>
          )}
          <button onClick={cashDrop} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center gap-1"><Banknote className="w-3.5 h-3.5" /> Cash out</button>
          <button disabled={!lastReceipt} onClick={() => lastReceipt && setReceipt(lastReceipt)} className="py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1"><Printer className="w-3.5 h-3.5" /> Last receipt</button>
          <button onClick={() => setCloseOpen(true)} className="py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center gap-1"><LogOut className="w-3.5 h-3.5" /> Close shift</button>
        </div>
        <p className="text-[11px] text-slate-400 flex items-center gap-1"><Receipt className="w-3 h-3" /> Shift opened {new Date(shift.opened_at).toLocaleTimeString()} with {formatPkr(shift.opening_float_paisa)}</p>
      </aside>

      {payOpen && quote && <PaymentModal totalPaisa={quote.total_paisa} customer={quote.customer} busy={posting} onPay={(t) => postSale(t)} onClose={() => setPayOpen(false)} />}
      {approvalFor && (
        <ApprovalDialog
          title="Manager approval needed"
          reason={approvalFor.reason}
          onApprove={(a) => postSale(approvalFor.tenders, a)}
          onCancel={() => setApprovalFor(null)}
        />
      )}
      {receipt && (
        <ReceiptModal
          receipt={receipt}
          autoPrint={printerPrefs().raw}
          onClose={() => {
            setReceipt(null);
            refresh();
            focusItem();
          }}
        />
      )}
      {parkedOpen && <ParkedCartsModal onRecall={recall} onClose={() => setParkedOpen(false)} />}
      {returnsOpen && <SaleReturnsModal onClose={() => setReturnsOpen(false)} onDone={() => {}} />}
      {closeOpen && (
        <ShiftCloseModal
          onClose={() => {
            setCloseOpen(false);
            loadShift();
          }}
          onClosed={() => {}}
        />
      )}
    </div>
  );
}
