import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  ApprovalInput,
  CheckoutLineInput,
  errorText,
  formatPkr,
  PaymentTenderInput,
  ProductRow,
  ReceiptData,
  SaleDetail,
  SaleEditPreview,
  TenderMethod,
} from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { ApprovalDialog } from "./ApprovalDialog";
import {
  CellInput,
  focusCell,
  ItemSearch,
  ItemSearchHandle,
  Key,
  NumberBox,
  PartyLite,
  PartyTypeAhead,
  TypeAheadHandle,
} from "./entry/keyboard";

const toPaisa = (v: string | number) => Math.round((typeof v === "number" ? v : parseFloat(v || "0") || 0) * 100);
const toMilli = (v: string | number) => Math.round((typeof v === "number" ? v : parseFloat(v || "0") || 0) * 1000);

interface EditLine {
  variant_id: string;
  unit_id: string;
  unit_code: string;
  sku: string;
  name: string;
  qty_milli: number;
  unit_price_paisa: number;
  discount_paisa: number;
  price_override_paisa?: number | null;
  min_price_paisa?: number | null;
  catalog_price_paisa?: number;
  on_hand_milli?: number;
  is_service?: boolean;
}

export function SaleEditView({
  saleDetail,
  onClose,
  onSaved,
}: {
  saleDetail: SaleDetail;
  onClose: () => void;
  onSaved: (receipt: ReceiptData) => void;
}) {
  const toast = useToast();
  const { can } = useSession();
  const sale = saleDetail.receipt.sale;

  // Initialize lines from sale
  const [lines, setLines] = useState<EditLine[]>(() =>
    sale.lines.map((l) => ({
      variant_id: l.variant_id,
      unit_id: l.unit_id || "",
      unit_code: l.unit_code,
      sku: l.sku,
      name: l.product_name,
      qty_milli: l.qty_milli,
      unit_price_paisa: l.unit_price_paisa,
      discount_paisa: l.discount_paisa,
      price_override_paisa: null,
      catalog_price_paisa: l.unit_price_paisa,
    }))
  );

  // Customer state
  const [customer, setCustomer] = useState<PartyLite | null>(() =>
    sale.customer_id && sale.customer_name
      ? { id: sale.customer_id, name: sale.customer_name, phone: null, balance_paisa: 0 }
      : null
  );

  // Global bill discount. sale.discount_paisa holds line discounts + bill discount,
  // so the bill discount alone is the total minus the line discounts.
  const originalBillDiscount = Math.max(
    0,
    sale.discount_paisa - sale.lines.reduce((s, l) => s + (l.discount_paisa || 0), 0)
  );
  const [billDiscount, setBillDiscount] = useState<string>(() =>
    originalBillDiscount ? String(originalBillDiscount / 100) : "0"
  );

  // Edit preview / quote
  const [preview, setPreview] = useState<SaleEditPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  // Settlement states
  // diff > 0:
  const [cashSettlement, setCashSettlement] = useState("");
  const [otherMethod, setOtherMethod] = useState("card");
  const [otherSettlement, setOtherSettlement] = useState("");
  const [khataSettlement, setKhataSettlement] = useState("");
  // diff < 0:
  const [refundToKhata, setRefundToKhata] = useState(false);

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [askApproval, setAskApproval] = useState(false);

  // Dirty tracking for cancel confirmation
  const isDirty = useMemo(() => {
    if (lines.length !== sale.lines.length) return true;
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i];
      const b = sale.lines[i];
      if (
        a.variant_id !== b.variant_id ||
        a.qty_milli !== b.qty_milli ||
        a.unit_price_paisa !== b.unit_price_paisa ||
        a.discount_paisa !== b.discount_paisa
      ) {
        return true;
      }
    }
    if ((customer?.id || null) !== (sale.customer_id || null)) return true;
    if (toPaisa(billDiscount) !== originalBillDiscount) return true;
    return false;
  }, [lines, customer, billDiscount, sale, originalBillDiscount]);

  // Form refs
  const itemRef = useRef<ItemSearchHandle>(null);
  const custRef = useRef<TypeAheadHandle>(null);
  const discRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  const focusItem = () => setTimeout(() => itemRef.current?.focus(), 0);
  const focusRow = (row: number, col: string) => setTimeout(() => focusCell("sale_edit", row, col), 30);

  // Search items and customers
  const searchSellable = useCallback((q: string) => api.searchSellable(q, 12), []);
  const searchCustomers = useCallback((q: string) => api.listCustomers(q), []);
  const createCustomer = async (name: string): Promise<PartyLite | null> => {
    const phone = await toast.prompt(`New customer: ${name}`, "Phone (optional)");
    if (phone === null) return null;
    try {
      const c = await api.createParty({ party_type: "customer", name, phone: phone.trim() || null });
      toast.success(`Customer ${c.name} added`);
      return { id: c.id, name: c.name, phone: c.phone, balance_paisa: 0 };
    } catch (e) {
      toast.error(errorText(e));
      return null;
    }
  };

  // Build checkout lines for quote/edit
  const checkoutLines: CheckoutLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        variant_id: l.variant_id,
        unit_id: l.unit_id,
        qty_milli: l.qty_milli,
        discount_paisa: l.discount_paisa,
        price_override_paisa: l.price_override_paisa,
      })),
    [lines]
  );

  // Fetch preview on changes
  useEffect(() => {
    if (lines.length === 0) {
      setPreview(null);
      setPreviewError("A receipt needs at least one item.");
      return;
    }
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(() => {
      api
        .quoteSaleEdit({
          sale_id: sale.id,
          expected_revision: sale.revision ?? 0,
          customer_id: customer?.id ?? null,
          lines: checkoutLines,
          global_discount_paisa: toPaisa(billDiscount),
          settlement: [],
          refund_to_khata: refundToKhata,
          reason: "preview",
        })
        .then((p) => {
          if (!cancelled) {
            setPreview(p);
            setPreviewError(null);
            // Default settlement if not adjusted
            if (p.diff_paisa > 0) {
              setCashSettlement(String(p.diff_paisa / 100));
              setOtherSettlement("");
              setKhataSettlement("");
            } else {
              setCashSettlement("");
              setOtherSettlement("");
              setKhataSettlement("");
            }
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(null);
            setPreviewError(errorText(e));
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sale.id, sale.revision, customer?.id, checkoutLines, billDiscount, refundToKhata]);

  // Add line helper
  const addAndLocate = (p: ProductRow) => {
    const i = lines.findIndex((l) => l.variant_id === p.variant_id && l.unit_id === p.base_unit_id);
    if (i >= 0) {
      setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty_milli: l.qty_milli + 1000 } : l)));
      return i;
    }
    const newLine: EditLine = {
      variant_id: p.variant_id,
      unit_id: p.base_unit_id,
      unit_code: p.base_unit_code,
      sku: p.sku,
      name: p.name,
      qty_milli: 1000,
      unit_price_paisa: p.retail_price_paisa,
      discount_paisa: 0,
      catalog_price_paisa: p.retail_price_paisa,
      min_price_paisa: p.wholesale_price_paisa ?? null,
      on_hand_milli: p.on_hand_milli,
      is_service: p.is_service,
    };
    setLines((prev) => [...prev, newLine]);
    return lines.length;
  };

  const onCode = async (code: string) => {
    try {
      const hit = await api.scanCode(code);
      if (!hit) return false;
      const i = lines.findIndex(
        (l) => l.variant_id === hit.product.variant_id && l.unit_id === hit.unit_id && !l.price_override_paisa
      );
      if (i >= 0) {
        setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty_milli: l.qty_milli + hit.qty_milli } : l)));
      } else {
        setLines((prev) => [
          ...prev,
          {
            variant_id: hit.product.variant_id,
            unit_id: hit.unit_id,
            unit_code: hit.units.find((u) => u.unit_id === hit.unit_id)?.unit_code || "pc",
            sku: hit.product.sku,
            name: hit.product.name,
            qty_milli: hit.qty_milli,
            unit_price_paisa: hit.product.retail_price_paisa,
            discount_paisa: 0,
            catalog_price_paisa: hit.product.retail_price_paisa,
            min_price_paisa: hit.product.wholesale_price_paisa ?? null,
            on_hand_milli: hit.on_hand_milli,
            is_service: false,
          },
        ]);
      }
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return true;
    }
  };

  const pick = (p: ProductRow) => focusRow(addAndLocate(p), "qty");
  const updateLine = (i: number, patch: Partial<EditLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i));

  // Cell commit handlers
  const commitQty = (i: number, text: string) => {
    const milli = toMilli(text);
    if (milli <= 0) {
      removeLine(i);
      focusItem();
    } else {
      updateLine(i, { qty_milli: milli });
    }
  };

  const commitRate = (i: number, text: string) => {
    const l = lines[i];
    if (!l) return;
    const p = toPaisa(text);
    if (p <= 0) {
      toast.error("Enter a valid price.");
      return;
    }
    if (l.min_price_paisa != null && p < l.min_price_paisa) {
      toast.error(`Price for ${l.name} is below the wholesale price.`);
      return;
    }
    updateLine(i, {
      unit_price_paisa: p,
      price_override_paisa: p === l.catalog_price_paisa ? null : p,
    });
  };

  const commitDisc = (i: number, text: string) => {
    updateLine(i, { discount_paisa: toPaisa(text) });
  };

  const moveRow = (i: number, col: string, dir: -1 | 1) => {
    const n = i + dir;
    if (n < 0) return;
    if (n >= lines.length) return focusItem();
    focusRow(n, col);
  };

  // Build settlement array
  const buildSettlement = (): PaymentTenderInput[] => {
    if (!preview || preview.diff_paisa <= 0) return [];
    const tenders: PaymentTenderInput[] = [];
    const cash = toPaisa(cashSettlement);
    if (cash > 0) tenders.push({ method: "cash", amount_paisa: cash, reference: null });
    const other = toPaisa(otherSettlement);
    if (other > 0) {
      tenders.push({
        method: (otherMethod.trim().toLowerCase() || "card") as TenderMethod,
        amount_paisa: other,
        reference: null,
      });
    }
    const khata = toPaisa(khataSettlement);
    if (khata > 0) tenders.push({ method: "credit", amount_paisa: khata, reference: null });
    return tenders;
  };

  const handleStartSave = () => {
    if (lines.length === 0) {
      toast.error("A receipt needs at least one item.");
      return;
    }
    if (previewError) {
      toast.error(previewError);
      return;
    }
    if (!preview) return;

    if (preview.diff_paisa > 0) {
      const tenders = buildSettlement();
      const sum = tenders.reduce((s, t) => s + t.amount_paisa, 0);
      if (sum !== preview.diff_paisa) {
        toast.error(`Settlement total (${formatPkr(sum)}) must equal difference (${formatPkr(preview.diff_paisa)})`);
        return;
      }
    }
    if (preview.diff_paisa < 0 && refundToKhata && !customer) {
      toast.error("Customer is required to reduce khata.");
      return;
    }

    setConfirmOpen(true);
    setTimeout(() => reasonRef.current?.focus(), 50);
  };

  const handleCommitSave = async (approval: ApprovalInput | null = null) => {
    if (reason.trim().length < 3) {
      toast.error("Reason is required (min 3 characters).");
      return;
    }
    if (!can("SalesVoid") && !approval) {
      setAskApproval(true);
      return;
    }

    setSaving(true);
    try {
      const updated = await api.editSale({
        sale_id: sale.id,
        expected_revision: sale.revision ?? 0,
        customer_id: customer?.id ?? null,
        lines: checkoutLines,
        global_discount_paisa: toPaisa(billDiscount),
        settlement: buildSettlement(),
        refund_to_khata: refundToKhata,
        reason: reason.trim(),
        approval,
      });
      toast.success(`Receipt ${sale.doc_no} updated (rev ${updated.sale.revision ?? 1})`);
      setConfirmOpen(false);
      setAskApproval(false);
      onSaved(updated);
    } catch (e) {
      const msg = errorText(e);
      if (!approval && /approval/i.test(msg)) {
        setAskApproval(true);
      } else {
        toast.error(`Edit NOT saved: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (isDirty) {
      const ok = await toast.confirm("Discard changes?", "Your edits to this receipt will not be saved.", {
        danger: true,
        confirmLabel: "Discard",
      });
      if (!ok) return;
    }
    onClose();
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (confirmOpen || askApproval) return;
      const el = document.activeElement as HTMLElement | null;

      if (e.key === "Delete" && e.ctrlKey && el?.dataset.grid === "sale_edit") {
        e.preventDefault();
        const r = Number(el.dataset.row);
        removeLine(r);
        lines.length > 1 ? focusRow(Math.max(0, r - 1), "qty") : focusItem();
        return;
      }

      if (e.altKey && e.key === "1") {
        e.preventDefault();
        setRefundToKhata(false);
        return;
      }
      if (e.altKey && e.key === "2") {
        e.preventDefault();
        if (customer) setRefundToKhata(true);
        else toast.error("Select a customer first to reduce khata.");
        return;
      }

      const keys: Record<string, () => void> = {
        F2: () => itemRef.current?.focus(),
        F3: () => custRef.current?.focus(),
        F6: () => discRef.current?.focus(),
        F9: () => handleStartSave(),
      };

      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-3 min-h-[540px]">
      {/* Header: Yellow editing banner */}
      <div className="bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/60 rounded-xl px-4 py-2.5 flex items-center justify-between text-amber-900 dark:text-amber-200 shadow-sm">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="font-bold text-sm">
            Editing receipt {sale.doc_no}{" "}
            <span className="font-normal opacity-80 text-xs">
              (original date {new Date(sale.created_at).toLocaleString()})
            </span>
          </span>
          <span className="ml-2 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
            Rev {sale.revision ?? 0}
          </span>
        </div>
        <button
          onClick={handleCancel}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 border border-amber-300 dark:border-amber-700 transition flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back <Key k="Esc" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1">
        {/* Main cart edit section */}
        <section className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Inputs top bar */}
          <div className="grid sm:grid-cols-[1fr_16rem_10rem] gap-3 items-end relative z-20">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">
                Item <Key k="F2" /> scan or type name, Enter
              </span>
              <ItemSearch
                ref={itemRef}
                search={searchSellable}
                onCode={onCode}
                onPick={pick}
                placeholder="Add or search item"
                onArrowUpEmpty={() => lines.length && focusRow(lines.length - 1, "qty")}
              />
            </div>
            <PartyTypeAhead
              ref={custRef}
              label="Customer (F3)"
              value={customer}
              onChange={setCustomer}
              search={searchCustomers}
              onCreate={createCustomer}
              emptyText="Walk-in customer (cash only)"
              balanceLabel="balance"
              onDone={focusItem}
            />
            <NumberBox
              ref={discRef}
              label="Bill discount (Rs)"
              hint="F6"
              value={billDiscount}
              placeholder="0"
              onChange={setBillDiscount}
              onEnter={focusItem}
            />
          </div>

          {/* Lines Table */}
          <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl min-h-[260px] bg-white dark:bg-slate-900">
            {lines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-16 text-sm">
                No items on this receipt. Search or scan items above.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 z-10 border-b border-slate-200 dark:border-slate-800">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 text-right w-24">Qty</th>
                    <th className="px-2 py-2 text-right w-28">Rate (Rs)</th>
                    <th className="px-2 py-2 text-right w-24">Disc (Rs)</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const lineAmt = Math.round((l.qty_milli * l.unit_price_paisa) / 1000) - l.discount_paisa;
                    return (
                      <tr key={l.variant_id + "_" + i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1.5 text-xs text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold leading-tight">{l.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{l.sku}</div>
                        </td>
                        <td className="px-1 py-1">
                          <CellInput
                            grid="sale_edit"
                            row={i}
                            col="qty"
                            label={`Qty line ${i + 1}`}
                            value={String(l.qty_milli / 1000)}
                            onCommit={(t) => commitQty(i, t)}
                            onEnter={() => focusRow(i, "rate")}
                            onArrow={(d) => moveRow(i, "qty", d)}
                            onEscape={focusItem}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <CellInput
                            grid="sale_edit"
                            row={i}
                            col="rate"
                            label={`Rate line ${i + 1}`}
                            value={String(l.unit_price_paisa / 100)}
                            onCommit={(t) => commitRate(i, t)}
                            onEnter={() => focusRow(i, "disc")}
                            onArrow={(d) => moveRow(i, "rate", d)}
                            onEscape={focusItem}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <CellInput
                            grid="sale_edit"
                            row={i}
                            col="disc"
                            label={`Discount line ${i + 1}`}
                            value={String(l.discount_paisa / 100)}
                            onCommit={(t) => commitDisc(i, t)}
                            onEnter={focusItem}
                            onArrow={(d) => moveRow(i, "disc", d)}
                            onEscape={focusItem}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-slate-900 dark:text-white">
                          {formatPkr(lineAmt)}
                        </td>
                        <td className="pr-1">
                          <button
                            tabIndex={-1}
                            aria-label="Remove line"
                            onClick={() => removeLine(i)}
                            className="p-1 text-slate-300 hover:text-rose-500 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <Key k="Enter" /> next box
            </span>
            <span>
              <Key k="↑" /> <Key k="↓" /> rows
            </span>
            <span>
              <Key k="Ctrl+Del" /> remove line
            </span>
            <span>
              <Key k="F9" /> save edit
            </span>
            <span>
              <Key k="Esc" /> discard changes
            </span>
          </p>
        </section>

        {/* Live summary and settlement sidebar */}
        <aside className="w-full lg:w-[320px] flex flex-col gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">
            Summary & Settlement
          </div>

          {previewError ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{previewError}</span>
            </div>
          ) : null}

          {preview?.stock_warnings?.map((w, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>{w}</span>
            </div>
          ))}

          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex justify-between">
              <span>Original total:</span>
              <span className="font-mono">{formatPkr(preview?.old_total_paisa ?? sale.total_paisa)}</span>
            </div>
            <div className="flex justify-between">
              <span>New total:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {formatPkr(preview?.new_total_paisa ?? 0)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800 font-bold">
              <span>Difference:</span>
              <span
                className={`font-mono text-sm ${
                  (preview?.diff_paisa ?? 0) > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : (preview?.diff_paisa ?? 0) < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-500"
                }`}
              >
                {(preview?.diff_paisa ?? 0) > 0 ? "+" : ""}
                {formatPkr(preview?.diff_paisa ?? 0)}
              </span>
            </div>
          </div>

          {/* Settlement area according to diff */}
          {preview && preview.diff_paisa > 0 && (
            <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2.5 text-xs">
              <div className="font-bold text-emerald-800 dark:text-emerald-300">
                Customer pays more: {formatPkr(preview.diff_paisa)}
              </div>
              <NumberBox
                label="Cash received (Rs)"
                value={cashSettlement}
                placeholder="0"
                onChange={setCashSettlement}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Other method</span>
                  <input
                    value={otherMethod}
                    onChange={(e) => setOtherMethod(e.target.value)}
                    placeholder="card, jazzcash"
                    className="w-full px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                </label>
                <NumberBox
                  label="Other amount (Rs)"
                  value={otherSettlement}
                  placeholder="0"
                  onChange={setOtherSettlement}
                />
              </div>
              {customer ? (
                <NumberBox
                  label={`To ${customer.name}'s khata (Rs)`}
                  value={khataSettlement}
                  placeholder="0"
                  onChange={setKhataSettlement}
                />
              ) : (
                <p className="text-[10px] text-slate-400">Select customer (F3) to put remainder on khata.</p>
              )}
            </div>
          )}

          {preview && preview.diff_paisa < 0 && (
            <div className="p-3 rounded-xl border border-rose-300 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-2 text-xs">
              <div className="font-bold text-rose-800 dark:text-rose-300">
                Give back: {formatPkr(-preview.diff_paisa)}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRefundToKhata(false)}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-semibold text-xs border ${
                    !refundToKhata
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  Give back cash <Key k="Alt+1" />
                </button>
                <button
                  type="button"
                  disabled={!customer}
                  onClick={() => customer && setRefundToKhata(true)}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-semibold text-xs border disabled:opacity-40 ${
                    refundToKhata
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  Reduce khata <Key k="Alt+2" />
                </button>
              </div>
              {!customer && (
                <p className="text-[10px] text-slate-400">Choose a customer (F3) to enable khata reduction.</p>
              )}
            </div>
          )}

          {preview && preview.diff_paisa === 0 && (
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-500">
              Total amount unchanged. Stock and lines will be updated.
            </div>
          )}

          <button
            onClick={handleStartSave}
            disabled={saving || quoting || !!previewError || lines.length === 0}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 mt-auto"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save changes (F9)
          </button>
        </aside>
      </div>

      {/* Confirm Dialog (F9) */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                Confirm edit for {sale.doc_no}
              </h3>
              <button
                onClick={() => setConfirmOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div>
                  <div className="text-xs text-slate-400">Old total</div>
                  <div className="font-bold text-slate-700 dark:text-slate-300">
                    {formatPkr(preview?.old_total_paisa ?? sale.total_paisa)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">New total</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPkr(preview?.new_total_paisa ?? 0)}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Settlement:</span>
                <div className="text-xs text-slate-500 mt-0.5">
                  {(preview?.diff_paisa ?? 0) === 0
                    ? "No difference in total amount."
                    : (preview?.diff_paisa ?? 0) > 0
                    ? `Payment received: ${buildSettlement()
                        .map((t) => `${t.method} ${formatPkr(t.amount_paisa)}`)
                        .join(", ")}`
                    : `Refund: ${refundToKhata ? "Customer khata reduced" : "Cash out from drawer"} by ${formatPkr(
                        -(preview?.diff_paisa ?? 0)
                      )}`}
                </div>
              </div>

              <label className="block pt-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for editing (required, min 3 chars) *
                </span>
                <input
                  ref={reasonRef}
                  autoFocus
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && reason.trim().length >= 3) {
                      e.preventDefault();
                      handleCommitSave(null);
                    }
                  }}
                  placeholder="e.g. Customer changed item, entered wrong quantity"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || reason.trim().length < 3}
                onClick={() => handleCommitSave(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex items-center gap-1.5 shadow"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & save edit (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Dialog if cashier lacks SalesVoid */}
      {askApproval && (
        <ApprovalDialog
          title="Manager approval for receipt edit"
          reason="Editing a posted receipt requires an Owner or Manager PIN."
          onApprove={(appr) => handleCommitSave(appr)}
          onCancel={() => setAskApproval(false)}
        />
      )}
    </div>
  );
}
