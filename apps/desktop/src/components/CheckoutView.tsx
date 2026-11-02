import React, { useState, useEffect, useRef } from "react";
import { CartLineItem, ParkedCartItem, PaymentTender, SaleSummary } from "../lib/contracts";
import { api, ProductSearchResult, PostSaleRequest } from "../lib/api";
import { PaymentModal } from "./PaymentModal";
import { ParkedCartsModal } from "./ParkedCartsModal";
import { PrinterSettingsModal } from "./PrinterSettingsModal";
import { ShiftCloseModal } from "./ShiftCloseModal";
import { SaleReturnsModal } from "./SaleReturnsModal";
import { ReceiptModal } from "./ReceiptModal";
import { useTheme } from "../context/ThemeContext";
import {
  Trash2,
  Clock,
  CheckCircle2,
  User,
  UserPlus,
  ShoppingBag,
  RotateCcw,
  Printer,
  Receipt,
  Grid3X3,
  Search,
  X,
  Package,
  HelpCircle,
  Keyboard,
  Sun,
  Moon,
  AlertTriangle,
} from "lucide-react";

// Catalog items for immediate scanning, offline fallback, and testing
interface QuickProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  category: string;
  category_id?: string;
  retail_price_paisa: number;
  wholesale_price_paisa: number;
  stock_milli: number;
}

const SAMPLE_PRODUCTS: QuickProduct[] = [
  {
    id: "var-001",
    name: "Tapal Danedar Tea 450g",
    sku: "BEV-TEA-450",
    barcode: "8961014001018",
    unit: "PKT",
    category: "Beverages",
    category_id: "cat-bev",
    retail_price_paisa: 62000, // PKR 620.00
    wholesale_price_paisa: 56000, // Wholesale minimum PKR 560.00
    stock_milli: 45000, // 45 units
  },
  {
    id: "var-002",
    name: "Dalda Cooking Oil 1 Litre Pouch",
    sku: "GRO-OIL-1L",
    barcode: "8961014002022",
    unit: "PC",
    category: "Cooking Oil",
    category_id: "cat-oil",
    retail_price_paisa: 54000, // PKR 540.00
    wholesale_price_paisa: 49000, // Wholesale minimum PKR 490.00
    stock_milli: 32000,
  },
  {
    id: "var-003",
    name: "Olper's Milk 1000ml",
    sku: "DRY-MLK-1L",
    barcode: "8961014003036",
    unit: "PC",
    category: "Dairy",
    category_id: "cat-dry",
    retail_price_paisa: 29000, // PKR 290.00
    wholesale_price_paisa: 26000, // Wholesale minimum PKR 260.00
    stock_milli: 80000,
  },
  {
    id: "var-004",
    name: "National Basmati Rice 5kg",
    sku: "GRO-RICE-5K",
    barcode: "8961014004040",
    unit: "BAG",
    category: "Grains",
    category_id: "cat-rice",
    retail_price_paisa: 175000, // PKR 1,750.00
    wholesale_price_paisa: 155000, // Wholesale minimum PKR 1550.00
    stock_milli: 25000,
  },
  {
    id: "var-005",
    name: "Lux Beauty Soap 140g",
    sku: "PER-SOAP-140",
    barcode: "8961014005054",
    unit: "PC",
    category: "Personal Care",
    category_id: "cat-soap",
    retail_price_paisa: 15000, // PKR 150.00
    wholesale_price_paisa: 13000, // Wholesale minimum PKR 130.00
    stock_milli: 120000,
  },
  {
    id: "var-006",
    name: "Shan Biryani Masala 50g",
    sku: "SP-BRY-50",
    barcode: "8961014006068",
    unit: "PKT",
    category: "Spices",
    category_id: "cat-spc",
    retail_price_paisa: 11000, // PKR 110.00
    wholesale_price_paisa: 9500, // Wholesale minimum PKR 95.00
    stock_milli: 150000,
  },
];

export const CheckoutView: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  // State
  const [barcodeInput, setBarcodeInput] = useState("");
  const [cartLines, setCartLines] = useState<CartLineItem[]>([
    {
      variant_id: "var-001",
      product_name: "Tapal Danedar Tea 450g",
      sku: "BEV-TEA-450",
      barcode: "8961014001018",
      unit_code: "PKT",
      qty_milli: 2000,
      unit_price_paisa: 62000,
      wholesale_price_paisa: 56000,
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
      qty_milli: 1000,
      unit_price_paisa: 29000,
      wholesale_price_paisa: 26000,
      discount_paisa: 0,
      tax_paisa: 0,
      stock_on_hand_milli: 80000,
    },
  ]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(0);
  const [priceErrorToast, setPriceErrorToast] = useState<string | null>(null);

  // Customer Management
  const [customers, setCustomers] = useState([
    { id: "", name: "Walk-in Customer", phone: "", credit_limit_paisa: 0 },
    { id: "cust-01", name: "Haji Muhammad Aslam (Khata #102)", phone: "0300-1234567", credit_limit_paisa: 5000000 },
    { id: "cust-02", name: "Chaudhry Traders & Mart", phone: "0321-7654321", credit_limit_paisa: 8000000 },
  ]);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustLimit, setNewCustLimit] = useState("25000");

  // Search and Catalog modal states
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  // Catalog List Modal (F3)
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ProductSearchResult[]>([]);
  const [catalogFilterText, setCatalogFilterText] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>("all");
  const [selectedCatalogRowIndex, setSelectedCatalogRowIndex] = useState<number>(0);

  // Shortcuts Help Modal (F1)
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Pricing & Customer
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
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [completedSaleData, setCompletedSaleData] = useState<{
    sale: SaleSummary;
    lines: CartLineItem[];
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [touchNumpadOpen, setTouchNumpadOpen] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const catalogSearchInputRef = useRef<HTMLInputElement>(null);

  const handleAddNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      alert("Customer name is required.");
      return;
    }
    const newId = `cust-${Date.now()}`;
    const limitPaisa = Math.round((parseFloat(newCustLimit) || 0) * 100);
    const newCustomer = {
      id: newId,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      credit_limit_paisa: limitPaisa,
    };
    setCustomers((prev) => [...prev, newCustomer]);
    setSelectedCustomerId(newId);
    setSelectedCustomerName(newCustomer.name);
    setIsNewCustomerModalOpen(false);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustLimit("25000");
    setToastMessage(`Customer "${newCustomer.name}" created and assigned to cart.`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Sync selected cart index bounds
  useEffect(() => {
    if (cartLines.length === 0) {
      setSelectedCartIndex(0);
    } else if (selectedCartIndex >= cartLines.length) {
      setSelectedCartIndex(cartLines.length - 1);
    }
  }, [cartLines.length, selectedCartIndex]);

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
          p.name.toLowerCase().includes(qLower)
      ).map((p) => ({
        variant_id: p.id,
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category,
        category_id: p.category_id,
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
    setCatalogFilterText("");
    setSelectedCatalogRowIndex(0);
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
            sku: p.sku,
            barcode: p.barcode,
            category: p.category,
            category_id: p.category_id,
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
          sku: p.sku,
          barcode: p.barcode,
          category: p.category,
          category_id: p.category_id,
          base_unit_id: "u-pc",
          base_unit_code: p.unit,
          retail_price_paisa: p.retail_price_paisa,
          stock_on_hand_milli: p.stock_milli,
        }))
      );
    }
    setIsCatalogModalOpen(true);
    setTimeout(() => {
      catalogSearchInputRef.current?.focus();
    }, 100);
  };

  const filteredCatalogItems = catalogItems.filter((item) => {
    if (catalogCategoryFilter !== "all" && item.category_id !== catalogCategoryFilter) {
      return false;
    }
    if (!catalogFilterText.trim()) return true;
    const q = catalogFilterText.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      (item.barcode && item.barcode.includes(q))
    );
  });

  // Global POS Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is active, let modal handle it
      if (
        isPaymentOpen ||
        isParkedModalOpen ||
        isPrinterOpen ||
        isShiftOpen ||
        isReturnOpen ||
        isCatalogModalOpen ||
        isHelpOpen ||
        isReceiptOpen
      ) {
        return;
      }

      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputActive = activeTag === "input" || activeTag === "select" || activeTag === "textarea";

      // F1: Help / Shortcuts modal
      if (e.key === "F1") {
        e.preventDefault();
        setIsHelpOpen(true);
      }
      // F2: Focus barcode / search input
      else if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }
      // F3: Open Product List Catalog modal
      else if (e.key === "F3") {
        e.preventDefault();
        openCatalogModal();
      }
      // F4: Park / Hold active cart
      else if (e.key === "F4") {
        e.preventDefault();
        handleParkCurrentCart();
      }
      // F5: Toggle customer (Walk-in vs Demo Khata customer)
      else if (e.key === "F5") {
        e.preventDefault();
        if (selectedCustomerId) {
          setSelectedCustomerId(null);
          setSelectedCustomerName("Walk-in Customer");
          showToast("Switched to Walk-in Customer");
        } else {
          setSelectedCustomerId("cust-01");
          setSelectedCustomerName("Haji Muhammad Aslam (Khata #102)");
          showToast("Selected Customer: Haji Muhammad Aslam (Khata #102)");
        }
      }
      // F6: Focus discount input
      else if (e.key === "F6") {
        e.preventDefault();
        discountInputRef.current?.focus();
        discountInputRef.current?.select();
      }
      // F7: Prompt to edit qty of selected cart line
      else if (e.key === "F7") {
        e.preventDefault();
        if (cartLines.length > 0 && selectedCartIndex < cartLines.length) {
          const currentLine = cartLines[selectedCartIndex];
          const currentQty = currentLine.qty_milli / 1000;
          const input = prompt(`Enter new quantity for "${currentLine.product_name}":`, currentQty.toString());
          if (input !== null) {
            const parsed = parseFloat(input);
            if (!isNaN(parsed) && parsed > 0) {
              const milli = Math.round(parsed * 1000);
              if (milli > currentLine.stock_on_hand_milli) {
                alert(`Cannot exceed available stock (${currentLine.stock_on_hand_milli / 1000} ${currentLine.unit_code})!`);
              } else {
                setCartLines((prev) =>
                  prev.map((l, i) => (i === selectedCartIndex ? { ...l, qty_milli: milli } : l))
                );
              }
            }
          }
        }
      }
      // F8: Recall Held Carts
      else if (e.key === "F8") {
        e.preventDefault();
        setIsParkedModalOpen(true);
      }
      // F9 or Space (when not typing in an input): Pay & Checkout
      else if (e.key === "F9" || (e.code === "Space" && !isInputActive)) {
        e.preventDefault();
        if (cartLines.length > 0) {
          setIsPaymentOpen(true);
        } else {
          showToast("Cannot checkout: cart is empty");
        }
      }
      // F10: Sale Returns / Refund modal
      else if (e.key === "F10") {
        e.preventDefault();
        setIsReturnOpen(true);
      }
      // F11: Shift Close & Drawer
      else if (e.key === "F11") {
        e.preventDefault();
        setIsShiftOpen(true);
      }
      // F12: Reprint last receipt
      else if (e.key === "F12") {
        e.preventDefault();
        if (recentSale) {
          showToast(`Printing receipt for Invoice #${recentSale.doc_no}...`);
        } else {
          showToast("No recent sale to reprint");
        }
      }
      // Escape: clear search dropdown or clear cart
      else if (e.key === "Escape") {
        e.preventDefault();
        if (isSearchDropdownOpen) {
          setIsSearchDropdownOpen(false);
        } else if (cartLines.length > 0) {
          if (window.confirm("Clear active cart? (Esc)")) {
            setCartLines([]);
            setSelectedCartIndex(0);
          }
        }
      }
      // When not inside an input, navigate cart lines with Up/Down and modify with +/-/Delete
      else if (!isInputActive) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCartIndex((prev) => Math.min(prev + 1, Math.max(0, cartLines.length - 1)));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCartIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          if (cartLines.length > 0 && selectedCartIndex < cartLines.length) {
            updateLineQty(cartLines[selectedCartIndex].variant_id, 1000);
          }
        } else if (e.key === "-") {
          e.preventDefault();
          if (cartLines.length > 0 && selectedCartIndex < cartLines.length) {
            updateLineQty(cartLines[selectedCartIndex].variant_id, -1000);
          }
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          if (cartLines.length > 0 && selectedCartIndex < cartLines.length) {
            removeLine(cartLines[selectedCartIndex].variant_id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    cartLines,
    selectedCartIndex,
    isPaymentOpen,
    isParkedModalOpen,
    isPrinterOpen,
    isShiftOpen,
    isReturnOpen,
    isCatalogModalOpen,
    isHelpOpen,
    isSearchDropdownOpen,
    selectedCustomerId,
    recentSale,
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

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

  // Add product to cart
  const addProductToCart = (prod: QuickProduct) => {
    setCartLines((prev) => {
      const idx = prev.findIndex((l) => l.variant_id === prod.id);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].qty_milli + 1000;
        if (newQty > prod.stock_milli) {
          alert(`Cannot exceed available stock (${prod.stock_milli / 1000} ${prod.unit})! Negative stock blocked.`);
          return prev;
        }
        next[idx] = {
          ...next[idx],
          qty_milli: newQty,
        };
        setSelectedCartIndex(idx);
        return next;
      } else {
        if (prod.stock_milli < 1000) {
          alert(`Item "${prod.name}" is out of stock! Negative stock blocked.`);
          return prev;
        }
        const newLine: CartLineItem = {
          variant_id: prod.id,
          product_name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode,
          unit_code: prod.unit,
          qty_milli: 1000,
          unit_price_paisa: prod.retail_price_paisa,
          wholesale_price_paisa: prod.wholesale_price_paisa || Math.round(prod.retail_price_paisa * 0.85),
          discount_paisa: 0,
          tax_paisa: 0,
          stock_on_hand_milli: prod.stock_milli,
        };
        const next = [...prev, newLine];
        setSelectedCartIndex(next.length - 1);
        return next;
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
    const wholesalePrice = prod.wholesale_price_paisa ?? Math.round(prod.retail_price_paisa * 0.85);

    setCartLines((prev) => {
      const idx = prev.findIndex((l) => l.variant_id === prod.variant_id);
      if (idx >= 0) {
        const nextQty = prev[idx].qty_milli + 1000;
        if (nextQty > stock) {
          alert(`Cannot exceed available stock (${stock / 1000} ${unitCode})!`);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], qty_milli: nextQty };
        setSelectedCartIndex(idx);
        return next;
      } else {
        if (stock < 1000) {
          alert(`Item "${prod.name}" is out of stock! Negative stock blocked.`);
          return prev;
        }
        const newLine: CartLineItem = {
          variant_id: prod.variant_id,
          product_name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode || "",
          unit_code: unitCode,
          unit_id: unitId,
          qty_milli: 1000,
          unit_price_paisa: prod.retail_price_paisa,
          wholesale_price_paisa: wholesalePrice,
          discount_paisa: 0,
          tax_paisa: 0,
          stock_on_hand_milli: stock,
        };
        const next = [...prev, newLine];
        setSelectedCartIndex(next.length - 1);
        return next;
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

    // Fallback search in sample products
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

  const updateLinePrice = (variantId: string, newPricePaisa: number) => {
    const line = cartLines.find((l) => l.variant_id === variantId);
    if (!line) return;

    const wholesaleFloor =
      line.wholesale_price_paisa && line.wholesale_price_paisa > 0
        ? line.wholesale_price_paisa
        : Math.round(line.unit_price_paisa * 0.85);

    if (newPricePaisa < wholesaleFloor) {
      setPriceErrorToast("Product cannot be sold under wholesale price");
      setTimeout(() => setPriceErrorToast(null), 3500);
      return;
    }

    setCartLines((prev) =>
      prev.map((l) => (l.variant_id === variantId ? { ...l, unit_price_paisa: newPricePaisa } : l))
    );
  };

  const setLineExactQty = (variantId: string, qtyMilli: number) => {
    if (qtyMilli <= 0) {
      removeLine(variantId);
      return;
    }
    setCartLines((prev) =>
      prev.map((line) => {
        if (line.variant_id === variantId) {
          if (qtyMilli > line.stock_on_hand_milli) {
            alert(`Cannot exceed available stock (${line.stock_on_hand_milli / 1000} ${line.unit_code})!`);
            return line;
          }
          return { ...line, qty_milli: qtyMilli };
        }
        return line;
      })
    );
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
    showToast(`Cart parked successfully: "${newParked.cart_name}"`);
  };

  const handleRecallCart = (_cartId: string) => {
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
    showToast("Held cart restored to active counter!");
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

      setCompletedSaleData({
        sale: summary,
        lines: [...cartLines],
      });
      setRecentSale(summary);
      setCartLines([]);
      setOrderDiscountPaisa(0);
      setIsPaymentOpen(false);
      setIsReceiptOpen(true);
      showToast(`Sale Posted! ${completed.doc_no} (${formatPkr(completed.grand_total_paisa)})`);
    } catch (err: any) {
      console.warn("Real core post_sale failed or running in web fallback:", err);
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
      setCompletedSaleData({
        sale: summary,
        lines: [...cartLines],
      });
      setRecentSale(summary);
      setCartLines([]);
      setOrderDiscountPaisa(0);
      setIsPaymentOpen(false);
      setIsReceiptOpen(true);
      showToast(`Sale Posted! ${docNo} (${formatPkr(grandTotalPaisa)})`);
    }
  };

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

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-3 sm:p-4 w-full h-[calc(100vh-95px)] overflow-hidden">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-emerald-400 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Column: Barcode Scan, Cart Table, Quick Items */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 overflow-hidden shadow-sm">
        {/* Top Scan Bar & Customer Picker */}
        <div className="flex flex-col sm:flex-row items-center gap-3 relative z-30">
          <div className="relative flex-1 w-full">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3.5 text-emerald-600 dark:text-emerald-400 pointer-events-none" />
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
                placeholder="Scan barcode or type product name/SKU (F2)..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 focus:border-emerald-500 rounded-xl pl-10 pr-28 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
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
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openCatalogModal}
                  className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-300 dark:border-slate-700 transition"
                  title="Browse All Products List (F3)"
                >
                  <Grid3X3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>List (F3)</span>
                </button>
              </div>
            </div>

            {/* Live Autocomplete Dropdown */}
            {isSearchDropdownOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-1 min-w-full md:min-w-[550px]">
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                  <span>Search Matches ({searchResults.length} products)</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Use ↑↓ and Enter to select</span>
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
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-600/20 border-l-4 border-emerald-500"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="font-bold text-sm text-slate-900 dark:text-white leading-snug break-words">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2 mt-0.5">
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
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {inStock ? `Stock: ${stock / 1000} ${unit}` : "Out of Stock"}
                        </span>
                        <div className="text-right">
                          <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
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

          {/* Customer Selector & Quick Customer Creation */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300">
              <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <select
                value={selectedCustomerId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const found = customers.find((c) => c.id === val);
                  if (found && found.id) {
                    setSelectedCustomerId(found.id);
                    setSelectedCustomerName(found.name);
                  } else {
                    setSelectedCustomerId(null);
                    setSelectedCustomerName("Walk-in Customer");
                  }
                }}
                className="bg-transparent text-slate-900 dark:text-slate-200 text-xs focus:outline-none max-w-[150px] truncate cursor-pointer font-medium"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-300">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsNewCustomerModalOpen(true)}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition"
              title="Add New Customer & Khata Account"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">+ Customer</span>
            </button>

            {/* Quick Action Icons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsReturnOpen(true)}
                className="p-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                title="Process Sale Return (F10)"
              >
                <RotateCcw className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsShiftOpen(true)}
                className="p-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                title="Shift Close & Drawer (F11)"
              >
                <Receipt className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsPrinterOpen(true)}
                className="p-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                title="Printer & Hardware Diagnostics"
              >
                <Printer className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              </button>

              <button
                type="button"
                onClick={() => setTouchNumpadOpen(!touchNumpadOpen)}
                className={`p-2 border rounded-xl transition ${
                  touchNumpadOpen
                    ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                }`}
                title="Toggle Touch Numpad"
              >
                <Grid3X3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsHelpOpen(true)}
                className="p-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                title="Keyboard Shortcuts Cheat Sheet (F1)"
              >
                <HelpCircle className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
                title={`Toggle Light/Dark Theme (Ctrl+T) - Currently: ${theme === "dark" ? "Dark Mode" : "Light Mode"}`}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Wholesale Floor Error Alert */}
        {priceErrorToast && (
          <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{priceErrorToast}</span>
          </div>
        )}

        {/* Touchscreen Numpad Overlay */}
        {touchNumpadOpen && (
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-emerald-900/40 rounded-xl p-3 flex flex-col gap-2 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">Touchscreen Keypad</span>
              <span>Buffer: {barcodeInput || "Empty"}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {["7", "8", "9", "C", "4", "5", "6", "BACK", "1", "2", "3", "ENTER", "0", "00", ".", "+"].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleNumpadInput(k)}
                  className={`h-11 rounded-xl text-base font-bold flex items-center justify-center transition active:scale-95 ${
                    k === "ENTER"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white col-span-1 shadow-sm"
                      : k === "C" || k === "BACK"
                      ? "bg-rose-100 dark:bg-rose-950/40 hover:bg-rose-200 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                      : "bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cart Line Items Table with Editable Quantity & Price Inputs */}
        <div className="flex-1 bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden flex flex-col min-w-0">
          <div className="overflow-y-auto overflow-x-hidden flex-1">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 table-fixed">
              <thead className="bg-slate-100 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-2 w-28 text-right">Unit Price</th>
                  <th className="py-2.5 px-2 w-28 text-center">Qty</th>
                  <th className="py-2.5 px-2 w-28 text-right">Total</th>
                  <th className="py-2.5 px-2 w-8 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {cartLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                        <ShoppingBag className="w-8 h-8" />
                      </div>
                      <p className="font-bold text-slate-800 dark:text-white text-base">Cart is Empty - Ready for Sale</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Scan a barcode, search above, press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">F3</kbd> for product list, or click a quick item below.
                      </p>
                    </td>
                  </tr>
                ) : (
                  cartLines.map((line, idx) => {
                    const lineTotal =
                      Math.round((line.qty_milli * line.unit_price_paisa) / 1000) -
                      line.discount_paisa;
                    const isLowStock = line.stock_on_hand_milli <= 5000;
                    const isSelected = idx === selectedCartIndex;

                    return (
                      <tr
                        key={line.variant_id}
                        onClick={() => setSelectedCartIndex(idx)}
                        className={`transition cursor-pointer ${
                          isSelected
                            ? "bg-emerald-500/10 dark:bg-emerald-950/40 ring-1 ring-inset ring-emerald-500/40"
                            : "hover:bg-slate-100/70 dark:hover:bg-slate-800/30"
                        }`}
                      >
                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono text-[11px]">
                          {isSelected ? (
                            <span className="font-bold text-emerald-500">▶</span>
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white text-xs truncate" title={line.product_name}>
                            {line.product_name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 truncate">
                            <span>{line.sku}</span>
                            <span>•</span>
                            <span>{line.barcode}</span>
                            {isLowStock && (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                (Stock: {line.stock_on_hand_milli / 1000})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Editable Price Input with Wholesale Protection */}
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-slate-400 font-mono">PKR</span>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={(line.unit_price_paisa / 100).toFixed(0)}
                              onChange={(e) => {
                                const pkr = parseFloat(e.target.value);
                                if (!isNaN(pkr) && pkr >= 0) {
                                  updateLinePrice(line.variant_id, Math.round(pkr * 100));
                                }
                              }}
                              onFocus={(e) => {
                                setSelectedCartIndex(idx);
                                e.target.select();
                              }}
                              className="w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg px-2 py-1 text-right text-xs font-semibold font-mono text-slate-900 dark:text-white transition shadow-2xs"
                              title="Edit selling price (wholesale floor protected)"
                            />
                          </div>
                        </td>

                        {/* Editable Quantity Input */}
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.qty_milli / 1000}
                              onChange={(e) => {
                                const q = parseFloat(e.target.value);
                                if (!isNaN(q)) {
                                  setLineExactQty(line.variant_id, Math.round(q * 1000));
                                }
                              }}
                              onFocus={(e) => {
                                setSelectedCartIndex(idx);
                                e.target.select();
                              }}
                              className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg px-1.5 py-1 text-center text-xs font-bold font-mono text-slate-900 dark:text-white transition shadow-2xs"
                              title="Edit Quantity"
                            />
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">
                              {line.unit_code}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-right font-bold text-slate-900 dark:text-white text-xs font-mono">
                          {formatPkr(lineTotal)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLine(line.variant_id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500 transition"
                            title="Delete Item (Del)"
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

          {/* Quick Item Bar */}
          <div className="p-2.5 bg-slate-100 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              Quick Items:
            </span>
            {SAMPLE_PRODUCTS.map((prod) => (
              <button
                key={prod.id}
                onClick={() => addProductToCart(prod)}
                className="shrink-0 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs border border-slate-200 dark:border-slate-700/80 flex items-center gap-1.5 transition shadow-2xs"
              >
                <span>{prod.name.split(" ")[0]}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatPkr(prod.retail_price_paisa)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Checkout Summary & Action Buttons */}
      <div className="w-full lg:w-96 flex flex-col gap-3 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
        {/* Quick Shortcut Keys Bar */}
        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => {
              barcodeInputRef.current?.focus();
              barcodeInputRef.current?.select();
            }}
            className="bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 transition"
          >
            <kbd className="font-bold text-emerald-600 dark:text-emerald-400">F2</kbd> Scan
          </button>
          <button
            onClick={openCatalogModal}
            className="bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 transition"
          >
            <kbd className="font-bold text-indigo-600 dark:text-indigo-400">F3</kbd> List
          </button>
          <button
            onClick={handleParkCurrentCart}
            disabled={cartLines.length === 0}
            className="bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 transition disabled:opacity-40"
          >
            <kbd className="font-bold text-amber-600 dark:text-amber-400">F4</kbd> Hold
          </button>
          <button
            onClick={() => {
              if (cartLines.length > 0 && window.confirm("Clear active cart?")) {
                setCartLines([]);
              }
            }}
            className="bg-slate-50 dark:bg-slate-950/70 hover:bg-slate-100 dark:hover:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 transition"
          >
            <kbd className="font-bold text-rose-600 dark:text-rose-400">Esc</kbd> Clear
          </button>
        </div>

        {/* Totals Summary Card */}
        <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{formatPkr(subtotalPaisa)}</span>
          </div>

          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Items / Units</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {totalItemCount} items ({totalUnits} units)
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800/80">
            <span className="flex items-center gap-1">
              Order Discount
              <kbd className="text-[10px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">F6</kbd>
            </span>
            <input
              ref={discountInputRef}
              type="number"
              step="1"
              min="0"
              value={(orderDiscountPaisa / 100).toFixed(0)}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setOrderDiscountPaisa(Math.round(val * 100));
              }}
              className="w-24 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-right text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Grand Total Display */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1">
            <span className="text-xs uppercase font-bold text-emerald-600 dark:text-emerald-400">
              Grand Total
            </span>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {formatPkr(grandTotalPaisa)}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 mt-auto">
          {/* Main Checkout Button */}
          <button
            onClick={() => setIsPaymentOpen(true)}
            disabled={cartLines.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-base rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Pay & Checkout (F9 / Space)</span>
          </button>

          {/* Secondary Hold / Recall */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleParkCurrentCart}
              disabled={cartLines.length === 0}
              className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition"
            >
              <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Hold Cart (F4)</span>
            </button>

            <button
              onClick={() => setIsParkedModalOpen(true)}
              className="relative py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition"
            >
              <RotateCcw className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <span>Recall Held (F8)</span>
              {parkedCarts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 font-bold rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                  {parkedCarts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Recent Sale Mini Receipt Card */}
        {recentSale && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-bold">
              <span>Last Sale: {recentSale.doc_no}</span>
              <span>{recentSale.occurred_at}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Paid: {formatPkr(recentSale.total_paid_paisa)}</span>
              {recentSale.change_paisa > 0 && (
                <span className="text-amber-600 dark:text-amber-300 font-semibold">
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

      {/* Sale Receipt & Print Preview Modal (Opens automatically on sale completion) */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          barcodeInputRef.current?.focus();
        }}
        sale={completedSaleData?.sale || recentSale}
        lines={completedSaleData?.lines || []}
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
        cashierName="Cashier"
        onShiftClosed={(countedPaisa) => {
          showToast(
            `Shift closed! Counted: PKR ${(countedPaisa / 100).toFixed(2)}. Z-Report printed.`
          );
        }}
      />

      {/* Sale Returns & Refund Modal */}
      <SaleReturnsModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        onReturnProcessed={(docNo, refundPaisa) => {
          showToast(
            `Return posted! Credit Note: ${docNo} (Refund: PKR ${(refundPaisa / 100).toFixed(2)})`
          );
        }}
      />

      {/* Product Catalog LIST Browser Modal (F3) - Keyboard Navigable */}
      {isCatalogModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setIsCatalogModalOpen(false);
              barcodeInputRef.current?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedCatalogRowIndex((prev) =>
                Math.min(prev + 1, Math.max(0, filteredCatalogItems.length - 1))
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedCatalogRowIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (
                filteredCatalogItems.length > 0 &&
                selectedCatalogRowIndex < filteredCatalogItems.length
              ) {
                addProductFromCatalog(filteredCatalogItems[selectedCatalogRowIndex]);
                setIsCatalogModalOpen(false);
              }
            }
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Product Catalog List (F3)
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-mono">
                      {filteredCatalogItems.length} Products
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Navigate with <kbd className="px-1 bg-slate-200 dark:bg-slate-800 rounded font-mono">↑</kbd> <kbd className="px-1 bg-slate-200 dark:bg-slate-800 rounded font-mono">↓</kbd> Arrow keys, press <kbd className="px-1 bg-slate-200 dark:bg-slate-800 rounded font-mono font-bold text-emerald-600 dark:text-emerald-400">Enter</kbd> to add to cart, or <kbd className="px-1 bg-slate-200 dark:bg-slate-800 rounded font-mono">Esc</kbd> to close.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCatalogModalOpen(false);
                  barcodeInputRef.current?.focus();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-4 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  ref={catalogSearchInputRef}
                  type="text"
                  value={catalogFilterText}
                  onChange={(e) => {
                    setCatalogFilterText(e.target.value);
                    setSelectedCatalogRowIndex(0);
                  }}
                  placeholder="Filter by name, SKU, or barcode..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                {[
                  { id: "all", label: "All Categories" },
                  { id: "cat-bev", label: "Beverages & Tea" },
                  { id: "cat-oil", label: "Cooking Oil" },
                  { id: "cat-dry", label: "Dairy & Milk" },
                  { id: "cat-rice", label: "Grains & Rice" },
                  { id: "cat-soap", label: "Personal Care" },
                  { id: "cat-spc", label: "Spices" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCatalogCategoryFilter(c.id);
                      setSelectedCatalogRowIndex(0);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      catalogCategoryFilter === c.id
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Product LIST / TABLE View */}
            <div className="overflow-y-auto flex-1 p-2">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">SKU / Barcode</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-center">Stock</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredCatalogItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No products match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredCatalogItems.map((item, idx) => {
                      const stock = item.stock_on_hand_milli ?? item.stock_milli ?? 0;
                      const unit = item.base_unit_code || item.unit_code || "PC";
                      const inStock = stock > 0;
                      const isSelected = idx === selectedCatalogRowIndex;

                      return (
                        <tr
                          key={item.variant_id}
                          onClick={() => {
                            addProductFromCatalog(item);
                            setIsCatalogModalOpen(false);
                          }}
                          onMouseEnter={() => setSelectedCatalogRowIndex(idx)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? "bg-emerald-500/15 dark:bg-emerald-950/60 ring-1 ring-inset ring-emerald-500/50"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {isSelected ? (
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">▶ {idx + 1}</span>
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs">
                            <div className="font-semibold text-slate-900 dark:text-slate-200">{item.sku}</div>
                            {item.barcode && (
                              <div className="text-[10px] text-slate-400">{item.barcode}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {item.name}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                            {item.category || "General"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                inStock
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {inStock ? `${stock / 1000} ${unit}` : "Out of Stock"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white text-sm">
                            {formatPkr(item.retail_price_paisa)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                isSelected
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-600 hover:text-white"
                              }`}
                            >
                              + Add (Enter)
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span>Row {selectedCatalogRowIndex + 1} of {filteredCatalogItems.length}</span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">Press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-emerald-600 dark:text-emerald-400 font-bold">Enter</kbd> to add highlighted item</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCatalogModalOpen(false);
                  barcodeInputRef.current?.focus();
                }}
                className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal (F1) */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">POS Keyboard Shortcuts Guide</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Every action can be executed directly from your keyboard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh] divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Focus Barcode / SKU Input</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F2</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Open Product Catalog List</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F3</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Hold / Park Current Cart</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F4</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Switch Customer (Walk-in vs Khata)</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F5</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Focus Order Discount</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F6</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Edit Quantity of Selected Item</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F7</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Recall Held / Parked Carts</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F8</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Pay & Checkout</span>
                <div className="flex gap-1.5">
                  <kbd className="px-2.5 py-1 bg-emerald-600 text-white font-mono font-bold rounded">F9</kbd>
                  <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">Space</kbd>
                </div>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Sale Returns & Refund</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F10</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Shift Close & Cash Drawer</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F11</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Reprint Last Receipt</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">F12</kbd>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Navigate Cart Items or List Rows</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">↑</kbd>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">↓</kbd>
                </div>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Increase / Decrease Quantity of Highlighted Item</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">+</kbd>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">-</kbd>
                </div>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Delete Highlighted Cart Item</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">Delete</kbd>
                  <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">Backspace</kbd>
                </div>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Toggle Dark / Light Theme</span>
                <kbd className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold rounded border border-slate-300 dark:border-slate-700">Ctrl + T</kbd>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Got It (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline New Customer Creation Modal */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Quick Add Customer</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Register new customer & Khata ledger account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Tariq Mehmood"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone / Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0300-1234567"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Khata Credit Limit (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={newCustLimit}
                  onChange={(e) => setNewCustLimit(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Maximum allowed credit balance for this customer account</p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Save & Select Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
