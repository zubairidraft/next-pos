import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Edit,
  FileSpreadsheet,
  History as HistoryIcon,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { ClaimsView } from "./ClaimsView";
import {
  api,
  CustomerSummary,
  errorText,
  formatPkr,
  formatQty,
  InventoryBalanceView,
  ProductRow,
  PurchaseDetail,
  PurchaseEditPreview,
  PurchaseListRow,
} from "../lib/api";
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
import { useToast } from "../lib/toast";
import { useRemoteScan } from "../lib/remoteScan";
import { A4_PAGE, printElement } from "../lib/print";

type Tab = "invoices" | "stock" | "vendors" | "claims";

const field = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";
const toPaisa = (s: string) => Math.round((parseFloat(s) || 0) * 100);
const toMilli = (s: string) => Math.round((parseFloat(s) || 0) * 1000);

export function PurchasingView({ initialTab = "invoices" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-500" /> Inventory & purchases</h2>
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
          {([
            ["invoices", "Purchase invoices", <FileSpreadsheet key="i" className="w-3.5 h-3.5" />],
            ["stock", "Stock balances", <Boxes key="s" className="w-3.5 h-3.5" />],
            ["vendors", "Vendors", <Users key="v" className="w-3.5 h-3.5" />],
            ["claims", "Claims", <ShieldCheck key="c" className="w-3.5 h-3.5" />],
          ] as [Tab, string, React.ReactNode][]).map(([t, l, icon]) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg flex items-center gap-1 ${tab === t ? "bg-white dark:bg-slate-900 shadow" : "text-slate-500"}`}>
              {icon} {l}
            </button>
          ))}
        </div>
      </div>
      {tab === "invoices" && <Invoices />}
      {tab === "stock" && <Stock />}
      {tab === "vendors" && <Vendors />}
      {tab === "claims" && <ClaimsView />}
    </div>
  );
}

function Invoices() {
  const [view, setView] = useState<"purchase" | "return" | "history">("purchase");
  const [editingPurchase, setEditingPurchase] = useState<PurchaseDetail | null>(null);
  const [saved, setSaved] = useState(0);

  if (editingPurchase) {
    return (
      <PurchaseEntry
        key={editingPurchase.invoice.id}
        mode="edit"
        initialPurchase={editingPurchase}
        onSaved={() => {
          setEditingPurchase(null);
          setView("history");
          setSaved((n) => n + 1);
        }}
        onCancel={() => setEditingPurchase(null)}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {([
          ["purchase", "New purchase (receive stock)"],
          ["return", "Return to vendor"],
          ["history", "History"],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold ${
              view === v ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {view === "history" ? (
        <PurchaseHistory
          key={saved}
          onEdit={(purchase) => setEditingPurchase(purchase)}
        />
      ) : (
        <PurchaseEntry key={view} mode={view} onSaved={() => setSaved((n) => n + 1)} />
      )}
    </>
  );
}

interface EntryLine {
  product: ProductRow;
  qty_milli: number;
  cost_paisa: number | null;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function quick(range: string): [string, string] {
  const now = new Date();
  const today = ymd(now);
  const d = new Date(now);
  switch (range) {
    case "yesterday":
      d.setDate(d.getDate() - 1);
      return [ymd(d), ymd(d)];
    case "week": {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [ymd(d), today];
    }
    case "month":
      return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    default:
      return [today, today];
  }
}

/**
 * Purchase, return to vendor, or purchase edit, laid out like the sale screen and worked
 * entirely from the keyboard: F2 item, F3 vendor, Enter moves on, F9 saves.
 */
function PurchaseEntry({
  mode,
  initialPurchase,
  onSaved,
  onCancel,
}: {
  mode: "purchase" | "return" | "edit";
  initialPurchase?: PurchaseDetail;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const isReturn = mode === "return";
  const isEdit = mode === "edit";
  const grid = isReturn ? "pret" : isEdit ? "puredit" : "pur";

  const itemRef = useRef<ItemSearchHandle>(null);
  const vendorRef = useRef<TypeAheadHandle>(null);
  const freightRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  const [vendor, setVendor] = useState<PartyLite | null>(() =>
    initialPurchase
      ? {
          id: initialPurchase.invoice.vendor_id,
          name: initialPurchase.invoice.vendor_name,
          phone: null,
          balance_paisa: 0,
        }
      : null
  );
  const [billNo, setBillNo] = useState(() => initialPurchase?.invoice.vendor_invoice_no || "");
  const [freight, setFreight] = useState(() =>
    initialPurchase?.invoice.freight_paisa ? String(initialPurchase.invoice.freight_paisa / 100) : ""
  );

  const [lines, setLines] = useState<EntryLine[]>(() => {
    if (!initialPurchase) return [];
    return initialPurchase.invoice.lines.map((l) => ({
      product: {
        product_id: "",
        variant_id: l.variant_id,
        sku: l.sku,
        name: l.product_name,
        name_ur: null,
        category_id: null,
        category_name: null,
        brand_id: null,
        brand_name: null,
        base_unit_id: l.unit_id,
        base_unit_code: l.unit_code,
        barcode: null,
        retail_price_paisa: 0,
        wholesale_price_paisa: null,
        tax_rate_bp: 0,
        tax_inclusive: true,
        on_hand_milli: 0,
        avg_cost_paisa: l.unit_cost_paisa,
        reorder_level_milli: 0,
        is_service: false,
      },
      qty_milli: l.received_qty_milli,
      cost_paisa: l.unit_cost_paisa,
    }));
  });

  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editPreview, setEditPreview] = useState<PurchaseEditPreview | null>(null);
  const [editReason, setEditReason] = useState("");

  const focusItem = () => setTimeout(() => itemRef.current?.focus(), 0);
  const focusRow = (row: number, col: string) => setTimeout(() => focusCell(grid, row, col), 30);

  const searchItems = useCallback(
    (q: string) => api.searchProducts(q, 12).then((r) => r.filter((p) => !p.is_service)),
    []
  );
  const searchVendors = useCallback((q: string) => api.listVendors(q), []);
  const createVendor = async (name: string) => {
    const phone = await toast.prompt(`New vendor: ${name}`, "Phone (optional)");
    if (phone === null) return null;
    try {
      const v = await api.createParty({ party_type: "vendor", name, phone: phone.trim() || null });
      toast.success(`Vendor ${v.name} added`);
      return v;
    } catch (e) {
      toast.error(errorText(e));
      return null;
    }
  };

  /** Add one more of the product; returns its row. */
  const add = (p: ProductRow) => {
    const i = lines.findIndex((l) => l.product.variant_id === p.variant_id);
    setLines((prev) => {
      const j = prev.findIndex((l) => l.product.variant_id === p.variant_id);
      if (j >= 0) return prev.map((l, k) => (k === j ? { ...l, qty_milli: l.qty_milli + 1000 } : l));
      return [...prev, { product: p, qty_milli: 1000, cost_paisa: p.avg_cost_paisa || null }];
    });
    return i >= 0 ? i : lines.length;
  };

  const onCode = async (code: string) => {
    try {
      const found = (await api.searchProducts(code, 5)).find(
        (p) => !p.is_service && (p.barcode === code || p.sku.toLowerCase() === code.toLowerCase())
      );
      if (!found) return false;
      const row = add(found);
      if (!found.avg_cost_paisa) focusRow(row, "cost");
      return true;
    } catch (e) {
      toast.error(errorText(e));
      return true;
    }
  };

  const pick = (p: ProductRow) => focusRow(add(p), "qty");

  useRemoteScan(async (scanned) => {
    if (!(await onCode(scanned))) toast.error(`No product with barcode or SKU "${scanned}"`);
  });

  const update = (i: number, patch: Partial<EntryLine>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLines((prev) => prev.filter((_, k) => k !== i));
  const moveRow = (i: number, col: string, dir: -1 | 1) => {
    const n = i + dir;
    if (n < 0) return;
    if (n >= lines.length) return focusItem();
    focusRow(n, col);
  };

  const subtotal = lines.reduce((s, l) => s + Math.round((l.qty_milli * (l.cost_paisa || 0)) / 1000), 0);
  const total = subtotal + (isReturn ? 0 : toPaisa(freight));
  const missing = lines.findIndex((l) => l.cost_paisa === null);
  const over = isReturn ? lines.findIndex((l) => l.qty_milli > l.product.on_hand_milli) : -1;

  const save = async () => {
    if (busy) return;
    if (!vendor) {
      toast.error("Choose the vendor (F3).");
      return vendorRef.current?.focus();
    }
    if (!lines.length) {
      toast.error("Add the items first (F2).");
      return focusItem();
    }
    if (missing >= 0) {
      toast.error(`Enter the cost for ${lines[missing].product.name}.`);
      return focusRow(missing, "cost");
    }
    if (over >= 0) {
      toast.error(
        `Only ${formatQty(lines[over].product.on_hand_milli, lines[over].product.base_unit_code)} of ${
          lines[over].product.name
        } in stock.`
      );
      return focusRow(over, "qty");
    }

    if (isEdit && initialPurchase) {
      setBusy(true);
      try {
        const preview = await api.quotePurchaseEdit({
          purchase_id: initialPurchase.invoice.id,
          expected_revision: initialPurchase.invoice.revision ?? 0,
          vendor_id: vendor.id,
          vendor_invoice_no: billNo.trim() || null,
          freight_paisa: toPaisa(freight),
          lines: lines.map((l) => ({
            variant_id: l.product.variant_id,
            unit_id: l.product.base_unit_id,
            received_qty_milli: l.qty_milli,
            unit_cost_paisa: l.cost_paisa || 0,
          })),
          reason: "preview",
        });
        setEditPreview(preview);
        setConfirmOpen(true);
        setTimeout(() => reasonRef.current?.focus(), 50);
      } catch (e) {
        toast.error(errorText(e));
      } finally {
        setBusy(false);
      }
      return;
    }

    const ok = await toast.confirm(
      isReturn
        ? `Return ${formatPkr(total)} of goods to ${vendor.name}?`
        : `Save purchase of ${formatPkr(total)} from ${vendor.name}?`,
      isReturn
        ? "Stock goes down and the amount you owe this vendor goes down."
        : "Stock goes up and the amount is added to this vendor's khata.",
      { confirmLabel: isReturn ? "Save return" : "Save purchase" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (isReturn) {
        const r = await api.postPurchaseReturn({
          vendor_id: vendor.id,
          reason: billNo.trim() || null,
          lines: lines.map((l) => ({
            variant_id: l.product.variant_id,
            unit_id: l.product.base_unit_id,
            qty_milli: l.qty_milli,
            unit_cost_paisa: l.cost_paisa || 0,
          })),
        });
        toast.success(`Return ${r.doc_no} saved. Stock and vendor balance updated.`);
      } else {
        const inv = await api.postPurchase({
          vendor_id: vendor.id,
          vendor_invoice_no: billNo.trim() || null,
          freight_paisa: toPaisa(freight),
          lines: lines.map((l) => ({
            variant_id: l.product.variant_id,
            unit_id: l.product.base_unit_id,
            received_qty_milli: l.qty_milli,
            unit_cost_paisa: l.cost_paisa || 0,
          })),
        });
        toast.success(`Purchase ${inv.doc_no} saved. Stock updated.`);
      }
      setLines([]);
      setBillNo("");
      setFreight("");
      onSaved();
      focusItem();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const commitEditSave = async () => {
    if (!isEdit || !initialPurchase) return;
    if (editReason.trim().length < 3) {
      toast.error("Reason is required (min 3 characters).");
      return;
    }
    setBusy(true);
    try {
      const inv = await api.editPurchase({
        purchase_id: initialPurchase.invoice.id,
        expected_revision: initialPurchase.invoice.revision ?? 0,
        vendor_id: vendor!.id,
        vendor_invoice_no: billNo.trim() || null,
        freight_paisa: toPaisa(freight),
        lines: lines.map((l) => ({
          variant_id: l.product.variant_id,
          unit_id: l.product.base_unit_id,
          received_qty_milli: l.qty_milli,
          unit_cost_paisa: l.cost_paisa || 0,
        })),
        reason: editReason.trim(),
      });
      toast.success(`Purchase ${inv.doc_no} updated (rev ${inv.revision ?? 1})`);
      setConfirmOpen(false);
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || document.querySelector('[role="dialog"], .fixed.inset-0.z-\\[110\\]')) return;
      const el = document.activeElement as HTMLElement | null;
      if (e.key === "Delete" && e.ctrlKey && el?.dataset.grid === grid) {
        e.preventDefault();
        const r = Number(el.dataset.row);
        remove(r);
        lines.length > 1 ? focusRow(Math.max(0, r - 1), "qty") : focusItem();
        return;
      }
      const keys: Record<string, () => void> = {
        F2: () => itemRef.current?.focus(),
        F3: () => vendorRef.current?.focus(),
        F6: () => freightRef.current?.focus(),
        F9: () => save(),
      };
      if (keys[e.key]) {
        e.preventDefault();
        keys[e.key]();
      } else if (e.key === "Escape" && isEdit && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col gap-3 min-h-[480px]">
      {/* Yellow edit banner when mode="edit" */}
      {isEdit && initialPurchase && (
        <div className="bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/60 rounded-xl px-4 py-2 flex items-center justify-between text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="font-bold text-sm">
              Editing purchase {initialPurchase.invoice.doc_no}{" "}
              <span className="font-normal opacity-80 text-xs">
                (original date {new Date(initialPurchase.invoice.created_at).toLocaleString()})
              </span>
            </span>
            <span className="ml-2 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
              Rev {initialPurchase.invoice.revision ?? 0}
            </span>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 border border-amber-300 dark:border-amber-700 transition flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Cancel <Key k="Esc" />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 flex-1">
        <section className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="grid sm:grid-cols-[1fr_16rem_12rem] gap-3 items-end relative z-20">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">
                Item <Key k="F2" /> scan or type name, Enter
              </span>
              <ItemSearch
                ref={itemRef}
                search={searchItems}
                onCode={onCode}
                onPick={pick}
                priceOf={(p) => p.avg_cost_paisa || null}
                placeholder={isReturn ? "Item to send back" : "Item received"}
                onArrowUpEmpty={() => lines.length && focusRow(lines.length - 1, "qty")}
                onEmptyEnter={() => lines.length && save()}
              />
            </div>
            <PartyTypeAhead
              ref={vendorRef}
              label="Vendor (F3)"
              value={vendor}
              onChange={setVendor}
              search={searchVendors}
              onCreate={createVendor}
              emptyText="Type vendor name"
              balanceLabel="we owe"
              onDone={focusItem}
            />
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">
                {isReturn ? "Reason" : "Vendor bill no."}
              </span>
              <input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusItem())}
                placeholder={isReturn ? "e.g. damaged, expired" : "optional"}
                aria-label={isReturn ? "Reason" : "Vendor bill no."}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>
          <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-xl min-h-[280px]">
            {lines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-16 text-sm">
                {isReturn
                  ? "Scan or type the items you are sending back to the vendor."
                  : "Scan or type the items you received."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 z-10">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 text-right">Stock</th>
                    <th className="px-2 py-2 text-right w-24">Qty</th>
                    <th className="px-2 py-2 text-right w-28">Cost (Rs)</th>
                    <th className="px-2 py-2 text-right">Sale price</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.product.variant_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold leading-tight">{l.product.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {l.product.sku}
                          {l.product.barcode ? ` · ${l.product.barcode}` : ""}
                        </div>
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right text-xs ${
                          isReturn && l.qty_milli > l.product.on_hand_milli
                            ? "text-rose-600 font-semibold"
                            : "text-slate-500"
                        }`}
                      >
                        {formatQty(l.product.on_hand_milli, l.product.base_unit_code)}
                      </td>
                      <td className="px-1 py-1">
                        <CellInput
                          grid={grid}
                          row={i}
                          col="qty"
                          label={`Qty line ${i + 1}`}
                          value={String(l.qty_milli / 1000)}
                          onCommit={(t) => {
                            const m = toMilli(t);
                            if (m <= 0) {
                              remove(i);
                              focusItem();
                            } else update(i, { qty_milli: m });
                          }}
                          onEnter={() => focusRow(i, "cost")}
                          onArrow={(d) => moveRow(i, "qty", d)}
                          onEscape={focusItem}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <CellInput
                          grid={grid}
                          row={i}
                          col="cost"
                          label={`Cost line ${i + 1}`}
                          value={l.cost_paisa === null ? "" : String(l.cost_paisa / 100)}
                          warn={l.cost_paisa === null}
                          onCommit={(t) => {
                            if (t.trim() === "") return false;
                            update(i, { cost_paisa: toPaisa(t) });
                          }}
                          onEnter={focusItem}
                          onArrow={(d) => moveRow(i, "cost", d)}
                          onEscape={focusItem}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs text-slate-500">
                        {formatPkr(l.product.retail_price_paisa)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold">
                        {formatPkr(Math.round((l.qty_milli * (l.cost_paisa || 0)) / 1000))}
                      </td>
                      <td className="pr-1">
                        <button
                          tabIndex={-1}
                          aria-label="Remove item"
                          onClick={() => remove(i)}
                          className="p-1 text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
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
              <Key k="F9" /> save
            </span>
            <span>Enter in an empty item box = save</span>
          </p>
        </section>
        <aside className="w-full lg:w-[300px] flex flex-col gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Items</span>
              <span>{lines.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Goods</span>
              <span>{formatPkr(subtotal)}</span>
            </div>
          </div>
          {!isReturn && (
            <NumberBox
              ref={freightRef}
              label="Freight / loading (Rs)"
              hint="F6"
              value={freight}
              placeholder="0"
              onChange={setFreight}
              onEnter={() => save()}
            />
          )}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-emerald-600">
              {isReturn ? "RETURN TOTAL" : isEdit ? "EDITED TOTAL" : "PURCHASE TOTAL"}
            </div>
            <div className="text-3xl font-black" data-testid="purchase-total">
              {formatPkr(total)}
            </div>
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isReturn ? "Save return (F9)" : isEdit ? "Save edit (F9)" : "Save purchase (F9)"}
          </button>
          <p className="text-[11px] text-slate-500">
            {isReturn
              ? "Stock goes out and the vendor's balance goes down by the return total."
              : isEdit
              ? "Reverses previous stock and recalculates average cost with new lines and freight."
              : "Stock goes up. The total is added to the vendor's khata. Freight is spread over the items' cost."}
          </p>
        </aside>
      </div>

      {/* Confirm Dialog for Purchase Edit */}
      {confirmOpen && editPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                Confirm edit for purchase {initialPurchase?.invoice.doc_no}
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
                    {formatPkr(editPreview.old_total_paisa)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">New total</div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatPkr(editPreview.new_total_paisa)}
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                <div className="font-bold">Vendor khata effect:</div>
                <div>{editPreview.vendor_diff_text}</div>
              </div>

              {/* Profit note required by handover */}
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <span>Profit of sales already made is not recalculated.</span>
              </div>

              <label className="block pt-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for editing (required, min 3 chars) *
                </span>
                <input
                  ref={reasonRef}
                  autoFocus
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editReason.trim().length >= 3) {
                      e.preventDefault();
                      commitEditSave();
                    }
                  }}
                  placeholder="e.g. Corrected quantity received, freight updated"
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
                disabled={busy || editReason.trim().length < 3}
                onClick={commitEditSave}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 flex items-center gap-1.5 shadow"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & save edit (Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full PurchaseHistory component mirroring SaleHistoryView:
 * Date range, quick keys, debounced search, keyboard table, detail panel with lines,
 * freight, landed costs, paid amount, returns, revisions, A4 printing, and editing.
 */
function PurchaseHistory({ onEdit }: { onEdit: (detail: PurchaseDetail) => void }) {
  const toast = useToast();

  const [from, setFrom] = useState(() => quick("today")[0]);
  const [to, setTo] = useState(() => quick("today")[1]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [limit] = useState(200);
  const [offset, setOffset] = useState(0);

  const [purchases, setPurchases] = useState<PurchaseListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewingRevision, setViewingRevision] = useState<{ revision: number; snapshot: any } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadPurchases = useCallback(
    async (isLoadMore = false) => {
      setLoading(true);
      try {
        const offsetMin = new Date().getTimezoneOffset();
        const res = await api.listPurchasesFiltered({
          from,
          to,
          offset_min: -offsetMin,
          query: debouncedQuery.trim() || undefined,
          limit,
          offset: isLoadMore ? offset : 0,
        });

        if (isLoadMore) {
          setPurchases((prev) => [...prev, ...res]);
        } else {
          setPurchases(res);
          if (res.length > 0) {
            setSelectedIndex(0);
            setSelectedId(res[0].id);
          } else {
            setSelectedIndex(-1);
            setSelectedId(null);
            setDetail(null);
          }
        }
      } catch (e) {
        toast.error(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [from, to, debouncedQuery, limit, offset, toast]
  );

  useEffect(() => {
    loadPurchases();
  }, [from, to, debouncedQuery, loadPurchases]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .purchaseDetail(selectedId)
      .then((d) => setDetail(d))
      .catch((e) => {
        toast.error(errorText(e));
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId, toast]);

  const printPurchase = () => {
    const el = document.getElementById("purchase-print");
    if (!el || !detail) return;
    printElement(el, { ...A4_PAGE, title: detail.invoice.doc_no });
  };

  const viewRevision = async (rev: number) => {
    if (!selectedId) return;
    try {
      const snap = await api.purchaseRevision(selectedId, rev);
      setViewingRevision({ revision: rev, snapshot: snap });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewingRevision) return;

      const isInput =
        document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const [f, t] = quick("today");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        const [f, t] = quick("yesterday");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const [f, t] = quick("week");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const [f, t] = quick("month");
        setFrom(f);
        setTo(t);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (isInput) {
          (document.activeElement as HTMLElement)?.blur();
        } else {
          setSelectedId(null);
          setSelectedIndex(-1);
        }
        return;
      }

      if (!isInput && detail) {
        if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          printPurchase();
          return;
        }
        if (e.key.toLowerCase() === "e") {
          e.preventDefault();
          if (detail.can_edit) {
            onEdit(detail);
          } else {
            toast.error(detail.edit_blocked_reason || "Cannot edit this purchase.");
          }
          return;
        }
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, purchases.length - 1);
          if (next >= 0 && purchases[next]) {
            setSelectedId(purchases[next].id);
          }
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          if (next >= 0 && purchases[next]) {
            setSelectedId(purchases[next].id);
          }
          return next;
        });
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setOffset((prev) => prev + limit);
        loadPurchases(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingRevision, detail, purchases, limit, loadPurchases, onEdit, toast]);

  return (
    <div className="flex flex-col gap-4">
      {/* Top filter bar */}
      <div className="flex flex-wrap items-end gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          From
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="block mt-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium"
          />
        </label>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          To
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="block mt-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium"
          />
        </label>

        {/* Quick Date buttons */}
        <div className="flex flex-wrap gap-1 items-end pb-0.5">
          {[
            ["today", "Today", "Alt+T"],
            ["yesterday", "Yesterday", "Alt+Y"],
            ["week", "Week", "Alt+W"],
            ["month", "Month", "Alt+M"],
          ].map(([k, label, hotkey]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                const [f, t] = quick(k);
                setFrom(f);
                setTo(t);
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 text-slate-700 dark:text-slate-300"
            >
              <span>{label}</span>
              <span className="text-[10px] opacity-60 font-mono">({hotkey})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
            Search <Key k="F2" />
          </label>
          <div className="relative">
            <input
              ref={searchInputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Invoice no, vendor, bill no, product SKU/barcode"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Table & Detail Panel */}
      <div className="flex flex-col lg:flex-row gap-4 items-start min-h-[460px]">
        {/* Table of purchases */}
        <div className="flex-1 w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold z-10">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Doc #</th>
                <th className="px-3 py-2.5">Vendor</th>
                <th className="px-3 py-2.5">Bill #</th>
                <th className="px-3 py-2.5 text-right">Items</th>
                <th className="px-3 py-2.5 text-right">Freight</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Entered by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                    Loading purchase invoices...
                  </td>
                </tr>
              )}

              {!loading && purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No purchase invoices found for the selected period.
                  </td>
                </tr>
              )}

              {purchases.map((p, idx) => {
                const isSelected = p.id === selectedId || idx === selectedIndex;
                const isEdited = p.revision > 0;
                const isReturned = p.returned_paisa > 0;

                return (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setSelectedId(p.id);
                      setSelectedIndex(idx);
                    }}
                    className={`cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-medium"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {p.doc_no}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[140px] font-semibold">{p.vendor_name}</td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]">
                      {p.vendor_invoice_no || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.item_count}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">
                      {formatPkr(p.freight_paisa)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatPkr(p.total_paisa)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        {isEdited && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Rev {p.revision}
                          </span>
                        )}
                        {isReturned && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Returned
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {p.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{p.entered_by || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right side Detail panel */}
        <aside className="w-full lg:w-[380px] shrink-0 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4 flex flex-col gap-3">
          {detailLoading && !detail && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mb-2" /> Loading purchase details...
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="py-20 text-center text-slate-400 text-xs">
              Select a purchase invoice to view, print on A4, or edit.
            </div>
          )}

          {detail && (
            <>
              {/* Action buttons */}
              <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={printPurchase}
                  title="Print on A4 (P)"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 flex items-center gap-1 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Print A4 <Key k="P" />
                </button>

                <button
                  onClick={() => {
                    if (detail.can_edit) {
                      onEdit(detail);
                    } else {
                      toast.error(detail.edit_blocked_reason || "Cannot edit this purchase.");
                    }
                  }}
                  disabled={!detail.can_edit}
                  title={detail.can_edit ? "Edit purchase (E)" : detail.edit_blocked_reason || "Editing blocked"}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                    detail.can_edit
                      ? "bg-amber-600 text-white hover:bg-amber-500 shadow-xs"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" /> Edit <Key k="E" />
                </button>

                <button
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedIndex(-1);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {detail.edit_blocked_reason && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800/60 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>{detail.edit_blocked_reason}</span>
                </div>
              )}

              {/* Printable Invoice Container */}
              <div
                id="purchase-print"
                className="overflow-y-auto max-h-[360px] rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 text-xs font-sans shadow-xs space-y-3"
              >
                <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        Purchase Invoice {detail.invoice.doc_no}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Date: {new Date(detail.invoice.created_at).toLocaleString()}
                      </div>
                    </div>
                    {(detail.invoice.revision ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Rev {detail.invoice.revision}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] space-y-0.5">
                    <div>
                      <span className="text-slate-400">Vendor:</span>{" "}
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {detail.invoice.vendor_name}
                      </span>
                    </div>
                    {detail.invoice.vendor_invoice_no && (
                      <div>
                        <span className="text-slate-400">Bill No:</span>{" "}
                        <span>{detail.invoice.vendor_invoice_no}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines */}
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Received Items
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="pb-1">Item</th>
                        <th className="pb-1 text-right">Qty</th>
                        <th className="pb-1 text-right">Cost</th>
                        <th className="pb-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {detail.invoice.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-1">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {l.product_name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{l.sku}</div>
                          </td>
                          <td className="py-1 text-right font-mono">
                            {formatQty(l.received_qty_milli, l.unit_code)}
                          </td>
                          <td className="py-1 text-right font-mono">{formatPkr(l.unit_cost_paisa)}</td>
                          <td className="py-1 text-right font-mono font-bold">
                            {formatPkr(l.total_paisa)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary numbers */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                  {detail.invoice.freight_paisa > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Freight / loading:</span>
                      <span className="font-mono">{formatPkr(detail.invoice.freight_paisa)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                    <span>Invoice Total:</span>
                    <span className="font-mono">{formatPkr(detail.invoice.total_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 pt-1">
                    <span>Paid against invoice:</span>
                    <span className="font-mono">{formatPkr(detail.paid_paisa)}</span>
                  </div>
                </div>
              </div>

              {/* Returns on this purchase */}
              {detail.returns.length > 0 && (
                <div className="space-y-1 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-rose-600 text-[11px] uppercase tracking-wider">
                    Returns to vendor
                  </div>
                  {detail.returns.map((r) => (
                    <div key={r.id} className="flex justify-between text-slate-600 dark:text-slate-400 py-0.5">
                      <span>
                        {r.doc_no}
                        {r.reason ? ` (${r.reason})` : ""}
                      </span>
                      <span className="font-mono font-bold text-rose-600">
                        −{formatPkr(r.total_paisa)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Revisions history */}
              {detail.revisions.length > 0 && (
                <div className="space-y-1 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-amber-600 text-[11px] uppercase tracking-wider">
                    Edit history
                  </div>
                  {detail.revisions.map((rev) => (
                    <button
                      key={rev.revision}
                      type="button"
                      onClick={() => viewRevision(rev.revision)}
                      className="w-full text-left p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Rev {rev.revision}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(rev.edited_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {rev.reason} · by {rev.edited_by || "System"}
                      </div>
                      <div className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 font-semibold mt-0.5">
                        Click to view old version
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Old Revision Snapshot Modal */}
      {viewingRevision && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 flex flex-col gap-3 max-h-[90vh]">
            <div className="bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 px-4 py-2 rounded-xl text-center font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2">
              <HistoryIcon className="w-4 h-4" />
              OLD VERSION, rev {viewingRevision.revision}
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {viewingRevision.snapshot.doc_no}
              </span>
              <span className="text-slate-400">
                {new Date(viewingRevision.snapshot.created_at).toLocaleString()}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs font-mono">
              <div className="space-y-1">
                <div className="font-bold text-slate-500">Items:</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(viewingRevision.snapshot.lines || []).map((l: any, i: number) => (
                    <div key={i} className="py-1 flex justify-between">
                      <div>
                        <div>Item {i + 1}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatQty(l.received_qty_milli)} × {formatPkr(l.unit_cost_paisa)}
                        </div>
                      </div>
                      <div className="font-bold">{formatPkr(l.total_paisa)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 space-y-1">
                {viewingRevision.snapshot.freight_paisa > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Freight:</span>
                    <span>{formatPkr(viewingRevision.snapshot.freight_paisa)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL:</span>
                  <span>{formatPkr(viewingRevision.snapshot.total_paisa)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                autoFocus
                onClick={() => setViewingRevision(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stock() {
  const toast = useToast();
  const [rows, setRows] = useState<InventoryBalanceView[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.stockList().then(setRows).catch((e) => (setRows([]), toast.error(errorText(e))));
  }, [toast]);
  const shown = (rows || []).filter((r) => !q || r.product_name.toLowerCase().includes(q.toLowerCase()) || r.sku.toLowerCase().includes(q.toLowerCase()) || (r.barcode || "").includes(q));
  const value = shown.reduce((s, r) => s + r.total_valuation_paisa, 0);
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="sm:w-80 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
        <div className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">Stock value at cost <b>{formatPkr(value)}</b></div>
      </div>
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
            <tr className="text-left">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2 text-right">On hand</th>
              <th className="px-3 py-2 text-right">Avg cost</th>
              <th className="px-3 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No stock yet. Receive stock with a purchase invoice.</td></tr>}
            {shown.map((r) => (
              <tr key={r.variant_id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold">{r.product_name}</td>
                <td className="px-3 py-2 text-slate-500">{r.sku}</td>
                <td className={`px-3 py-2 text-right ${r.on_hand_milli <= 0 ? "text-rose-600 font-bold" : ""}`}>{formatQty(r.on_hand_milli, r.unit_code)}</td>
                <td className="px-3 py-2 text-right">{formatPkr(r.avg_cost_paisa)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatPkr(r.total_valuation_paisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Vendors() {
  const toast = useToast();
  const [list, setList] = useState<CustomerSummary[] | null>(null);
  const [f, setF] = useState({ name: "", phone: "", ntn: "" });
  const [busy, setBusy] = useState(false);
  const load = () => api.listVendors("").then(setList).catch((e) => (setList([]), toast.error(errorText(e))));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createParty({ party_type: "vendor", name: f.name.trim(), phone: f.phone || null, ntn: f.ntn || null });
      toast.success(`Vendor ${f.name} added`);
      setF({ name: "", phone: "", ntn: "" });
      load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
            <tr className="text-left">
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {list === null && <tr><td colSpan={3} className="py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>}
            {list?.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-slate-500">No vendors yet.</td></tr>}
            {list?.map((v) => (
              <tr key={v.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-semibold">{v.name}</td>
                <td className="px-3 py-2 text-slate-500">{v.phone || "—"}</td>
                <td className="px-3 py-2 text-right font-bold">{formatPkr(Math.abs(v.balance_paisa))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="space-y-3 border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-fit">
        <h3 className="text-sm font-bold">Add vendor</h3>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Name *<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} /></label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={field} /></label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">NTN<input value={f.ntn} onChange={(e) => setF({ ...f, ntn: e.target.value })} className={field} /></label>
        <button disabled={busy || !f.name.trim()} className="w-full py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold">Save vendor</button>
      </form>
    </div>
  );
}
