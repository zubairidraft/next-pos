import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  Scale,
  Smartphone,
  Shirt,
  Search,
  CheckCircle,
  Plus,
  QrCode,
} from "lucide-react";
import { useToast } from "../lib/toast";

export function IndustryPacksView() {
  const toast = useToast();
  const { t } = useTranslation();
  const [activePack, setActivePack] = useState<"grocery" | "electronics" | "apparel">("grocery");

  // Grocery state
  const [scaleBarcode, setScaleBarcode] = useState("2004512003507");
  const [scaleResult, setScaleResult] = useState<{
    sku: string;
    type: string;
    price?: number;
    weight?: number;
  } | null>({
    sku: "SCALE-04512",
    type: "Price-Embedded (Prefix 20)",
    price: 350.0,
  });

  // Electronics state
  const [searchImei, setSearchImei] = useState("356891092837461");
  const [imeiRecords] = useState([
    {
      imei: "356891092837461",
      item: "iPhone 15 Pro 256GB Black",
      status: "In Stock",
      purchaseDoc: "PUR-2026-0091",
      warrantyMonths: 12,
    },
    {
      imei: "867201948210392",
      item: "Samsung Galaxy S24 Ultra Gray",
      status: "Sold (INV-202610-0044)",
      purchaseDoc: "PUR-2026-0080",
      warrantyMonths: 24,
    },
    {
      imei: "359102847501928",
      item: "Redmi Note 13 8/256GB Blue",
      status: "In Stock",
      purchaseDoc: "PUR-2026-0094",
      warrantyMonths: 12,
    },
  ]);

  // Apparel state
  const [parentStyle, setParentStyle] = useState("Polo Ralph T-Shirt");
  const [baseSku, setBaseSku] = useState("TSHIRT-POLO");
  const [sizesInput, setSizesInput] = useState("M, L, XL");
  const [colorsInput, setColorsInput] = useState("Navy, Black, White");
  const [generatedVariants, setGeneratedVariants] = useState<
    Array<{ sku: string; name: string; barcode: string; price: number }>
  >([
    { sku: "TSHIRT-POLO-NAVY-M", name: "Polo Ralph T-Shirt (Navy / M)", barcode: "8964810291021", price: 2500 },
    { sku: "TSHIRT-POLO-NAVY-L", name: "Polo Ralph T-Shirt (Navy / L)", barcode: "8964810291022", price: 2500 },
    { sku: "TSHIRT-POLO-BLACK-M", name: "Polo Ralph T-Shirt (Black / M)", barcode: "8964810291023", price: 2500 },
  ]);

  const handleTestScaleBarcode = () => {
    const clean = scaleBarcode.trim();
    if (clean.length < 12) {
      toast.error("Enter a 12 or 13 digit scale barcode.");
      return;
    }
    const prefix = clean.substring(0, 2);
    const sku = `SCALE-${clean.substring(2, 7)}`;
    const value = parseInt(clean.substring(7, 12), 10);

    if (prefix === "20") {
      setScaleResult({
        sku,
        type: "Price-Embedded (Prefix 20)",
        price: value,
      });
    } else if (prefix === "21") {
      setScaleResult({
        sku,
        type: "Weight-Embedded (Prefix 21)",
        weight: value, // Grams
      });
    } else {
      setScaleResult(null);
      toast.error("Unknown scale prefix. Expected 20 (price) or 21 (weight).");
    }
  };

  const handleGenerateMatrix = () => {
    const sizes = sizesInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const colors = colorsInput.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

    const list: Array<{ sku: string; name: string; barcode: string; price: number }> = [];
    let count = 100;
    for (const size of sizes) {
      for (const color of colors) {
        count++;
        list.push({
          sku: `${baseSku.toUpperCase()}-${color}-${size}`,
          name: `${parentStyle} (${color} / ${size})`,
          barcode: `896700100${count}`,
          price: 2500,
        });
      }
    }
    setGeneratedVariants(list);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-400" />
            {t("packs.title") || "Industry Specialized Modules"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supermarket weighing scale barcodes, IMEI serial lifecycle tracking, and apparel matrix variants.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setActivePack("grocery")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activePack === "grocery" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Grocery & Produce
          </button>
          <button
            onClick={() => setActivePack("electronics")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activePack === "electronics" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Electronics (IMEI)
          </button>
          <button
            onClick={() => setActivePack("apparel")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activePack === "apparel" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            Apparel & Footwear
          </button>
        </div>
      </div>

      {/* Grocery Scale Barcode Parser Tab */}
      {activePack === "grocery" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Weighing Scale Barcode Tester (EAN-13 Prefix 20 / 21)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              In retail supermarkets and delis, scales print thermal adhesive labels with embedded price or weight. The engine parses the SKU and embeds the exact item into checkout.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Scan or Enter Scale Barcode</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={scaleBarcode}
                  onChange={(e) => setScaleBarcode(e.target.value)}
                  placeholder="e.g. 2004512003507"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleTestScaleBarcode}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
                >
                  Decode
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setScaleBarcode("2004512003507")}
                className="text-[11px] text-slate-400 hover:text-emerald-400 underline"
              >
                Sample Price (PKR 350)
              </button>
              <button
                onClick={() => setScaleBarcode("2108931014504")}
                className="text-[11px] text-slate-400 hover:text-emerald-400 underline"
              >
                Sample Weight (1,450g)
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Decoded POS Payload
            </h3>

            {scaleResult ? (
              <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/40 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Barcode Format:</span>
                  <span className="text-white font-medium">{scaleResult.type}</span>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400">Extracted Product SKU:</span>
                  <span className="font-mono text-emerald-400 font-bold">{scaleResult.sku}</span>
                </div>
                {scaleResult.price !== undefined && (
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Calculated Sale Price:</span>
                    <span className="font-mono text-white font-bold">PKR {scaleResult.price.toFixed(2)}</span>
                  </div>
                )}
                {scaleResult.weight !== undefined && (
                  <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2">
                    <span className="text-slate-400">Calculated Net Weight:</span>
                    <span className="font-mono text-white font-bold">{scaleResult.weight} Grams ({(scaleResult.weight / 1000).toFixed(3)} KG)</span>
                  </div>
                )}
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 pt-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Ready for instant 1-scan addition to active POS checkout cart.
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-6 text-center">
                Enter a scale barcode to view decoded parameters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Electronics IMEI Tracker Tab */}
      {activePack === "electronics" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                IMEI & Device Serial Lifecycle Database
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Every smartphone and appliance is tracked by unique 15-digit IMEI with warranty status.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchImei}
                onChange={(e) => setSearchImei(e.target.value)}
                placeholder="Search IMEI / Serial..."
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Device / Model</th>
                  <th className="pb-2 font-medium">IMEI / Serial #</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Warranty</th>
                  <th className="pb-2 font-medium">Purchase Doc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {imeiRecords.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 font-medium text-white">{r.item}</td>
                    <td className="py-2.5 font-mono text-emerald-400 font-semibold">{r.imei}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        r.status.startsWith("In Stock")
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-800 text-slate-300"
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-300">{r.warrantyMonths} Months</td>
                    <td className="py-2.5 font-mono text-slate-400">{r.purchaseDoc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Apparel Matrix Variant Generator Tab */}
      {activePack === "apparel" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shirt className="w-4 h-4 text-emerald-400" />
              Apparel Size × Color Matrix Generator
            </h3>
            <p className="text-xs text-slate-400">
              Rapidly generate child variant SKUs and distinct EAN barcodes from a single parent apparel style.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Parent Style Name</label>
                <input
                  type="text"
                  value={parentStyle}
                  onChange={(e) => setParentStyle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Base SKU</label>
                <input
                  type="text"
                  value={baseSku}
                  onChange={(e) => setBaseSku(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Sizes (comma-separated)</label>
                <input
                  type="text"
                  value={sizesInput}
                  onChange={(e) => setSizesInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Colors (comma-separated)</label>
                <input
                  type="text"
                  value={colorsInput}
                  onChange={(e) => setColorsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleGenerateMatrix}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Generate Combinatorial Variants
              </button>
            </div>
          </div>

          {/* Generated Variants Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              Generated Matrix Variants ({generatedVariants.length} Child SKUs)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2 font-medium">Child Variant SKU</th>
                    <th className="pb-2 font-medium">Full Name</th>
                    <th className="pb-2 font-medium">Generated Barcode</th>
                    <th className="pb-2 font-medium text-right">Retail Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {generatedVariants.map((v, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-mono text-emerald-400 font-semibold">{v.sku}</td>
                      <td className="py-2.5 text-slate-200">{v.name}</td>
                      <td className="py-2.5 font-mono text-slate-400">{v.barcode}</td>
                      <td className="py-2.5 text-right font-mono text-white font-medium">PKR {v.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
