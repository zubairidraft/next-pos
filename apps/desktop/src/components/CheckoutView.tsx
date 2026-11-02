import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CartLineItem, ParkedCartItem, PaymentTender, SaleSummary } from "../lib/contracts";
import { api, ProductSearchResult, PostSaleRequest } from "../lib/api";
import { PaymentModal } from "./PaymentModal";
import { ParkedCartsModal } from "./ParkedCartsModal";
import { PrinterSettingsModal } from "./PrinterSettingsModal";
import { ShiftCloseModal } from "./ShiftCloseModal";
import { SaleReturnsModal } from "./SaleReturnsModal";
import {
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
  Sun,
  Grid3X3,
  Search,
  X,
  Package,
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
  const [cartLines, setCartLines] = useState<CartLineItem[]>([]);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ProductSearchResult[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");

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
  const [highContrast, setHighContrast] = useState(false);
  const [touchNumpadOpen, setTouchNumpadOpen] = useState(false);

  const handleNumpadInput = (val: string) => {
    if (val === "C") {
      setBarcodeInput("");
    } else if (val === "BACK") {
      setBarcodeInput((prev) => prev.slice(0, -1));
    } else if (val === "ENTER") {
      const query = barcodeInput.trim();
      if (query) {
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
        setBarcodeInput("");
      }
    } else {
      setBarcodeInput((prev) => prev + val);
    }
  };

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on mount and on keypress
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Live debounced search as user types
  useEffect(() => {
    const q = barcodeInput.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearchDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await api.searchProducts(q);
        if (results && results.length > 0) {
          setSearchResults(results);
          setIsSearchDropdownOpen(true);
          setSelectedSearchIndex(0);
          return;
        }
      } catch {
        // Fallback to local sample matching
      }

      const qLower = q.toLowerCase();
      const localMatches = SAMPLE_PRODUCTS.filter(
        (p) =>
          p.barcode.includes(q) ||
          p.sku.toLowerCase().includes(qLower) ||
          p.name.toLowerCase().includes(qLower) ||
          p.name_ur.includes(q)
      ).map((p) => ({
        variant_id: p.id,
        product_id: p.id,
        name: p.name,
        name_ur: p.name_ur,
        sku: p.sku,
        barcode: p.barcode,
        base_unit_id: "u-pc",
        base_unit_code: p.unit,
        retail_price_paisa: p.retail_price_paisa,
        stock_on_hand_milli: p.stock_milli,
      }));

      setSearchResults(localMatches);
      setIsSearchDropdownOpen(localMatches.length > 0);
      setSelectedSearchIndex(0);
    }, 120);

    return () => clearTimeout(timer);
  }, [barcodeInput]);

  const openCatalogModal = async () => {
    try {
      const items = await api.searchProducts("");
      if (items && items.length > 0) {
        setCatalogItems(items);
      } else {
        setCatalogItems(
          SAMPLE_PRODUCTS.map((p) => ({
            variant_id: p.id,
            product_id: p.id,
            name: p.name,
            name_ur: p.name_ur,
            sku: p.sku,
            barcode: p.barcode,
            base_unit_id: "u-pc",
            base_unit_code: p.unit,
            retail_price_paisa: p.retail_price_paisa,
            stock_on_hand_milli: p.stock_milli,
          }))
        );
      }
    } catch {
      setCatalogItems(
        SAMPLE_PRODUCTS.map((p) => ({
          variant_id: p.id,
          product_id: p.id,
          name: p.name,
          name_ur: p.name_ur,
          sku: p.sku,
          barcode: p.barcode,
          base_unit_id: "u-pc",
          base_unit_code: p.unit,
          retail_price_paisa: p.retail_price_paisa,
          stock_on_hand_milli: p.stock_milli,
        }))
      );
    }
    setIsCatalogModalOpen(true);
  };

  // Global POS Keyboard listener (F2, F3, F4, F8, F9, Space, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is active, let modal handle it
      if (
        isPaymentOpen ||
        isParkedModalOpen ||
        isPrinterOpen ||
        isShiftOpen ||
        isReturnOpen ||
        isCatalogModalOpen
      )
        return;

      if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (e.key === "F3") {
        e.preventDefault();
        openCatalogModal();
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
        if (isSearchDropdownOpen) {
          setIsSearchDropdownOpen(false);
        } else if (cartLines.length > 0) {
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
    isCatalogModalOpen,
    isSearchDropdownOpen,
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
    setIsSearchDropdownOpen(false);
    barcodeInputRef.current?.focus();
  };

  const addProductFromCatalog = (prod: ProductSearchResult) => {
    const unitCode = prod.base_unit_code || prod.unit_code || "PC";
    const unitId = prod.base_unit_id || prod.unit_id || "u-pc";
    const stock = prod.stock_on_hand_milli ?? prod.stock_milli ?? 999000;

    setCartLines((prev) => {
      const existing = prev.find((l) => l.variant_id === prod.variant_id);
      if (existing) {
        const nextQty = existing.qty_milli + 1000;
        if (nextQty > stock) {
          alert(`Cannot exceed available stock (${stock / 1000} ${unitCode})!`);
          return prev;
        }
        return prev.map((l) =>
          l.variant_id === prod.variant_id ? { ...l, qty_milli: nextQty } : l
        );
      } else {
        if (stock < 1000) {
          alert(`Item "${prod.name}" is out of stock! Negative stock blocked.`);
          return prev;
        }
        return [
          ...prev,
          {
            variant_id: prod.variant_id,
            product_name: prod.name,
            sku: prod.sku,
            barcode: prod.barcode || "",
            unit_code: unitCode,
            unit_id: unitId,
            qty_milli: 1000,
            unit_price_paisa: prod.retail_price_paisa,
            discount_paisa: 0,
            tax_paisa: 0,
            stock_on_hand_milli: stock,
          },
        ];
      }
    });
    setBarcodeInput("");
    setIsSearchDropdownOpen(false);
    barcodeInputRef.current?.focus();
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    if (isSearchDropdownOpen && searchResults.length > 0) {
      addProductFromCatalog(searchResults[selectedSearchIndex]);
      return;
    }

    try {
      const results = await api.searchProducts(query);
      if (results && results.length > 0) {
        addProductFromCatalog(results[0]);
        return;
      }
    } catch {
      // Fallback
    }

    // Fallback: search by barcode or SKU or partial name from local sample list
    const match = SAMPLE_PRODUCTS.find(
      (p) =>
        p.barcode === query ||
        p.sku.toLowerCase() === query.toLowerCase() ||
        p.name.toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      addProductToCart(match);
    } else {
      alert(`No product matching barcode or name: "${query}"`);
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

  const handleCompleteSale = async (tenders: PaymentTender[], changePaisa: number) => {
    try {
      const req: PostSaleRequest = {
        customer_id: selectedCustomerId || undefined,
        lines: cartLines.map((l) => ({
          variant_id: l.variant_id,
          unit_id: l.unit_id || "u-pc",
          qty_milli: l.qty_milli,
          unit_price_paisa: l.unit_price_paisa,
          discount_paisa: l.discount_paisa,
          tax_paisa: l.tax_paisa,
        })),
        tenders: tenders.map((t) => ({
          method: t.method,
          amount_paisa: t.amount_paisa,
          reference: t.reference || null,
        })),
        global_discount_paisa: orderDiscountPaisa,
      };

      const completed = await api.postSale(req);
      const totalPaid = tenders.reduce((acc, t) => acc + t.amount_paisa, 0);

      const summary: SaleSummary = {
        id: completed.id,
        doc_no: completed.doc_no,
        customer_name: selectedCustomerId ? selectedCustomerName : undefined,
        subtotal_paisa: completed.subtotal_paisa,
        discount_paisa: completed.total_discount_paisa,
        tax_paisa: completed.tax_paisa,
        grand_total_paisa: completed.grand_total_paisa,
        total_paid_paisa: totalPaid,
        change_paisa: completed.change_paisa,
        occurred_at: new Date(completed.created_at).toLocaleTimeString(),
      };

      setRecentSale(summary);
      setCartLines([]);
      setOrderDiscountPaisa(0);
      setIsPaymentOpen(false);
      setToastMessage(`Sale Posted! ${completed.doc_no} (${formatPkr(completed.grand_total_paisa)})`);
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      console.warn("Real core post_sale failed or running in web fallback:", err);
      // Fallback in case of pure web browser dev environment
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
    }
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
        <div className="flex flex-col sm:flex-row items-center gap-3 relative z-30">
          <div className="relative flex-1 w-full">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3.5 text-emerald-400 pointer-events-none" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (searchResults.length > 0) {
                      setIsSearchDropdownOpen(true);
                      setSelectedSearchIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedSearchIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (isSearchDropdownOpen && searchResults.length > 0) {
                      addProductFromCatalog(searchResults[selectedSearchIndex]);
                    } else {
                      handleBarcodeSubmit(e);
                    }
                  } else if (e.key === "Escape") {
                    setIsSearchDropdownOpen(false);
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setIsSearchDropdownOpen(true);
                  }
                }}
                placeholder="🔍 پروڈکٹ کا نام لکھیں یا بارکوڈ اسکین کریں (Search Name or Scan Barcode)..."
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-10 pr-32 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
              />
              <div className="absolute right-1.5 flex items-center gap-1.5">
                {barcodeInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeInput("");
                      setIsSearchDropdownOpen(false);
                      barcodeInputRef.current?.focus();
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openCatalogModal}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-700 transition"
                  title="Browse All Products (F3) / تمام اشیاء"
                >
                  <Grid3X3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>فہرست (F3)</span>
                </button>
              </div>
            </div>

            {/* Live Autocomplete Dropdown */}
            {isSearchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-800 animate-in fade-in slide-in-from-top-1">
                <div className="px-3 py-1.5 bg-slate-950 text-[11px] text-slate-400 font-medium flex items-center justify-between border-b border-slate-800">
                  <span>تلاش کے نتائج ({searchResults.length} اشیاء)</span>
                  <span className="text-[10px] text-emerald-400">↑↓ تیر اور Enter سے سلیکٹ کریں</span>
                </div>
                {searchResults.map((item, idx) => {
                  const isSelected = idx === selectedSearchIndex;
                  const stock = item.stock_on_hand_milli ?? item.stock_milli ?? 0;
                  const unit = item.base_unit_code || item.unit_code || "PC";
                  const inStock = stock > 0;

                  return (
                    <div
                      key={item.variant_id}
                      onClick={() => addProductFromCatalog(item)}
                      onMouseEnter={() => setSelectedSearchIndex(idx)}
                      className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition ${
                        isSelected ? "bg-emerald-600/20 border-l-4 border-emerald-500" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">{item.name}</span>
                          {item.name_ur && (
                            <span className="text-xs text-emerald-400 font-urdu">{item.name_ur}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{item.sku}</span>
                          {item.barcode && (
                            <>
                              <span>•</span>
                              <span>{item.barcode}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            inStock
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {inStock ? `اسٹاک: ${stock / 1000} ${unit}` : "اسٹاک ختم"}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-sm text-emerald-400">
                            {formatPkr(item.retail_price_paisa)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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

              <button
                type="button"
                onClick={() => setTouchNumpadOpen(!touchNumpadOpen)}
                className={`p-2 border rounded-xl transition ${
                  touchNumpadOpen
                    ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
                title="Toggle Touchscreen Numpad / ٹچ پیڈ"
              >
                <Grid3X3 className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                className={`p-2 border rounded-xl transition ${
                  highContrast
                    ? "bg-amber-500 text-black border-amber-400 shadow-sm font-bold"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
                title="High-Contrast Sunlight Mode / تیز روشنی موڈ"
              >
                <Sun className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          </div>
        </div>

        {/* 48x48px Touchscreen Numpad Overlay for All-in-One POS Monitors */}
        {touchNumpadOpen && (
          <div className="bg-slate-950 border border-emerald-900/40 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-emerald-400">Touchscreen Input (48px Ergonomic Keypad)</span>
              <span>Buffer: {barcodeInput || "Empty"}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["7", "8", "9", "C", "4", "5", "6", "BACK", "1", "2", "3", "ENTER", "0", "00", ".", "+"].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleNumpadInput(k)}
                  className={`h-12 rounded-xl text-base font-bold flex items-center justify-center transition active:scale-95 ${
                    k === "ENTER"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white col-span-1 shadow-md shadow-emerald-950"
                      : k === "C" || k === "BACK"
                      ? "bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60"
                      : "bg-slate-900 hover:bg-slate-800 text-white border border-slate-800"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

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
                    <td colSpan={6} className="py-20 text-center text-slate-400">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-inner">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                      <p className="font-bold text-white text-base font-urdu">کاروبار پی او ایس - بل بنانے کے لیے تیار ہے</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                        بل میں پروڈکٹ شامل کرنے کے لیے اوپر نام لکھیں، بارکوڈ اسکین کریں یا نیچے کوئیک بٹن پر کلک کریں۔
                      </p>
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

      {/* Product Catalog Browser Modal (F3) */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">اشیاء کی فہرست / Product Catalog (F3)</h3>
                  <p className="text-xs text-slate-400">کلک کریں اور فوری طور پر بل میں شامل کریں</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
              {[
                { id: "all", label: "تمام اشیاء (All)" },
                { id: "cat-bev", label: "مشروبات اور چائے (Beverages)" },
                { id: "cat-oil", label: "گھی اور آئل (Cooking Oil)" },
                { id: "cat-dry", label: "ڈیری اور دودھ (Dairy)" },
                { id: "cat-rice", label: "چاول اور دالیں (Grains)" },
                { id: "cat-soap", label: "صابن اور شیمپو (Care)" },
                { id: "cat-spc", label: "مصالحہ جات (Spices)" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition ${
                    selectedCategoryFilter === c.id
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Product Cards Grid */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {catalogItems
                .filter((item) => {
                  if (selectedCategoryFilter === "all") return true;
                  return item.category_id === selectedCategoryFilter;
                })
                .map((item) => {
                  const stock = item.stock_on_hand_milli ?? item.stock_milli ?? 0;
                  const unit = item.base_unit_code || item.unit_code || "PC";
                  const inStock = stock > 0;

                  return (
                    <div
                      key={item.variant_id}
                      onClick={() => {
                        addProductFromCatalog(item);
                        setIsCatalogModalOpen(false);
                      }}
                      className="p-4 bg-slate-950/70 border border-slate-800 hover:border-emerald-500/60 rounded-xl flex flex-col justify-between cursor-pointer hover:bg-slate-800/40 transition group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                            {item.sku}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              inStock
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {inStock ? `اسٹاک: ${stock / 1000} ${unit}` : "اسٹاک ختم"}
                          </span>
                        </div>
                        <h4 className="font-bold text-white text-sm group-hover:text-emerald-400 transition">
                          {item.name}
                        </h4>
                        {item.name_ur && (
                          <p className="text-xs text-emerald-400 font-urdu mt-0.5">{item.name_ur}</p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="font-extrabold text-white text-sm">
                          {formatPkr(item.retail_price_paisa)}
                        </span>
                        <span className="text-xs px-2.5 py-1 bg-emerald-600/20 text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white rounded-lg font-semibold transition">
                          + Add to Cart
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
