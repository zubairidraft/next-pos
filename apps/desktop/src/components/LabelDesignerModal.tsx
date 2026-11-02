import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Tag,
  CheckCircle2,
  FileCode,
  Layers,
} from "lucide-react";

interface LabelDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: {
    name: string;
    name_ur?: string;
    sku: string;
    barcode?: string;
    price_paisa?: number;
  };
}

export const LabelDesignerModal: React.FC<LabelDesignerModalProps> = ({
  isOpen,
  onClose,
  initialItem,
}) => {
  const { t } = useTranslation();

  const [labelSize, setLabelSize] = useState<"38x25" | "50x30">("38x25");
  const [storeName, setStoreName] = useState("AL-MADINA SUPER MART");
  const [itemName, setItemName] = useState(
    initialItem?.name || "Shan Bombay Biryani Masala 50g"
  );
  const [itemNameUr, setItemNameUr] = useState(
    initialItem?.name_ur || "Shan Bombay Biryani Masala 50g"
  );
  const [barcode, setBarcode] = useState(initialItem?.barcode || "8964000101112");
  const [pricePkr, setPricePkr] = useState(
    initialItem?.price_paisa ? (initialItem.price_paisa / 100).toString() : "140.00"
  );
  const [copies, setCopies] = useState(1);
  const [showUrdu, setShowUrdu] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Generate TSPL command string identical to pos-core hardware::label
  const generateTsplString = () => {
    const [w, h, bcHeight, xOffset] =
      labelSize === "38x25" ? [38, 25, 48, 16] : [50, 30, 64, 24];

    let lines = [
      `SIZE ${w} mm, ${h} mm`,
      `GAP 2 mm, 0 mm`,
      `DIRECTION 1`,
      `CLS`,
      `TEXT ${xOffset}, 16, "2", 0, 1, 1, "${storeName}"`,
      `TEXT ${xOffset}, 40, "2", 0, 1, 1, "${itemName.slice(0, labelSize === "38x25" ? 22 : 30)}"`,
    ];

    const bcY = labelSize === "38x25" ? 68 : 76;
    lines.push(
      `BARCODE ${xOffset}, ${bcY}, "128", ${bcHeight}, 1, 0, 2, 2, "${barcode}"`
    );

    if (showPrice) {
      const priceY = bcY + bcHeight + 26;
      lines.push(
        `TEXT ${xOffset}, ${priceY}, "3", 0, 1, 1, "PKR ${Number(pricePkr).toFixed(2)}"`
      );
    }

    lines.push(`PRINT ${copies}, 1\r\n`);
    return lines.join("\r\n");
  };

  const handleCopyTspl = () => {
    const tspl = generateTsplString();
    navigator.clipboard.writeText(tspl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Tag className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="text-xl font-bold text-white">{t("labels.title")}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{t("labels.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Controls Form */}
          <div className="space-y-4">
            {/* Size Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Sticker Dimensions
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLabelSize("38x25")}
                  className={`p-3 rounded-xl border text-left text-xs font-medium transition ${
                    labelSize === "38x25"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="font-bold text-sm text-white">38 x 25 mm</div>
                  <div className="text-[11px] text-slate-400 mt-1">Standard Shelf Sticker</div>
                </button>

                <button
                  type="button"
                  onClick={() => setLabelSize("50x30")}
                  className={`p-3 rounded-xl border text-left text-xs font-medium transition ${
                    labelSize === "50x30"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="font-bold text-sm text-white">50 x 30 mm</div>
                  <div className="text-[11px] text-slate-400 mt-1">Supermarket & Apparel</div>
                </button>
              </div>
            </div>

            {/* Store Name Header */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Store Header Title
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Item Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Product Name
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Secondary Product Label / Subtitle */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Secondary Product Title / Subtitle
              </label>
              <input
                type="text"
                value={itemNameUr}
                onChange={(e) => setItemNameUr(e.target.value)}
                dir="rtl"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-emerald-400 font-nastaliq focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Barcode & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("labels.barcode_val")}
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("labels.retail_price")}
                </label>
                <input
                  type="text"
                  value={pricePkr}
                  onChange={(e) => setPricePkr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("labels.copies")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showUrdu}
                  onChange={(e) => setShowUrdu(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-800"
                />
                {t("labels.show_urdu")}
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-800"
                />
                {t("labels.show_price")}
              </label>
            </div>
          </div>

          {/* Sticker Preview Container */}
          <div className="flex flex-col items-center justify-center p-6 bg-slate-950 rounded-2xl border border-slate-800/80 min-h-[380px]">
            <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              Thermal Adhesive Sticker Preview ({labelSize} mm)
            </div>

            {/* Sticker Mockup (Physical White Label with Monochrome Black Ink) */}
            <div
              className={`bg-white text-black rounded shadow-2xl p-3 flex flex-col justify-between select-none border border-slate-300 transition-all ${
                labelSize === "38x25"
                  ? "w-64 h-44"
                  : "w-80 h-52"
              }`}
            >
              <div className="text-center border-b border-black/20 pb-1">
                <div className="font-extrabold uppercase text-[11px] tracking-wider leading-tight">
                  {storeName}
                </div>
              </div>

              <div className="text-center my-auto">
                <div className="font-bold text-xs truncate leading-snug">
                  {itemName}
                </div>
                {showUrdu && itemNameUr && (
                  <div className="text-xs font-nastaliq leading-snug mt-0.5 text-black/80">
                    {itemNameUr}
                  </div>
                )}
              </div>

              {/* Code128 Mockup Barcode */}
              <div className="flex flex-col items-center justify-center py-1">
                <div className="flex items-center gap-[1.5px] h-9 w-44 justify-center">
                  {[...Array(38)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-full ${
                        (i * 7 + 3) % 4 === 0
                          ? "w-1 bg-black"
                          : (i * 3) % 3 === 0
                          ? "w-[2px] bg-black"
                          : "w-[1px] bg-black"
                      }`}
                    />
                  ))}
                </div>
                <div className="font-mono text-[10px] tracking-widest font-semibold mt-0.5">
                  {barcode}
                </div>
              </div>

              {/* Price Tag */}
              {showPrice && (
                <div className="text-center border-t border-black/20 pt-1">
                  <div className="font-mono font-black text-sm">
                    PKR {Number(pricePkr).toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Generate TSPL Commands */}
            <div className="mt-6 flex items-center gap-3 w-full max-w-sm">
              <button
                type="button"
                onClick={handleCopyTspl}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-950"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    {t("labels.copied")}
                  </>
                ) : (
                  <>
                    <FileCode className="w-4 h-4" />
                    {t("labels.test_print_btn")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
