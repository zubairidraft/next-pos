import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CartLineItem, ParkedCartItem, PaymentTender, SaleSummary } from "../lib/contracts";
import { PaymentModal } from "./PaymentModal";
import { ParkedCartsModal } from "./ParkedCartsModal";
import { PrinterSettingsModal } from "./PrinterSettingsModal";
import { ShiftCloseModal } from "./ShiftCloseModal";
import { SaleReturnsModal } from "./SaleReturnsModal";
import {
  Barcode,
  Plus,
  Minus,
  Trash2,
  Clock,
  CheckCircle2,
  User,
  ShoppingBag,
  RotateCcw,
  Printer,
  Receipt,
} from "lucide-react";

// Mock catalog item for immediate scanning & testing
interface QuickProduct {
  id: string;
  name: string;
  name_ur: string;
  sku: string;
  barcode: string;
  unit: string;
  retail_price_paisa: number;
  stock_milli: number;
}

const SAMPLE_PRODUCTS: QuickProduct[] = [
  {
    id: "var-001",
    name: "Tapal Danedar Tea 450g",
    name_ur: "ٹپال دانے دار چائے ۴۵۰ گرام",
    sku: "BEV-TEA-450",
    barcode: "8961014001018",
    unit: "PKT",
    retail_price_paisa: 62000, // PKR 620.00
    stock_milli: 45000, // 45 units
  },
  {
    id: "var-002",
    name: "Dalda Cooking Oil 1 Litre Pouch",
    name_ur: "ڈالڈا کوکنگ آئل ۱ لٹر پاؤچ",
    sku: "GRO-OIL-1L",
    barcode: "8961014002022",
    unit: "PC",
    retail_price_paisa: 54000, // PKR 540.00
    stock_milli: 32000,
  },
  {
    id: "var-003",
    name: "Olper's Milk 1000ml",
    name_ur: "اولپرز دودھ ۱۰۰۰ ملی لٹر",
    sku: "DRY-MLK-1L",
    barcode: "8961014003036",
    unit: "PC",
    retail_price_paisa: 29000, // PKR 290.00
    stock_milli: 80000,
  },
  {
    id: "var-004",
    name: "National Basmati Rice 5kg",
    name_ur: "نیشنل باسمتی چاول ۵ کلو",
    sku: "GRO-RICE-5K",
    barcode: "8961014004040",
    unit: "BAG",
    retail_price_paisa: 175000, // PKR 1,750.00
    stock_milli: 25000,
  },
  {
    id: "var-005",
    name: "Lux Beauty Soap 140g",
    name_ur: "لکس بیوٹی صابن ۱۴۰ گرام",
    sku: "PER-SOAP-140",
    barcode: "8961014005054",
    unit: "PC",
    retail_price_paisa: 15000, // PKR 150.00
    stock_milli: 120000,
  },
  {
    id: "var-006",
    name: "Shan Biryani Masala 50g",
    name_ur: "شان بریانی مصالحہ ۵۰ گرام",
    sku: "SP-BRY-50",
    barcode: "8961014006068",
    unit: "PKT",
    retail_price_paisa: 11000, // PKR 110.00
    stock_milli: 150000,
  },
];

export const CheckoutView: React.FC = () => {
  const { t } = useTranslation();

  // State
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cartLines, setCartLines] = useState<CartLineItem[]>([
    {
      variant_id: "var-001",
      product_name: "Tapal Danedar Tea 450g",
      sku: "BEV-TEA-450",
      barcode: "8961014001018",
      unit_code: "PKT",
      qty_milli: 2000, // 2 units
      unit_price_paisa: 62000,
      discount_paisa: 0,
      tax_paisa: 0,
      stock_on_hand_milli: 45000,
    },
    {
      variant_id: "var-003",
      product_name: "Olper's Milk 1000ml",
      sku: "DRY-MLK-1L",
      barcode: "8961014003036",
      unit_code: "PC",
      qty_milli: 1000, // 1 unit
      unit_price_paisa: 29000,
      discount_paisa: 0,
      tax_paisa: 0,
      stock_on_hand_milli: 80000,
    },
  ]);

  const [orderDiscountPaisa, setOrderDiscountPaisa] = useState<number>(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>("Walk-in Customer");

  // Modals
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isParkedModalOpen, setIsParkedModalOpen] = useState(false);
  const [isPrinterOpen, setIsPrinterOpen] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCartItem[]>([
    {
      id: "park-01",
      cart_name: "Customer waiting for wallet",
      item_count: 3,
      total_paisa: 245000,
      parked_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
  ]);

  const [recentSale, setRecentSale] = useState<SaleSummary | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on mount and on keypress
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Global POS Keyboard listener (F2, F4, F8, F9, Space, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is active, let modal handle it
      if (
        isPaymentOpen ||
        isParkedModalOpen ||
        isPrinterOpen ||
        isShiftOpen ||
        isReturnOpen
      )
        return;

      if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        handleParkCurrentCart();
      } else if (e.key === "F8") {
        e.preventDefault();
        setIsParkedModalOpen(true);
      } else if (e.key === "F9" || (e.code === "Space" && document.activeElement !== barcodeInputRef.current)) {
        e.preventDefault();
        if (cartLines.length > 0) {
          setIsPaymentOpen(true);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (cartLines.length > 0) {
          if (window.confirm("Clear active cart?")) {
            setCartLines([]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cartLines,
    isPaymentOpen,
    isParkedModalOpen,
    isPrinterOpen,
    isShiftOpen,
    isReturnOpen,
  ]);

  const formatPkr = (paisa: number) => `PKR ${(paisa / 100).toFixed(2)}`;

  // Calculations
  const subtotalPaisa = cartLines.reduce(
    (sum, line) =>
      sum + Math.round((line.qty_milli * line.unit_price_paisa) / 1000) - line.discount_paisa,
    0
  );
  const grandTotalPaisa = Math.max(0, subtotalPaisa - orderDiscountPaisa);
  const totalItemCount = cartLines.length;
  const totalUnits = (
    cartLines.reduce((sum, line) => sum + line.qty_milli, 0) / 1000
  ).toFixed(1);

  // Add product to cart (or increment qty if exists)
  const addProductToCart = (prod: QuickProduct) => {
    setCartLines((prev) => {
      const idx = prev.findIndex((l) => l.variant_id === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].qty_milli + 1000;
        // Negative stock check
        if (newQty > prod.stock_milli) {
          alert(`Cannot exceed available stock (${prod.stock_milli / 1000} ${prod.unit})! Negative stock blocked.`);
          return prev;
        }
        next[idx] = {
          ...next[idx],
          qty_milli: newQty,
        };
        return next;
      } else {
        if (prod.stock_milli < 1000) {
          alert(`Item "${prod.name}" is out of stock! Negative stock blocked.`);
          return prev;
        }
        return [
          ...prev,
          {
            variant_id: prod.id,
            product_name: prod.name,
            sku: prod.sku,
            barcode: prod.barcode,
            unit_code: prod.unit,
            qty_milli: 1000,
            unit_price_paisa: prod.retail_price_paisa,
            discount_paisa: 0,
            tax_paisa: 0,
            stock_on_hand_milli: prod.stock_milli,
          },
        ];
      }
    });
    setBarcodeInput("");
    barcodeInputRef.current?.focus();
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    // Search by barcode or SKU or partial name
    const match = SAMPLE_PRODUCTS.find(
      (p) =>
        p.barcode === query ||
        p.sku.toLowerCase() === query.toLowerCase() ||
        p.name.toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      addProductToCart(match);
    } else {
      alert(`No product matching barcode or SKU: "${query}"`);
    }
  };

  const updateLineQty = (variantId: string, deltaMilli: number) => {
    setCartLines((prev) =>
      prev
        .map((line) => {
          if (line.variant_id === variantId) {
            const nextQty = line.qty_milli + deltaMilli;
            if (nextQty <= 0) return null;
            if (nextQty > line.stock_on_hand_milli) {
              alert(`Cannot exceed available stock (${line.stock_on_hand_milli / 1000} ${line.unit_code})!`);
              return line;
            }
            return { ...line, qty_milli: nextQty };
          }
          return line;
        })
        .filter(Boolean) as CartLineItem[]
    );
  };

  const removeLine = (variantId: string) => {
    setCartLines((prev) => prev.filter((l) => l.variant_id !== variantId));
  };

  const handleParkCurrentCart = () => {
    if (cartLines.length === 0) {
      alert("Cart is empty! Nothing to hold.");
      return;
    }
    const note = prompt("Enter customer name or reference note for this held order:");
    const newParked: ParkedCartItem = {
      id: "park-" + Date.now(),
      cart_name: note?.trim() || `Held Order #${parkedCarts.length + 1}`,
      item_count: cartLines.length,
      total_paisa: grandTotalPaisa,
      parked_at: new Date().toISOString(),
    };
    setParkedCarts((prev) => [newParked, ...prev]);
    setCartLines([]);
    setOrderDiscountPaisa(0);
    setToastMessage(`Cart parked successfully: "${newParked.cart_name}"`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRecallCart = (_cartId: string) => {
    // For demo/functional checkout, reload sample cart items
    setCartLines([
      {
        variant_id: "var-002",
        product_name: "Dalda Cooking Oil 1 Litre Pouch",
        sku: "GRO-OIL-1L",
        barcode: "8961014002022",
        unit_code: "PC",
        qty_milli: 3000,
        unit_price_paisa: 54000,
        discount_paisa: 0,
        tax_paisa: 0,
        stock_on_hand_milli: 32000,
      },
      {
        variant_id: "var-004",
        product_name: "National Basmati Rice 5kg",
        sku: "GRO-RICE-5K",
        barcode: "8961014004040",
        unit_code: "BAG",
        qty_milli: 1000,
        unit_price_paisa: 175000,
        discount_paisa: 0,
        tax_paisa: 0,
        stock_on_hand_milli: 25000,
      },
    ]);
    setParkedCarts((prev) => prev.filter((p) => p.id !== _cartId));
    setToastMessage("Held cart restored to active counter!");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDiscardParkedCart = (cartId: string) => {
    setParkedCarts((prev) => prev.filter((p) => p.id !== cartId));
  };

  const handleCompleteSale = (tenders: PaymentTender[], changePaisa: number) => {
    const docNo = `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    const totalPaid = tenders.reduce((acc, t) => acc + t.amount_paisa, 0);

    const summary: SaleSummary = {
      id: "sale-" + Date.now(),
      doc_no: docNo,
      customer_name: selectedCustomerId ? selectedCustomerName : undefined,
      subtotal_paisa: subtotalPaisa,
      discount_paisa: orderDiscountPaisa,
      tax_paisa: 0,
      grand_total_paisa: grandTotalPaisa,
      total_paid_paisa: totalPaid,
      change_paisa: changePaisa,
      occurred_at: new Date().toLocaleTimeString(),
    };

    setRecentSale(summary);
    setCartLines([]);
    setOrderDiscountPaisa(0);
    setIsPaymentOpen(false);
    setToastMessage(`Sale Posted! ${docNo} (${formatPkr(grandTotalPaisa)})`);
    setTimeout(() => setToastMessage(null), 5000);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 h-[calc(100vh-120px)] overflow-hidden">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-400 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Column: Barcode Scan, Cart Table, Quick Items */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 overflow-hidden">
        {/* Top Scan Bar & Customer Picker */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <form onSubmit={handleBarcodeSubmit} className="relative flex-1 w-full">
            <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder={t("pos.scan_barcode")}
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-11 pr-20 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
            >
              Enter
            </button>
          </form>

          {/* Customer Khata selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCustomerId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "cust-01") {
                    setSelectedCustomerId("cust-01");
                    setSelectedCustomerName("Haji Muhammad Aslam (Khata #102)");
                  } else {
                    setSelectedCustomerId(null);
                    setSelectedCustomerName("Walk-in Customer");
                  }
                }}
                className="bg-transparent text-slate-200 text-xs focus:outline-none"
              >
                <option value="" className="bg-slate-900 text-slate-300">
                  {t("pos.walk_in_customer")}
                </option>
                <option value="cust-01" className="bg-slate-900 text-slate-300">
                  Haji Muhammad Aslam (Khata #102)
                </option>
              </select>
            </div>

            {/* Quick Hardware & Management Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsReturnOpen(true)}
                className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl hover:bg-slate-800 text-slate-300 transition"
                title="Process Sale Return / ریٹرن"
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsShiftOpen(true)}
                className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl hover:bg-slate-800 text-slate-300 transition"
                title="Shift Close & Z-Report / روزانہ رپورٹ"
              >
                <Receipt className="w-4 h-4 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsPrinterOpen(true)}
                className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl hover:bg-slate-800 text-slate-300 transition"
                title="Printer & Drawer Hardware / پرنٹر سیٹنگز"
              >
                <Printer className="w-4 h-4 text-indigo-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Cart Line Items Table */}
        <div className="flex-1 bg-slate-950/50 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">{t("pos.item_name")}</th>
                  <th className="py-2.5 px-3 text-right">{t("pos.unit_price")}</th>
                  <th className="py-2.5 px-3 text-center">{t("pos.qty")}</th>
                  <th className="py-2.5 px-3 text-right">{t("pos.total")}</th>
                  <th className="py-2.5 px-2 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {cartLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-500">
                      <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-600 stroke-[1.5]" />
                      <p className="font-medium text-sm">{t("pos.empty_cart")}</p>
                    </td>
                  </tr>
                ) : (
                  cartLines.map((line, idx) => {
                    const lineTotal =
                      Math.round((line.qty_milli * line.unit_price_paisa) / 1000) -
                      line.discount_paisa;
                    const isLowStock = line.stock_on_hand_milli <= 5000;

                    return (
                      <tr key={line.variant_id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white text-xs">{line.product_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                            <span>{line.sku}</span>
                            <span>•</span>
                            <span>{line.barcode}</span>
                            {isLowStock && (
                              <span className="text-amber-400 text-[10px]">
                                (Stock: {line.stock_on_hand_milli / 1000})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatPkr(line.unit_price_paisa)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => updateLineQty(line.variant_id, -1000)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-bold text-white px-2 min-w-8 text-center">
                              {line.qty_milli / 1000} {line.unit_code}
                            </span>
                            <button
                              onClick={() => updateLineQty(line.variant_id, 1000)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {formatPkr(lineTotal)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => removeLine(line.variant_id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Quick Select Buttons */}
          <div className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">
              {t("pos.quick_items")}:
            </span>
            {SAMPLE_PRODUCTS.map((prod) => (
              <button
                key={prod.id}
                onClick={() => addProductToCart(prod)}
                className="shrink-0 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700/80 flex items-center gap-1.5 transition"
              >
                <span>{prod.name.split(" ")[0]}</span>
                <span className="text-emerald-400 font-bold">
                  {formatPkr(prod.retail_price_paisa)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Checkout Summary & Action Buttons */}
      <div className="w-full lg:w-96 flex flex-col gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        {/* Quick Shortcut Keys Legend */}
        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] text-slate-400 pb-2 border-b border-slate-800">
          <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
            <kbd className="font-bold text-emerald-400">F2</kbd> Scan
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
            <kbd className="font-bold text-amber-400">F4</kbd> Hold
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
            <kbd className="font-bold text-sky-400">F8</kbd> Recall
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
            <kbd className="font-bold text-rose-400">Esc</kbd> Clear
          </div>
        </div>

        {/* Totals Summary */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{t("pos.subtotal")}</span>
            <span className="font-semibold text-slate-200">{formatPkr(subtotalPaisa)}</span>
          </div>

          <div className="flex justify-between text-xs text-slate-400">
            <span>{t("pos.items_count")} / Units</span>
            <span className="font-semibold text-slate-200">
              {totalItemCount} items ({totalUnits} units)
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span>{t("pos.order_discount")}</span>
            <input
              type="number"
              step="1"
              min="0"
              value={(orderDiscountPaisa / 100).toFixed(0)}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setOrderDiscountPaisa(Math.round(val * 100));
              }}
              className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Grand Total Display */}
          <div className="pt-3 border-t border-slate-800 flex flex-col gap-1">
            <span className="text-xs uppercase font-bold text-emerald-400">
              {t("pos.grand_total")}
            </span>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {formatPkr(grandTotalPaisa)}
            </div>
            <div className="text-emerald-400 font-nastaliq text-base">
              کل رقم: {formatPkr(grandTotalPaisa)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 mt-auto">
          {/* Large Checkout Button */}
          <button
            onClick={() => setIsPaymentOpen(true)}
            disabled={cartLines.length === 0}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-base rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition"
          >
            <CheckCircle2 className="w-6 h-6" />
            <span>{t("pos.pay_btn")}</span>
          </button>

          {/* Secondary Hold / Recall / Clear */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleParkCurrentCart}
              disabled={cartLines.length === 0}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
            >
              <Clock className="w-4 h-4 text-amber-400" />
              <span>{t("pos.park_cart")}</span>
            </button>

            <button
              onClick={() => setIsParkedModalOpen(true)}
              className="relative py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-4 h-4 text-sky-400" />
              <span>{t("pos.recall_cart")}</span>
              {parkedCarts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                  {parkedCarts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Recent Sale Mini Receipt Alert */}
        {recentSale && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-emerald-300 font-bold">
              <span>Last Sale: {recentSale.doc_no}</span>
              <span>{recentSale.occurred_at}</span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Paid: {formatPkr(recentSale.total_paid_paisa)}</span>
              {recentSale.change_paisa > 0 && (
                <span className="text-amber-300">
                  Change: {formatPkr(recentSale.change_paisa)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payment Settlement Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        grandTotalPaisa={grandTotalPaisa}
        customerId={selectedCustomerId}
        customerName={selectedCustomerName}
        onComplete={handleCompleteSale}
      />

      {/* Held/Parked Carts Modal */}
      <ParkedCartsModal
        isOpen={isParkedModalOpen}
        onClose={() => setIsParkedModalOpen(false)}
        parkedCarts={parkedCarts}
        onRecall={handleRecallCart}
        onDiscard={handleDiscardParkedCart}
      />

      {/* Printer & Hardware Diagnostics Modal */}
      <PrinterSettingsModal
        isOpen={isPrinterOpen}
        onClose={() => setIsPrinterOpen(false)}
      />

      {/* Cashier Shift Close & Z-Report Modal */}
      <ShiftCloseModal
        isOpen={isShiftOpen}
        onClose={() => setIsShiftOpen(false)}
        openingFloatPaisa={100000} // PKR 1,000 float
        expectedCashPaisa={250000} // PKR 2,500 expected
        cashierName="Tariq Mahmood"
        onShiftClosed={(countedPaisa) => {
          setToastMessage(
            `Shift closed! Counted: PKR ${(countedPaisa / 100).toFixed(2)}. Z-Report printed.`
          );
          setTimeout(() => setToastMessage(null), 5000);
        }}
      />

      {/* Sale Returns & Refund Modal */}
      <SaleReturnsModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        onReturnProcessed={(docNo, refundPaisa) => {
          setToastMessage(
            `Return posted! Credit Note: ${docNo} (Refund: PKR ${(refundPaisa / 100).toFixed(2)})`
          );
          setTimeout(() => setToastMessage(null), 5000);
        }}
      />
    </div>
  );
};
