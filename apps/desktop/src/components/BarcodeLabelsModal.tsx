import { useEffect, useMemo, useState } from "react";
import { Barcode, Loader2, Printer, Search, Tag, X } from "lucide-react";
import { api, errorText, formatPkr, isTauri, ProductRow } from "../lib/api";
import { barcodeModules, barcodeSvg } from "../lib/barcode";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";

type Layout = "38x25" | "50x30" | "a4";

const LAYOUTS: Record<Layout, { label: string; w: number; h: number }> = {
  "38x25": { label: "Label printer roll 38 × 25 mm", w: 38, h: 25 },
  "50x30": { label: "Label printer roll 50 × 30 mm", w: 50, h: 30 },
  a4: { label: "A4 sticker sheet (3 × 8 = 24 labels, 70 × 37 mm)", w: 70, h: 37 },
};

/**
 * Barcode labels for products: pick a product, generate a barcode if it has none,
 * then print on a label printer roll or an A4 sticker sheet.
 */
export function BarcodeLabelsModal({ isOpen, onClose, initial }: { isOpen: boolean; onClose: () => void; initial?: ProductRow | null }) {
  const toast = useToast();
  const { status, can } = useSession();
  const [product, setProduct] = useState<ProductRow | null>(initial || null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [copies, setCopies] = useState(1);
  const [layout, setLayout] = useState<Layout>("38x25");
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) setProduct(initial || null);
  }, [isOpen, initial]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api.searchProducts(q, 10).then(setResults).catch(() => setResults([])), 150);
    return () => clearTimeout(t);
  }, [q]);

  const kind = useMemo(() => {
    try {
      return product?.barcode ? barcodeModules(product.barcode).kind : null;
    } catch {
      return null;
    }
  }, [product]);

  if (!isOpen) return null;

  const generate = async () => {
    if (!product) return;
    setBusy(true);
    try {
      const code = await api.assignBarcode(product.variant_id);
      setProduct({ ...product, barcode: code });
      toast.success(`Barcode ${code} saved for ${product.name}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const L = LAYOUTS[layout];
  const store = status?.store_name || "";

  const label = (key: number) =>
    product?.barcode ? (
      <div key={key} className="nx-label" style={{ width: `${L.w}mm`, height: `${L.h}mm` }}>
        <div className="nx-store">{store}</div>
        <div className="nx-name">{product.name}</div>
        <div className="nx-bars" dangerouslySetInnerHTML={{ __html: barcodeSvg(product.barcode, L.w - 6, L.h * 0.42) }} />
        <div className="nx-row">
          <span className="nx-code">{product.barcode}</span>
          {showPrice && <span className="nx-price">{formatPkr(product.retail_price_paisa)}</span>}
        </div>
      </div>
    ) : null;

  const printWindows = () => {
    // One label per page on a roll; a grid on A4.
    const style = document.createElement("style");
    style.id = "nx-print-style";
    style.textContent =
      layout === "a4"
        ? "@page { size: A4; margin: 10mm 0 0 0; }"
        : `@page { size: ${L.w}mm ${L.h}mm; margin: 0; } .nx-sheet .nx-label { page-break-after: always; }`;
    document.head.appendChild(style);
    document.body.classList.add("nx-printing-labels");
    window.print();
    document.body.classList.remove("nx-printing-labels");
    style.remove();
  };

  const printThermal = async () => {
    if (!product || layout === "a4") return;
    setBusy(true);
    try {
      let printer: string | null = null;
      try {
        printer = localStorage.getItem("pos_label_printer_name") || localStorage.getItem("pos_printer_name");
      } catch {
        /* no storage */
      }
      await api.printLabels(product.variant_id, copies, layout, printer);
      toast.success(`${copies} label(s) sent to the label printer`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 nx-label-modal">
      <style>{`
        .nx-label { box-sizing: border-box; padding: 1.2mm 2mm; background: #fff; color: #000; overflow: hidden; display: flex; flex-direction: column; align-items: center; font-family: Arial, sans-serif; }
        .nx-store { font-size: 6.5pt; font-weight: 700; white-space: nowrap; overflow: hidden; max-width: 100%; }
        .nx-name { font-size: 7.5pt; line-height: 1.1; text-align: center; max-height: 2.3em; overflow: hidden; }
        .nx-bars { margin-top: 0.6mm; line-height: 0; }
        .nx-row { display: flex; justify-content: space-between; width: 100%; font-size: 7pt; margin-top: 0.3mm; }
        .nx-price { font-weight: 800; font-size: 8.5pt; }
        .nx-sheet.a4 { display: grid; grid-template-columns: repeat(3, 70mm); }
        @media print {
          body.nx-printing-labels * { visibility: hidden !important; }
          body.nx-printing-labels .nx-sheet, body.nx-printing-labels .nx-sheet * { visibility: visible !important; }
          body.nx-printing-labels .nx-sheet { position: fixed !important; left: 0 !important; top: 0 !important; display: block; }
          body.nx-printing-labels .nx-sheet.a4 { display: grid; }
          body.nx-printing-labels .nx-label { border: none !important; }
        }
      `}</style>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2"><Tag className="w-5 h-5 text-emerald-500" /> Barcode labels</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto grid md:grid-cols-[1fr_auto] gap-5">
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find product by name, SKU or barcode" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
              {results.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {results.map((p) => (
                    <button key={p.variant_id} onClick={() => { setProduct(p); setQ(""); setResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between">
                      <span>{p.name} <span className="text-xs text-slate-400">{p.sku}</span></span>
                      <span className="text-xs text-slate-500">{p.barcode || "no barcode"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!product ? (
              <p className="text-sm text-slate-500">Pick a product.</p>
            ) : (
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
                <div className="font-semibold">{product.name}</div>
                <div className="text-xs text-slate-500">{product.sku} · {formatPkr(product.retail_price_paisa)}</div>
                {product.barcode ? (
                  <div className="text-xs mt-1">Barcode <b className="font-mono">{product.barcode}</b>{kind && <span className="text-slate-400"> ({kind})</span>}</div>
                ) : (
                  <div className="mt-2">
                    <p className="text-xs text-amber-600 mb-2">This product has no barcode.</p>
                    {can("PriceEdit") ? (
                      <button onClick={generate} disabled={busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Barcode className="w-3.5 h-3.5" />} Generate barcode
                      </button>
                    ) : (
                      <p className="text-xs text-slate-500">An Owner or Manager can generate one.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 col-span-2">
                Paper
                <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
                  {(Object.keys(LAYOUTS) as Layout[]).map((k) => <option key={k} value={k}>{LAYOUTS[k].label}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Number of labels
                <input type="number" min={1} max={500} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm" />
              </label>
              <label className="flex items-end gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 pb-2">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={printWindows} disabled={!product?.barcode} className="px-3 py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold flex items-center gap-1">
                <Printer className="w-4 h-4" /> Print labels
              </button>
              {isTauri && layout !== "a4" && (
                <button onClick={printThermal} disabled={!product?.barcode || busy} className="px-3 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-1">
                  <Printer className="w-4 h-4" /> Send to thermal label printer
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              "Print labels" uses the normal Windows print window and works with any printer. Set the paper size in the printer settings to match.
              {isTauri && " The thermal button sends raw TSPL to TSC/Xprinter-type label printers."}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Preview</div>
            <div className="border border-dashed border-slate-300 rounded-lg inline-block bg-white">{label(-1)}</div>
          </div>
        </div>
      </div>
      {/* What actually prints */}
      <div className={`nx-sheet ${layout === "a4" ? "a4" : ""}`} style={{ position: "fixed", left: "-10000px", top: 0 }}>
        {product?.barcode && Array.from({ length: copies }).map((_, i) => label(i))}
      </div>
    </div>
  );
}
