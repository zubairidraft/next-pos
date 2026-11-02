import React, { useState, useEffect } from "react";
import {
  Truck,
  Plus,
  Boxes,
  Users,
  Search,
  CheckCircle2,
  Package,
  X,
  FileSpreadsheet,
} from "lucide-react";

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  ntn?: string;
  credit_limit_paisa: number;
  opening_balance_paisa: number;
  current_balance_paisa?: number;
}

interface StockBalanceItem {
  variant_id: string;
  product_id: string;
  sku: string;
  name: string;
  barcode?: string;
  unit_code: string;
  on_hand_milli: number;
  avg_cost_paisa: number;
  total_valuation_paisa: number;
}

interface PurchaseInvoiceRecord {
  id: string;
  doc_no: string;
  vendor_id: string;
  vendor_name: string;
  vendor_invoice_no?: string;
  status: string;
  freight_paisa: number;
  total_paisa: number;
  created_at: string;
}

interface PurchaseLineDraft {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  unit_code: string;
  qty: number;
  unit_cost_pkr: number;
}

interface PurchasingViewProps {
  initialTab?: "invoices" | "stock" | "vendors";
}

export const PurchasingView: React.FC<PurchasingViewProps> = ({ initialTab = "invoices" }) => {
  const [activeTab, setActiveTab] = useState<"invoices" | "stock" | "vendors">(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({
    name: "",
    phone: "",
    ntn: "",
    credit_limit_pkr: 500000,
    opening_balance_pkr: 0,
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Sample data initialized from domain repositories
  const [vendors, setVendors] = useState<Vendor[]>([
    {
      id: "v-1",
      name: "Shan Foods Distributor",
      phone: "0300-1234567",
      ntn: "1234567-8",
      credit_limit_paisa: 50000000,
      opening_balance_paisa: 1500000,
      current_balance_paisa: 11500000,
    },
    {
      id: "v-2",
      name: "National Foods Limited",
      phone: "0321-9876543",
      ntn: "7654321-0",
      credit_limit_paisa: 100000000,
      opening_balance_paisa: 0,
      current_balance_paisa: 4200000,
    },
    {
      id: "v-3",
      name: "Tapal Tea Agency",
      phone: "0333-5551234",
      ntn: "9871234-5",
      credit_limit_paisa: 30000000,
      opening_balance_paisa: 500000,
      current_balance_paisa: 2800000,
    },
    {
      id: "v-4",
      name: "Dalda Foods Distribution",
      phone: "0301-4455667",
      ntn: "3491238-1",
      credit_limit_paisa: 80000000,
      opening_balance_paisa: 2500000,
      current_balance_paisa: 18500000,
    },
  ]);

  const [stockBalances, setStockBalances] = useState<StockBalanceItem[]>([
    {
      variant_id: "var-1",
      product_id: "p-1",
      sku: "SHAN-BIR-50G",
      name: "Shan Special Bombay Biryani Masala 50g",
      barcode: "8964000101112",
      unit_code: "PCS",
      on_hand_milli: 120000,
      avg_cost_paisa: 9500,
      total_valuation_paisa: 1140000,
    },
    {
      variant_id: "var-2",
      product_id: "p-2",
      sku: "TAP-DAN-400G",
      name: "Tapal Danedar Tea 400g Pouch",
      barcode: "8961011002231",
      unit_code: "PCS",
      on_hand_milli: 45000,
      avg_cost_paisa: 72000,
      total_valuation_paisa: 3240000,
    },
    {
      variant_id: "var-3",
      product_id: "p-3",
      sku: "BAS-RICE-SUPER",
      name: "Super Basmati Rice 1kg Pack",
      barcode: "8961000005423",
      unit_code: "KG",
      on_hand_milli: 250000,
      avg_cost_paisa: 32000,
      total_valuation_paisa: 8000000,
    },
    {
      variant_id: "var-4",
      product_id: "p-4",
      sku: "DALDA-OIL-5L",
      name: "Dalda Cooking Oil 5L Tin",
      barcode: "8961000008899",
      unit_code: "CAN",
      on_hand_milli: 18000,
      avg_cost_paisa: 265000,
      total_valuation_paisa: 4770000,
    },
    {
      variant_id: "var-5",
      product_id: "p-5",
      sku: "OLP-MLK-1L",
      name: "Olper's Full Cream Milk 1000ml",
      barcode: "8961014003036",
      unit_code: "PC",
      on_hand_milli: 80000,
      avg_cost_paisa: 24000,
      total_valuation_paisa: 1920000,
    },
  ]);

  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>([
    {
      id: "inv-101",
      doc_no: "PINV-2026-001",
      vendor_id: "v-1",
      vendor_name: "Shan Foods Distributor",
      vendor_invoice_no: "SF-88902",
      status: "received",
      freight_paisa: 150000,
      total_paisa: 24500000,
      created_at: "2026-10-28 11:30 AM",
    },
    {
      id: "inv-102",
      doc_no: "PINV-2026-002",
      vendor_id: "v-2",
      vendor_name: "National Foods Limited",
      vendor_invoice_no: "NFL-PK-4421",
      status: "received",
      freight_paisa: 200000,
      total_paisa: 41200000,
      created_at: "2026-10-29 03:15 PM",
    },
  ]);

  // Invoice Draft State
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState("");
  const [freightPkr, setFreightPkr] = useState<number>(0);
  const [invoiceLines, setInvoiceLines] = useState<PurchaseLineDraft[]>([
    {
      id: "line-1",
      variant_id: "var-1",
      sku: "SHAN-BIR-50G",
      product_name: "Shan Special Bombay Biryani Masala 50g",
      unit_code: "PCS",
      qty: 50,
      unit_cost_pkr: 92.5,
    },
  ]);

  const handleAddLine = () => {
    const defaultItem = stockBalances[0];
    const newLine: PurchaseLineDraft = {
      id: `line-${Date.now()}`,
      variant_id: defaultItem.variant_id,
      sku: defaultItem.sku,
      product_name: defaultItem.name,
      unit_code: defaultItem.unit_code,
      qty: 10,
      unit_cost_pkr: defaultItem.avg_cost_paisa / 100,
    };
    setInvoiceLines([...invoiceLines, newLine]);
  };

  const handleRemoveLine = (id: string) => {
    setInvoiceLines(invoiceLines.filter((l) => l.id !== id));
  };

  const handleLineChange = (id: string, field: keyof PurchaseLineDraft, value: any) => {
    setInvoiceLines(
      invoiceLines.map((line) => {
        if (line.id !== id) return line;
        if (field === "variant_id") {
          const prod = stockBalances.find((p) => p.variant_id === value);
          if (prod) {
            return {
              ...line,
              variant_id: prod.variant_id,
              sku: prod.sku,
              product_name: prod.name,
              unit_code: prod.unit_code,
              unit_cost_pkr: prod.avg_cost_paisa / 100,
            };
          }
        }
        return { ...line, [field]: value };
      })
    );
  };

  // Landed Cost Calculations
  const subtotalPkr = invoiceLines.reduce(
    (acc, line) => acc + (line.qty || 0) * (line.unit_cost_pkr || 0),
    0
  );
  const grandTotalPkr = subtotalPkr + (freightPkr || 0);

  const linesWithLandedCost = invoiceLines.map((line) => {
    const lineSubtotal = (line.qty || 0) * (line.unit_cost_pkr || 0);
    const freightShare =
      subtotalPkr > 0 ? ((freightPkr || 0) * lineSubtotal) / subtotalPkr : 0;
    const effectiveTotal = lineSubtotal + freightShare;
    const effectiveUnitCost = line.qty > 0 ? effectiveTotal / line.qty : line.unit_cost_pkr;

    return {
      ...line,
      freightShare,
      effectiveUnitCost,
      lineTotal: effectiveTotal,
    };
  });

  const handlePostInvoice = () => {
    if (!selectedVendorId) {
      alert("Please select a vendor for this purchase invoice.");
      return;
    }
    const vendor = vendors.find((v) => v.id === selectedVendorId);
    const docNo = `PINV-2026-${String(invoices.length + 1).padStart(3, "0")}`;

    const newInvoice: PurchaseInvoiceRecord = {
      id: `inv-${Date.now()}`,
      doc_no: docNo,
      vendor_id: selectedVendorId,
      vendor_name: vendor?.name || "Unknown Supplier",
      vendor_invoice_no: vendorInvoiceNo || undefined,
      status: "received",
      freight_paisa: Math.round((freightPkr || 0) * 100),
      total_paisa: Math.round(grandTotalPkr * 100),
      created_at: new Date().toLocaleString(),
    };

    setInvoices([newInvoice, ...invoices]);

    // Recalculate stock balances & valuation
    const updatedStock = stockBalances.map((item) => {
      const draftLine = linesWithLandedCost.find((l) => l.variant_id === item.variant_id);
      if (!draftLine) return item;

      const currentQty = item.on_hand_milli / 1000;
      const currentValuationPaisa = item.total_valuation_paisa;
      const addedQty = draftLine.qty;
      const addedValuationPaisa = Math.round(draftLine.lineTotal * 100);

      const newQty = currentQty + addedQty;
      const newValuation = currentValuationPaisa + addedValuationPaisa;
      const newAvgCostPaisa = newQty > 0 ? Math.round(newValuation / newQty) : item.avg_cost_paisa;

      return {
        ...item,
        on_hand_milli: Math.round(newQty * 1000),
        avg_cost_paisa: newAvgCostPaisa,
        total_valuation_paisa: newValuation,
      };
    });

    setStockBalances(updatedStock);
    setIsInvoiceModalOpen(false);
    setSelectedVendorId("");
    setVendorInvoiceNo("");
    setFreightPkr(0);
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.doc_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.vendor_invoice_no && inv.vendor_invoice_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredStock = stockBalances.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.barcode && item.barcode.includes(searchTerm))
  );

  const filteredVendors = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.phone && v.phone.includes(searchTerm)) ||
      (v.ntn && v.ntn.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-500" />
            Inventory & Purchasing Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Supplier purchase invoices, landed cost allocation (WAC), stock balances, and distributor ledgers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
          >
            <Plus className="w-4 h-4" />
            + New Purchase Invoice
          </button>
        </div>
      </div>

      {/* Tabs Selector & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "invoices"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Purchase Invoices ({invoices.length})
          </button>

          <button
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "stock"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Boxes className="w-4 h-4" />
            Stock Balances & Valuation ({stockBalances.length})
          </button>

          <button
            onClick={() => setActiveTab("vendors")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "vendors"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            Vendors & Distributors ({vendors.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeTab === "vendors" && (
            <button
              onClick={() => setIsAddVendorOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Vendor</span>
            </button>
          )}

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute top-2.5 left-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search records..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Tab 1: Invoices Table */}
      {activeTab === "invoices" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-950/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Invoice #</th>
                  <th className="px-5 py-3.5">Supplier / Vendor</th>
                  <th className="px-5 py-3.5">Vendor Bill #</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Freight (PKR)</th>
                  <th className="px-5 py-3.5 text-right">Total Bill (PKR)</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">{inv.doc_no}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{inv.vendor_name}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-500 dark:text-slate-400">{inv.vendor_invoice_no || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        Received
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                      PKR {(inv.freight_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      PKR {(inv.total_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">{inv.created_at}</td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      No purchase invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Stock Balances & Valuation */}
      {activeTab === "stock" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-950/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">SKU</th>
                  <th className="px-5 py-3.5">Product Name</th>
                  <th className="px-5 py-3.5">Barcode</th>
                  <th className="px-5 py-3.5 text-right">On Hand Qty</th>
                  <th className="px-5 py-3.5 text-right">Avg Cost / Unit</th>
                  <th className="px-5 py-3.5 text-right">Total Valuation</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {filteredStock.map((item) => {
                  const onHandUnits = item.on_hand_milli / 1000;
                  const isLow = onHandUnits <= 20;
                  const isOut = onHandUnits <= 0;

                  return (
                    <tr key={item.variant_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-mono font-semibold text-slate-700 dark:text-slate-300">{item.sku}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-500 dark:text-slate-400">{item.barcode || "—"}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {onHandUnits.toLocaleString()} <span className="text-[11px] font-normal text-slate-500 font-sans">{item.unit_code}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                        PKR {(item.avg_cost_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        PKR {(item.total_valuation_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Vendors Directory */}
      {activeTab === "vendors" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-950/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Vendor / Business Name</th>
                  <th className="px-5 py-3.5">Contact Number</th>
                  <th className="px-5 py-3.5">NTN / Tax ID</th>
                  <th className="px-5 py-3.5 text-right">Credit Limit</th>
                  <th className="px-5 py-3.5 text-right">Payable Balance (Khata)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {filteredVendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">{v.name}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-600 dark:text-slate-300">{v.phone || "—"}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-500 dark:text-slate-400">{v.ntn || "—"}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-600 dark:text-slate-300">
                      PKR {((v.credit_limit_paisa || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      PKR {((v.current_balance_paisa || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add New Vendor Modal */}
      {isAddVendorOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add New Supplier & Distributor</h3>
              </div>
              <button
                onClick={() => setIsAddVendorOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newVendorForm.name.trim();
                if (!name) return;
                const newV: Vendor = {
                  id: `v-${Date.now()}`,
                  name,
                  phone: newVendorForm.phone.trim() || undefined,
                  ntn: newVendorForm.ntn.trim() || undefined,
                  credit_limit_paisa: (newVendorForm.credit_limit_pkr || 500000) * 100,
                  opening_balance_paisa: (newVendorForm.opening_balance_pkr || 0) * 100,
                  current_balance_paisa: (newVendorForm.opening_balance_pkr || 0) * 100,
                };
                setVendors((prev) => [...prev, newV]);
                setNewVendorForm({
                  name: "",
                  phone: "",
                  ntn: "",
                  credit_limit_pkr: 500000,
                  opening_balance_pkr: 0,
                });
                setIsAddVendorOpen(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vendor / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={newVendorForm.name}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
                  placeholder="e.g. Habib Oil Mills Distributor"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={newVendorForm.phone}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  NTN / Business Tax ID
                </label>
                <input
                  type="text"
                  value={newVendorForm.ntn}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, ntn: e.target.value })}
                  placeholder="e.g. 1234567-8"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Credit Limit (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVendorForm.credit_limit_pkr}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, credit_limit_pkr: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Opening Balance (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVendorForm.opening_balance_pkr}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, opening_balance_pkr: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddVendorOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow transition"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Invoice Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6 text-emerald-500" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Record Purchase Invoice (Stock In)</h3>
              </div>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier / Vendor *
                </label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select Vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vendor Invoice / Bilty #
                </label>
                <input
                  type="text"
                  value={vendorInvoiceNo}
                  onChange={(e) => setVendorInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-2026-99"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Freight & Transport Cost (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={freightPkr}
                  onChange={(e) => setFreightPkr(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-500" />
                  Received Items & Landed Cost Breakdown
                </h4>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 flex items-center gap-1 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Add Line Item
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 w-28 text-center">Quantity</th>
                      <th className="px-4 py-3 w-32 text-right">Unit Cost (PKR)</th>
                      <th className="px-4 py-3 w-32 text-right">Allocated Freight</th>
                      <th className="px-4 py-3 w-32 text-right">Effective Cost</th>
                      <th className="px-4 py-3 w-32 text-right">Total (PKR)</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 font-mono">
                    {linesWithLandedCost.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-2 font-sans">
                          <select
                            value={line.variant_id}
                            onChange={(e) => handleLineChange(line.id, "variant_id", e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
                          >
                            {stockBalances.map((item) => (
                              <option key={item.variant_id} value={item.variant_id}>
                                {item.sku} - {item.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(e) => handleLineChange(line.id, "qty", Number(e.target.value))}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white text-center focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={line.unit_cost_pkr}
                            onChange={(e) => handleLineChange(line.id, "unit_cost_pkr", Number(e.target.value))}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">
                          +{line.freightShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {line.effectiveUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white">
                          {line.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-slate-400 hover:text-rose-600 transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary & Post Button */}
            <div className="bg-slate-100 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">Weighted Average Cost (WAC) will automatically update.</span>
                </div>
                <div className="text-slate-500">
                  Total invoice amount will be credited to vendor's payable Khata account.
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Grand Total (PKR)</div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    PKR {grandTotalPkr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePostInvoice}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md"
                >
                  Post Invoice & Update Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
