// Phone screens. Every action is checked again on the PC (login, role,
// licence, shift, stock and price rules), exactly as at the PC counter.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, ClipboardCheck, Loader2, Minus, Pencil, Plus, ScanLine, Search, Send, Trash2, XCircle } from "lucide-react";
import {
  api,
  isTauri,
  CashSession,
  CheckoutLineInput,
  CustomerSummary,
  errorText,
  FinancialSummary,
  formatPkr,
  formatQty,
  InventoryBalanceView,
  LowStockRow,
  ProductRow,
  Quote,
  ReceiptData,
  StockCountSession,
  ReportTable,
  TopProduct,
} from "../lib/api";
import { formatCell, isNumericKind, periodText } from "../lib/exporter";
import { endOf, QUICK_RANGES, quickRange, REPORT_GROUPS } from "../lib/reportCatalog";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { buzz, cameraReady, scanBehind, scanWithCamera, stopScan } from "./camera";
import { link, LINK_EVENT, LinkState } from "./link";
import { bigBtn, card } from "./MobileApp";

const input = "w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-base";
const toPaisa = (s: string) => Math.round((parseFloat(s) || 0) * 100);
const toMilli = (s: string) => Math.round((parseFloat(s) || 0) * 1000);

function useAsk() {
  const toast = useToast();
  return useCallback((t: string, l: string) => toast.prompt(t, l), [toast]);
}

/** Search box with a camera button. */
function FindBar({ value, onChange, onCamera, placeholder }: { value: string; onChange: (v: string) => void; onCamera: () => void; placeholder: string }) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="w-4 h-4 absolute left-3 top-4 text-slate-400" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${input} pl-9`} />
      </div>
      <button onClick={onCamera} aria-label="Scan with camera" className="px-4 rounded-xl bg-emerald-600 text-white"><Camera className="w-6 h-6" /></button>
    </div>
  );
}

// ------------------------------------------------------------ scanner for the PC

interface Sent {
  code: string;
  ok: boolean;
  msg: string;
  at: Date;
}

export function ScannerScreen() {
  const toast = useToast();
  const ask = useAsk();
  const [keep, setKeep] = useState(true);
  const [history, setHistory] = useState<Sent[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (code: string) => {
    try {
      await link.scan(code);
      buzz();
      setHistory((h) => [{ code, ok: true, msg: "Sent to PC", at: new Date() }, ...h].slice(0, 30));
      return true;
    } catch (e) {
      setHistory((h) => [{ code, ok: false, msg: errorText(e), at: new Date() }, ...h].slice(0, 30));
      toast.error(errorText(e));
      return false;
    }
  };

  const scan = async () => {
    setBusy(true);
    try {
      // Keep the camera open scan after scan until the person cancels.
      for (;;) {
        const code = await scanWithCamera(ask);
        if (!code) break;
        const ok = await send(code);
        if (!keep || !ok) break;
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className={`${card} p-5 space-y-4 text-center`}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Barcodes go to the screen open on the PC: <b>Sale</b>, a <b>new purchase</b>, or <b>Stock count</b>.
        </p>
        <button onClick={scan} disabled={busy} className={`${bigBtn} bg-emerald-600 text-white py-6 text-lg`}>
          {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-7 h-7" />} Scan
        </button>
        <label className="flex items-center justify-center gap-2 text-sm">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="w-5 h-5" /> Keep scanning (camera stays open)
        </label>
        <div className="flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a barcode" inputMode="numeric" className={input} />
          <button
            onClick={async () => {
              if (typed.trim() && (await send(typed.trim()))) setTyped("");
            }}
            aria-label="Send barcode"
            className="px-4 rounded-xl bg-slate-800 text-white"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
      {history.length > 0 && (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {history.map((h, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              {h.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="font-mono font-semibold">{h.code}</div>
                <div className={`text-xs ${h.ok ? "text-slate-500" : "text-rose-600"}`}>{h.msg}</div>
              </div>
              <div className="text-xs text-slate-400">{h.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ sale

// ------------------------------------------------------------ keep scanning (sale screen)

interface ScanNote {
  ok: boolean;
  text: string;
}

/**
 * Camera stays on: every barcode is added to the sale, then the camera opens again
 * for the next item. "Complete scan" closes it and shows the sale with all items.
 * The camera is drawn behind the app, so this screen keeps only a frame and buttons.
 */
function KeepScanning({ onCode, onDone }: { onCode: (code: string) => Promise<ScanNote>; onDone: () => void }) {
  const [count, setCount] = useState(0);
  const [last, setLast] = useState<ScanNote | null>(null);
  const [paused, setPaused] = useState(false); // short pause after each scan (shows what was added)
  const [typed, setTyped] = useState("");
  const running = useRef(true);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const handle = useCallback(async (code: string) => {
    const note = await onCodeRef.current(code).catch((e) => ({ ok: false, text: errorText(e) }));
    setLast(note);
    if (note.ok) {
      setCount((c) => c + 1);
      buzz(80);
    } else {
      buzz(300);
    }
  }, []);

  useEffect(() => {
    running.current = true;
    document.documentElement.classList.add("np-scanning");
    if (isTauri) {
      (async () => {
        try {
          await cameraReady();
          while (running.current) {
            setPaused(false);
            const code = await scanBehind();
            if (!running.current || code === null) break;
            setPaused(true);
            await handle(code);
            // Time to move the phone to the next item (stops one item counting twice).
            await new Promise((r) => setTimeout(r, 900));
          }
        } catch (e) {
          setLast({ ok: false, text: errorText(e) });
          setPaused(true);
        }
      })();
    }
    return () => {
      running.current = false;
      document.documentElement.classList.remove("np-scanning");
      stopScan();
    };
  }, [handle]);

  const finish = () => {
    running.current = false;
    stopScan();
    onDone();
  };

  const camLive = isTauri && !paused;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col text-white" style={{ visibility: "visible" }}>
      <style>{`html.np-scanning, html.np-scanning body { background: transparent !important; } html.np-scanning #root { visibility: hidden; }`}</style>
      <div className="bg-black/70 px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2"><ScanLine className="w-5 h-5" /> Keep scanning</div>
        <div className="text-sm font-semibold">{count} scanned</div>
      </div>

      <div className={`flex-1 flex items-center justify-center ${camLive ? "" : "bg-slate-900"}`}>
        {camLive ? (
          <div className="w-72 h-44 rounded-2xl border-4 border-emerald-400/90" />
        ) : (
          <div className="text-center px-6">
            {last ? (
              <>
                {last.ok ? <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-400" /> : <XCircle className="w-16 h-16 mx-auto text-rose-400" />}
                <div className={`mt-2 text-lg font-bold ${last.ok ? "text-emerald-300" : "text-rose-300"}`}>{last.text}</div>
              </>
            ) : (
              <div className="text-slate-300">{isTauri ? "Opening camera…" : "Browser test mode: type a barcode below."}</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-black/80 p-4 space-y-3">
        {camLive && last && <div className={`text-sm font-semibold truncate ${last.ok ? "text-emerald-300" : "text-rose-300"}`}>{last.text}</div>}
        {!isTauri && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const c = typed.trim();
              setTyped("");
              if (c) handle(c);
            }}
            className="flex gap-2"
          >
            <input aria-label="Barcode" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Barcode" className="flex-1 px-4 py-3 rounded-xl bg-white text-slate-900 text-base" />
            <button className="px-4 rounded-xl bg-slate-700 font-semibold">Add</button>
          </form>
        )}
        <button onClick={finish} className={`${bigBtn} bg-emerald-600 text-white`}>
          <CheckCircle2 className="w-5 h-5" /> Complete scan{count ? ` (${count})` : ""}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ------------------------------------------------------------ sale

export function SaleScreen() {
  const toast = useToast();
  const ask = useAsk();
  const [shift, setShift] = useState<CashSession | null | undefined>(undefined);
  const [opening, setOpening] = useState("");
  const [lines, setLines] = useState<CheckoutLineInput[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<ReceiptData | null>(null);
  const [keepScanning, setKeepScanning] = useState(false);

  const loadShift = useCallback(() => {
    api.activeShift().then(setShift).catch((e) => (setShift(null), toast.error(errorText(e))));
  }, [toast]);
  useEffect(loadShift, [loadShift]);

  useEffect(() => {
    if (!lines.length) return setQuote(null);
    let stale = false;
    api
      .quote(null, lines)
      .then((r) => !stale && setQuote(r))
      .catch((e) => toast.error(errorText(e)));
    return () => {
      stale = true;
    };
  }, [lines, toast]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api.searchSellable(q, 10).then(setResults).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  const addLine = (variant_id: string, unit_id: string, qty_milli: number) => {
    buzz();
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variant_id === variant_id && l.unit_id === unit_id && !l.price_override_paisa);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty_milli: l.qty_milli + qty_milli } : l));
      return [...prev, { variant_id, unit_id, qty_milli, discount_paisa: 0 }];
    });
  };

  const camera = async () => {
    try {
      const code = await scanWithCamera(ask);
      if (!code) return;
      const hit = await api.scanCode(code);
      if (hit) addLine(hit.product.variant_id, hit.unit_id, hit.qty_milli);
      else toast.error(`No product with barcode "${code}"`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const keepScanCode = async (code: string): Promise<ScanNote> => {
    const hit = await api.scanCode(code);
    if (!hit) return { ok: false, text: `No product with barcode "${code}"` };
    addLine(hit.product.variant_id, hit.unit_id, hit.qty_milli);
    return { ok: true, text: `${hit.product.name} added` };
  };

  const editPrice = async (i: number) => {
    const ql = quote?.lines[i];
    if (!ql) return;
    const min = ql.min_price_paisa;
    const typed = await toast.prompt(`Price for ${ql.name}`, "Price (Rs)", {
      type: "number",
      initial: String(ql.unit_price_paisa / 100),
      message: `Sale price ${formatPkr(ql.catalog_price_paisa)}`,
    });
    if (typed === null) return;
    const p = toPaisa(typed);
    if (p <= 0) return toast.error("Enter a price.");
    if (min !== null && p < min) return toast.error(`Price for ${ql.name} is below the wholesale price.`);
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, price_override_paisa: p === ql.catalog_price_paisa ? null : p } : l)));
  };

  const setQty = (i: number, milli: number) => {
    if (milli <= 0) setLines((prev) => prev.filter((_, j) => j !== i));
    else setLines((prev) => prev.map((l, j) => (j === i ? { ...l, qty_milli: milli } : l)));
  };

  if (shift === undefined) return <div className="p-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>;
  if (shift === null)
    return (
      <div className="p-4">
        <div className={`${card} p-5 space-y-3`}>
          <h2 className="font-bold text-lg">Start your shift</h2>
          <p className="text-sm text-slate-500">Cash you have with you now (Rs). Use 0 if none.</p>
          <input aria-label="Opening cash" value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0" className={input} />
          <button
            onClick={async () => {
              try {
                setShift(await api.startShift(toPaisa(opening)));
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
            className={`${bigBtn} bg-emerald-600 text-white`}
          >
            Start shift
          </button>
        </div>
      </div>
    );

  if (done)
    return (
      <div className="p-4">
        <div className={`${card} p-6 text-center space-y-2`}>
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
          <div className="text-xl font-extrabold">Sale saved</div>
          <div className="text-sm text-slate-500">{done.sale.doc_no}</div>
          <div className="text-3xl font-extrabold pt-2">{formatPkr(done.sale.total_paisa)}</div>
          {done.sale.change_paisa > 0 && <div className="text-lg font-bold text-amber-600">Change {formatPkr(done.sale.change_paisa)}</div>}
          {done.sale.customer_name && <div className="text-sm">Customer: {done.sale.customer_name}</div>}
          <div className="text-left text-sm border-t border-slate-100 dark:border-slate-800 pt-3 mt-3 space-y-1">
            {done.sale.lines.map((l) => (
              <div key={l.id} className="flex justify-between gap-2">
                <span className="truncate">{l.product_name} × {formatQty(l.qty_milli, l.unit_code)}</span>
                <span>{formatPkr(l.total_paisa)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setDone(null)} className={`${bigBtn} bg-emerald-600 text-white mt-4`}>New sale</button>
        </div>
      </div>
    );

  return (
    <div className="p-4 space-y-3">
      <FindBar value={q} onChange={setQ} onCamera={camera} placeholder="Product name or SKU" />
      <button onClick={() => setKeepScanning(true)} className={`${bigBtn} bg-slate-900 dark:bg-slate-700 text-white`}>
        <ScanLine className="w-5 h-5" /> Keep scanning
      </button>
      {keepScanning && <KeepScanning onCode={keepScanCode} onDone={() => setKeepScanning(false)} />}
      {results.length > 0 && (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto`}>
          {results.map((p) => (
            <button key={p.variant_id} onClick={() => (addLine(p.variant_id, p.base_unit_id, 1000), setQ(""), setResults([]))} className="w-full text-left px-4 py-3 flex justify-between gap-2">
              <span className="min-w-0">
                <span className="font-semibold block truncate">{p.name}</span>
                <span className="text-xs text-slate-500">Stock {formatQty(p.on_hand_milli, p.base_unit_code)}</span>
              </span>
              <span className="font-bold">{formatPkr(p.retail_price_paisa)}</span>
            </button>
          ))}
        </div>
      )}

      {lines.length === 0 && <p className="text-center text-sm text-slate-500 py-10">Scan or search a product to start a sale.</p>}

      {quote && lines.length > 0 && (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {quote.lines.map((l, i) => {
            const short = l.qty_milli > l.on_hand_milli;
            const changed = l.unit_price_paisa !== l.catalog_price_paisa;
            return (
              <div key={`${l.variant_id}-${i}`} className="px-4 py-3 space-y-2">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{l.name}</div>
                    <div className={`text-xs ${short ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
                      Stock {formatQty(l.on_hand_milli, l.unit_code)}{short ? " · not enough" : ""}
                    </div>
                  </div>
                  <div className="text-right font-bold">{formatPkr(l.total_paisa)}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => editPrice(i)} title="Change price" className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1 ${changed ? "bg-amber-100 text-amber-800" : "bg-slate-100 dark:bg-slate-800"}`}>
                    {formatPkr(l.unit_price_paisa)} <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(i, lines[i].qty_milli - 1000)} aria-label="One less" className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">{lines[i].qty_milli <= 1000 ? <Trash2 className="w-4 h-4 text-rose-600" /> : <Minus className="w-4 h-4" />}</button>
                    <span className="min-w-[3rem] text-center font-bold">{formatQty(l.qty_milli, l.unit_code)}</span>
                    <button onClick={() => setQty(i, lines[i].qty_milli + 1000)} aria-label="One more" className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                {changed && <div className="text-xs text-amber-700">price changed from {formatPkr(l.catalog_price_paisa)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {quote && lines.length > 0 && (
        <div className="fixed bottom-16 inset-x-0 px-4 pb-2 z-20">
          <button onClick={() => setPaying(true)} className={`${bigBtn} bg-emerald-600 text-white shadow-lg justify-between px-5`}>
            <span>{quote.lines.length} item{quote.lines.length > 1 ? "s" : ""} · Charge</span>
            <span className="text-xl">{formatPkr(quote.total_paisa)}</span>
          </button>
        </div>
      )}

      {paying && quote && (
        <PaySheet
          total={quote.total_paisa}
          onClose={() => setPaying(false)}
          onPay={async (customer, tender) => {
            try {
              const r = await api.checkout({ customer_id: customer?.id ?? null, lines, global_discount_paisa: 0, tenders: [tender] });
              setPaying(false);
              setLines([]);
              setDone(r);
              buzz(120);
            } catch (e) {
              toast.error(errorText(e));
            }
          }}
        />
      )}
    </div>
  );
}

function PaySheet({ total, onClose, onPay }: { total: number; onClose: () => void; onPay: (c: CustomerSummary | null, t: { method: "cash" | "credit"; amount_paisa: number; reference: null }) => Promise<void> }) {
  const [method, setMethod] = useState<"cash" | "credit">("cash");
  const [given, setGiven] = useState(String(total / 100));
  const [busy, setBusy] = useState(false);
  const [cq, setCq] = useState("");
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);

  useEffect(() => {
    if (method !== "credit") return;
    const t = setTimeout(() => api.listCustomers(cq).then(setCustomers).catch(() => setCustomers([])), 200);
    return () => clearTimeout(t);
  }, [cq, method]);

  const paid = toPaisa(given);
  const change = paid - total;
  const ok = method === "cash" ? paid >= total : !!customer;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
      <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-baseline">
          <h2 className="text-lg font-bold">Payment</h2>
          <div className="text-2xl font-extrabold">{formatPkr(total)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["cash", "credit"] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)} className={`py-3 rounded-xl font-bold ${method === m ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800"}`}>
              {m === "cash" ? "Cash" : "Khata (credit)"}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <div className="space-y-2">
            <label className="text-sm font-semibold block">
              Cash received (Rs)
              <input aria-label="Cash received" value={given} onChange={(e) => setGiven(e.target.value)} inputMode="decimal" className={`${input} mt-1 text-xl font-bold`} />
            </label>
            <div className={`text-lg font-bold ${change < 0 ? "text-rose-600" : "text-amber-600"}`}>{change < 0 ? `Short ${formatPkr(-change)}` : `Change ${formatPkr(change)}`}</div>
          </div>
        ) : (
          <div className="space-y-2">
            <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Find customer" className={input} />
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {customers.map((c) => (
                <button key={c.id} onClick={() => setCustomer(c)} className={`w-full text-left px-3 py-2.5 flex justify-between ${customer?.id === c.id ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>
                  <span>{c.name}{c.phone ? <span className="text-xs text-slate-500"> · {c.phone}</span> : null}</span>
                  <span className="text-xs text-slate-500">due {formatPkr(c.balance_paisa)}</span>
                </button>
              ))}
              {customers.length === 0 && <div className="text-sm text-slate-500 p-2">No customers. Add customers on the PC (Khata).</div>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button onClick={onClose} className={`${bigBtn} bg-slate-100 dark:bg-slate-800`}>Back</button>
          <button
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              await onPay(method === "credit" ? customer : null, { method, amount_paisa: method === "cash" ? paid : total, reference: null });
              setBusy(false);
            }}
            className={`${bigBtn} bg-emerald-600 text-white`}
          >
            {busy && <Loader2 className="w-5 h-5 animate-spin" />} Complete sale
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ stock and stock count

const STOCK_CACHE = "nextpos_phone_stock";
const countKey = (id: string) => `nextpos_phone_count_${id}`;
const COUNT_SESSION = "nextpos_phone_count_session";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* no storage */
  }
}

export function StockScreen() {
  const toast = useToast();
  const ask = useAsk();
  const { can } = useSession();
  const [view, setView] = useState<"list" | "count">("list");
  const [stock, setStock] = useState<InventoryBalanceView[]>(() => readJson(STOCK_CACHE, []));
  const [q, setQ] = useState("");
  const [session, setSession] = useState<StockCountSession | null | undefined>(undefined);
  const [cachedSession, setCachedSession] = useState<{ id: string; doc_no: string } | null>(() => readJson(COUNT_SESSION, null));
  const sessionId = session?.id || cachedSession?.id || null;
  const [pending, setPending] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);

  const loadStock = useCallback(() => {
    api
      .stockList()
      .then((s) => (setStock(s), writeJson(STOCK_CACHE, s)))
      .catch(() => undefined);
  }, []);
  useEffect(loadStock, [loadStock]);

  const loadSession = useCallback(() => {
    if (!can("InventoryAdjust")) return setSession(null);
    api
      .currentStockCount()
      .then((s) => {
        setSession(s);
        const c = s ? { id: s.id, doc_no: s.doc_no } : null;
        setCachedSession(c);
        writeJson(COUNT_SESSION, c);
      })
      .catch(() => setSession((cur) => (cur === undefined ? null : cur)));
  }, [can]);
  useEffect(loadSession, [loadSession]);

  useEffect(() => {
    if (sessionId) setPending(readJson(countKey(sessionId), {}));
  }, [sessionId]);

  const savePending = (p: Record<string, number>) => {
    setPending(p);
    if (sessionId) writeJson(countKey(sessionId), Object.keys(p).length ? p : null);
  };

  const sendCounts = useCallback(async () => {
    if (!sessionId) return;
    const items = Object.entries(readJson<Record<string, number>>(countKey(sessionId), {})).map(([variant_id, counted_qty_milli]) => ({ variant_id, counted_qty_milli }));
    if (!items.length) return;
    setSending(true);
    try {
      await api.recordStockCounts(sessionId, items);
      writeJson(countKey(sessionId), null);
      setPending({});
      toast.success(`${items.length} count${items.length > 1 ? "s" : ""} saved on the PC`);
      loadSession();
      loadStock();
    } catch (e) {
      toast.error(`${errorText(e)} Counts are kept on this phone.`);
    } finally {
      setSending(false);
    }
  }, [sessionId, toast, loadSession, loadStock]);

  // Send waiting counts as soon as the PC is reachable again.
  useEffect(() => {
    const f = (e: Event) => {
      if ((e as CustomEvent<LinkState>).detail === "online" && sessionId && Object.keys(readJson(countKey(sessionId), {})).length) sendCounts();
    };
    window.addEventListener(LINK_EVENT, f);
    return () => window.removeEventListener(LINK_EVENT, f);
  }, [sessionId, sendCounts]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stock;
    return stock.filter((r) => r.product_name.toLowerCase().includes(t) || r.sku.toLowerCase().includes(t) || (r.barcode || "") === q.trim());
  }, [q, stock]);

  const countItem = async (r: InventoryBalanceView) => {
    const prev = pending[r.variant_id] ?? session?.lines.find((l) => l.variant_id === r.variant_id)?.counted_qty_milli;
    const typed = await toast.prompt(`Count: ${r.product_name}`, `How many on the shelf? (${r.unit_code})`, { type: "number", initial: prev !== undefined ? String(prev / 1000) : "" });
    if (typed === null || typed.trim() === "") return;
    savePending({ ...pending, [r.variant_id]: toMilli(typed) });
    setQ("");
  };

  const camera = async () => {
    try {
      const code = await scanWithCamera(ask);
      if (!code) return;
      buzz();
      const hit = stock.find((r) => r.barcode === code || r.sku === code);
      if (!hit) return toast.error(`No product with barcode "${code}"`);
      if (view === "count") await countItem(hit);
      else setQ(code);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const pendingCount = Object.keys(pending).length;

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setView("list")} className={`py-2.5 rounded-xl font-bold text-sm ${view === "list" ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"}`}>Stock</button>
        <button onClick={() => setView("count")} disabled={!can("InventoryAdjust")} className={`py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 ${view === "count" ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"}`}>Stock count</button>
      </div>

      {view === "count" && !sessionId && session !== undefined && (
        <div className={`${card} p-5 space-y-3 text-center`}>
          <ClipboardCheck className="w-10 h-10 mx-auto text-amber-500" />
          <p className="text-sm text-slate-500">No stock count is open.</p>
          <button
            onClick={async () => {
              try {
                await api.startStockCount(null);
                loadSession();
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
            className={`${bigBtn} bg-emerald-600 text-white`}
          >
            Start a stock count
          </button>
        </div>
      )}

      {view === "count" && sessionId && (
        <div className={`${card} p-4 space-y-2`}>
          <div className="flex justify-between text-sm">
            <span className="font-bold">Count {session?.doc_no || cachedSession?.doc_no}</span>
            <span className="text-slate-500">{session?.lines.length ?? 0} saved on PC</span>
          </div>
          <button onClick={sendCounts} disabled={!pendingCount || sending} className={`${bigBtn} bg-slate-800 text-white py-3 text-sm`}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {pendingCount ? `Save ${pendingCount} count${pendingCount > 1 ? "s" : ""} to PC` : "All counts saved"}
          </button>
          <p className="text-xs text-slate-500">Tap a product or scan it to enter its count. Counts wait on this phone if the PC is not reachable. The Owner or Manager applies the count on the PC.</p>
        </div>
      )}

      {(view === "list" || sessionId) && (
        <>
          <FindBar value={q} onChange={setQ} onCamera={camera} placeholder="Find product" />
          <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
            {shown.slice(0, 200).map((r) => {
              const counted = pending[r.variant_id] ?? session?.lines.find((l) => l.variant_id === r.variant_id)?.counted_qty_milli;
              const isPending = pending[r.variant_id] !== undefined;
              const row = (
                <>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.product_name}</div>
                    <div className="text-xs text-slate-500">{r.sku}{r.barcode ? ` · ${r.barcode}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold ${r.on_hand_milli <= 0 ? "text-rose-600" : ""}`}>{formatQty(r.on_hand_milli, r.unit_code)}</div>
                    {view === "count" && counted !== undefined && (
                      <div className={`text-xs font-semibold ${isPending ? "text-amber-600" : "text-emerald-600"}`}>counted {formatQty(counted)}{isPending ? " · not sent" : ""}</div>
                    )}
                  </div>
                </>
              );
              return view === "count" ? (
                <button key={r.variant_id} onClick={() => countItem(r)} className="w-full text-left px-4 py-3 flex justify-between gap-3">{row}</button>
              ) : (
                <div key={r.variant_id} className="px-4 py-3 flex justify-between gap-3">{row}</div>
              );
            })}
            {shown.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No products found.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ purchase (receive stock)

interface DraftLine {
  product: ProductRow;
  qty: string;
  cost: string;
}

export function PurchaseScreen() {
  const toast = useToast();
  const ask = useAsk();
  const [vendors, setVendors] = useState<CustomerSummary[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [billNo, setBillNo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.listVendors("").then((v) => (setVendors(v), v[0] && setVendorId(v[0].id))).catch((e) => toast.error(errorText(e)));
  }, [toast]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api.searchProducts(q, 10).then(setResults).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  const add = (p: ProductRow) => {
    buzz();
    setLines((l) => {
      const i = l.findIndex((x) => x.product.variant_id === p.variant_id);
      if (i >= 0) return l.map((x, j) => (j === i ? { ...x, qty: String((parseFloat(x.qty) || 0) + 1) } : x));
      return [...l, { product: p, qty: "1", cost: p.avg_cost_paisa ? String(p.avg_cost_paisa / 100) : "" }];
    });
    setQ("");
    setResults([]);
  };

  const camera = async () => {
    try {
      const code = await scanWithCamera(ask);
      if (!code) return;
      const found = (await api.searchProducts(code, 5)).find((p) => p.barcode === code || p.sku === code);
      if (found) add(found);
      else toast.error(`No product with barcode "${code}". Add the product on the PC first.`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const newVendor = async () => {
    const name = await toast.prompt("New vendor", "Vendor / company name");
    if (!name?.trim()) return;
    const phone = await toast.prompt("New vendor", "Phone (optional)");
    try {
      const v = await api.createParty({ party_type: "vendor", name: name.trim(), phone: phone?.trim() || null });
      setVendors((list) => [...list, v]);
      setVendorId(v.id);
      toast.success(`Vendor ${v.name} added`);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const total = lines.reduce((s, l) => s + Math.round((toMilli(l.qty) * toPaisa(l.cost)) / 1000), 0);
  const bad = !vendorId || !lines.length || lines.some((l) => toMilli(l.qty) <= 0 || l.cost === "" || toPaisa(l.cost) < 0);

  const save = async () => {
    setBusy(true);
    try {
      const inv = await api.postPurchase({
        vendor_id: vendorId,
        vendor_invoice_no: billNo.trim() || null,
        freight_paisa: 0,
        lines: lines.map((l) => ({ variant_id: l.product.variant_id, unit_id: l.product.base_unit_id, received_qty_milli: toMilli(l.qty), unit_cost_paisa: toPaisa(l.cost) })),
      });
      toast.success(`Purchase ${inv.doc_no} saved. Stock updated.`);
      setLines([]);
      setBillNo("");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className={`${card} p-4 space-y-3`}>
        <label className="text-sm font-semibold block">
          Vendor
          <div className="flex gap-2 mt-1">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={input}>
              {vendors.length === 0 && <option value="">No vendors yet</option>}
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button onClick={newVendor} className="px-4 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold flex items-center gap-1"><Plus className="w-4 h-4" /> New</button>
          </div>
        </label>
        <input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Vendor bill no. (optional)" className={input} />
      </div>
      <FindBar value={q} onChange={setQ} onCamera={camera} placeholder="Add product" />
      {results.length > 0 && (
        <div className={`${card} divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto`}>
          {results.map((p) => (
            <button key={p.variant_id} onClick={() => add(p)} className="w-full text-left px-4 py-3 flex justify-between gap-2">
              <span className="font-semibold truncate">{p.name}</span>
              <span className="text-xs text-slate-500">stock {formatQty(p.on_hand_milli, p.base_unit_code)}</span>
            </button>
          ))}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={l.product.variant_id} className={`${card} p-4 space-y-2`}>
          <div className="flex justify-between gap-2">
            <div className="font-semibold">{l.product.name}</div>
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 className="w-5 h-5 text-rose-500" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">
              Qty received ({l.product.base_unit_code})
              <input aria-label="Qty received" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-semibold">
              Cost per unit (Rs)
              <input aria-label="Cost per unit" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} inputMode="decimal" className={`${input} mt-1`} />
            </label>
          </div>
        </div>
      ))}
      {lines.length > 0 && (
        <button onClick={save} disabled={bad || busy} className={`${bigBtn} bg-emerald-600 text-white justify-between px-5`}>
          <span className="flex items-center gap-2">{busy && <Loader2 className="w-5 h-5 animate-spin" />} Save and add to stock</span>
          <span>{formatPkr(total)}</span>
        </button>
      )}
      {lines.length === 0 && <p className="text-center text-sm text-slate-500 py-6">Scan or search the products you received.</p>}
    </div>
  );
}

// ------------------------------------------------------------ reports (today)

/** Today at a glance (top of the Reports tab). */
function TodaySummary() {
  const toast = useToast();
  const { can } = useSession();
  const [sum, setSum] = useState<FinancialSummary | null>(null);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [low, setLow] = useState<LowStockRow[]>([]);
  const [due, setDue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const [from, to] = [start.toISOString(), end.toISOString()];
    try {
      const [s, t, a] = await Promise.all([api.financialSummary(from, to), api.topProducts(from, to, 5), api.aging("customer")]);
      setSum(s);
      setTop(t);
      setDue(a.reduce((x, b) => x + b.amount_paisa, 0));
      if (can("InventoryAdjust")) setLow(await api.lowStock());
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [toast, can]);
  useEffect(() => {
    load();
  }, [load]);

  const tile = (label: string, value: string, tone = "") => (
    <div className={`${card} p-4`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-extrabold mt-1 ${tone}`}>{value}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-bold text-lg">Today</h2>
        <button onClick={load} className="text-sm font-semibold text-emerald-700">{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {sum && (
        <div className="grid grid-cols-2 gap-3">
          {tile("Sales", formatPkr(sum.net_sales_paisa), "text-emerald-700")}
          {tile("Bills", String(sum.sales_count))}
          {tile("Profit", formatPkr(sum.gross_profit_paisa))}
          {tile("Khata to receive", formatPkr(due), "text-amber-700")}
        </div>
      )}
      {sum && sum.tender_breakdown.length > 0 && (
        <div className={`${card} p-4 text-sm space-y-1`}>
          <div className="font-bold mb-1">Payments</div>
          {sum.tender_breakdown.map(([m, v]) => (
            <div key={m} className="flex justify-between"><span className="capitalize">{m === "credit" ? "khata" : m}</span><span className="font-semibold">{formatPkr(v)}</span></div>
          ))}
        </div>
      )}
      {top.length > 0 && (
        <div className={`${card} p-4 text-sm space-y-1`}>
          <div className="font-bold mb-1">Top products today</div>
          {top.map((t) => (
            <div key={t.variant_id} className="flex justify-between gap-2"><span className="truncate">{t.name} × {formatQty(t.qty_sold_milli)}</span><span className="font-semibold">{formatPkr(t.revenue_paisa)}</span></div>
          ))}
        </div>
      )}
      {low.length > 0 && (
        <div className={`${card} p-4 text-sm space-y-1`}>
          <div className="font-bold mb-1 text-rose-700">Low stock ({low.length})</div>
          {low.slice(0, 15).map((r) => (
            <div key={r.variant_id} className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className="font-semibold text-rose-600">{formatQty(r.on_hand_milli, r.unit_code)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ all reports (same as the PC)

/** Reports tab: today's summary on top, then every report the PC has. */
export function ReportsScreen() {
  const { can } = useSession();
  const [kind, setKind] = useState<string | null>(null);
  const items = REPORT_GROUPS.flatMap((g) => g.items).filter((i) => !i.owner || can("SettingsManage"));
  const current = items.find((i) => i.kind === kind);
  if (kind && current) return <ReportDetail kind={kind} label={current.label} onBack={() => setKind(null)} />;
  return (
    <div>
      <TodaySummary />
      <ReportMenu ownerReports={can("SettingsManage")} onPick={setKind} />
    </div>
  );
}

/** Every report, grouped like the PC (used by the shop link and by Next POS Cloud). */
export function ReportMenu({ ownerReports, onPick }: { ownerReports: boolean; onPick: (kind: string) => void }) {
  const groups = REPORT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.owner || ownerReports) })).filter((g) => g.items.length);
  return (
    <div className="px-4 pb-6 space-y-3">
      <h2 className="font-bold text-lg">All reports</h2>
      {groups.map((g) => (
        <div key={g.title} className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide font-bold text-slate-400">{g.title}</div>
          {g.items.map((i) => (
            <button key={i.kind} onClick={() => onPick(i.kind)} className="w-full text-left px-4 py-3 flex items-center justify-between font-semibold">
              {i.label}
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

const reportFromPc = (kind: string, from: string, to: string) => api.report(kind, from, to);

/** One report for a from – to period, with search, summary and the full table. */
export function ReportDetail({
  kind,
  label,
  onBack,
  load = reportFromPc,
  subtitle,
}: {
  kind: string;
  label: string;
  onBack: () => void;
  /** Where the report comes from: the shop PC (default) or Next POS Cloud. */
  load?: (kind: string, from: string, to: string) => Promise<ReportTable>;
  subtitle?: string;
}) {
  const toast = useToast();
  const [from, setFrom] = useState(() => quickRange("today")[0]);
  const [to, setTo] = useState(() => quickRange("today")[1]);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const dated = !kind.startsWith("list_");

  const run = useCallback(
    async (f: string, t: string) => {
      if (f > t) return toast.error("The 'from' date is after the 'to' date.");
      setLoading(true);
      try {
        setTable(await load(kind, new Date(`${f}T00:00:00`).toISOString(), endOf(t)));
      } catch (e) {
        setTable(null);
        toast.error(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, toast, load]
  );
  useEffect(() => {
    run(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, load]);

  const statusCol = table?.columns.findIndex((c) => c.key === "status") ?? -1;
  const shown = useMemo(() => {
    if (!table) return null;
    const q = filter.trim().toLowerCase();
    let rows = table.rows;
    if (kind === "stock" && onlyLow && statusCol >= 0) rows = rows.filter((r) => r[statusCol]);
    if (q) rows = rows.filter((r) => r.some((v) => String(v ?? "").toLowerCase().includes(q)));
    if (rows === table.rows) return table;
    const totals = table.totals.length
      ? table.totals.map((v, i) => (typeof v === "number" ? rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : v))
      : [];
    return { ...table, rows, totals, note: [table.note, `Filtered: ${rows.length} of ${table.rows.length} rows.`].filter(Boolean).join(" ") };
  }, [table, filter, onlyLow, kind, statusCol]);

  return (
    <div className="p-4 space-y-3 pb-8">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back to reports" className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{label}</h2>
          {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />}
      </div>

      {dated && (
        <div className={`${card} p-3 space-y-2`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_RANGES.map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  const [f, t] = quickRange(k);
                  setFrom(f);
                  setTo(t);
                  run(f, t);
                }}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800"
              >
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-500">From<input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} mt-1 py-2`} /></label>
            <label className="text-xs font-semibold text-slate-500">To<input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} mt-1 py-2`} /></label>
          </div>
          <button onClick={() => run(from, to)} className={`${bigBtn} bg-emerald-600 text-white py-2.5`}>Show report</button>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-4 text-slate-400" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search in this report" className={`${input} pl-9`} />
      </div>
      {kind === "stock" && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="w-5 h-5" /> Only low / out of stock
        </label>
      )}

      {shown && (
        <>
          <div className="text-xs text-slate-500">{periodText(shown)}</div>
          {shown.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {shown.summary.map((s) => (
                <div key={s.label} className={`${card} p-3`}>
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                  <div className="text-base font-extrabold mt-0.5">{formatCell(s.value, s.kind)}</div>
                </div>
              ))}
            </div>
          )}
          <div className={`${card} overflow-x-auto`}>
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {shown.columns.map((c) => (
                    <th key={c.key} className={`px-3 py-2 font-bold whitespace-nowrap ${isNumericKind(c.kind) ? "text-right" : "text-left"}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.rows.length === 0 && (
                  <tr><td colSpan={shown.columns.length} className="px-3 py-6 text-center text-slate-500">Nothing in this period.</td></tr>
                )}
                {shown.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className={`px-3 py-2 whitespace-nowrap ${isNumericKind(shown.columns[j].kind) ? "text-right" : ""}`}>{formatCell(v, shown.columns[j].kind)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {shown.totals.length > 0 && shown.rows.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                  <tr>
                    {shown.totals.map((v, j) => (
                      <td key={j} className={`px-3 py-2 whitespace-nowrap ${isNumericKind(shown.columns[j].kind) ? "text-right" : ""}`}>{typeof v === "string" ? v : formatCell(v, shown.columns[j].kind)}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {shown.note && <div className="text-xs text-slate-500">{shown.note}</div>}
        </>
      )}
    </div>
  );
}
