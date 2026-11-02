import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  name_ur?: string;
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
  name_ur?: string;
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
  qty: number; // in base units
  unit_cost_pkr: number;
}

export const PurchasingView: React.FC = () => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<"invoices" | "stock" | "vendors">("invoices");
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

  // Sample data initialized from domain repositories
  const [vendors, setVendors] = useState<Vendor[]>([
    {
      id: "v-1",
      name: "Shan Foods Distributor",
      name_ur: "شان فوڈز ڈسٹریبیوٹر",
      phone: "0300-1234567",
      ntn: "1234567-8",
      credit_limit_paisa: 50000000,
      opening_balance_paisa: 1500000,
      current_balance_paisa: 11500000,
    },
    {
      id: "v-2",
      name: "National Foods Limited",
      name_ur: "نیشنل فوڈز لمیٹڈ",
      phone: "0321-9876543",
      ntn: "7654321-0",
      credit_limit_paisa: 100000000,
      opening_balance_paisa: 0,
      current_balance_paisa: 4200000,
    },
    {
      id: "v-3",
      name: "Tapal Tea Agency",
      name_ur: "ٹپال چائے ایجنسی",
      phone: "0333-5551234",
      ntn: "9871234-5",
      credit_limit_paisa: 30000000,
      opening_balance_paisa: 500000,
      current_balance_paisa: 2800000,
    },
  ]);

  const [stockBalances, setStockBalances] = useState<StockBalanceItem[]>([
    {
      variant_id: "var-1",
      product_id: "p-1",
      sku: "SHAN-BIR-50G",
      name: "Shan Special Bombay Biryani Masala 50g",
      name_ur: "شان اسپیشل بمبئی بریانی مصالحہ 50 گرام",
      barcode: "8964000101112",
      unit_code: "PCS",
      on_hand_milli: 120000, // 120 pcs
      avg_cost_paisa: 9500,  // PKR 95.00
      total_valuation_paisa: 1140000, // PKR 11,400.00
    },
    {
      variant_id: "var-2",
      product_id: "p-2",
      sku: "TAP-DAN-400G",
      name: "Tapal Danedar Tea 400g Pouch",
      name_ur: "ٹپال دانے دار چائے 400 گرام",
      barcode: "8961011002231",
      unit_code: "PCS",
      on_hand_milli: 45000, // 45 pcs
      avg_cost_paisa: 72000, // PKR 720.00
      total_valuation_paisa: 3240000, // PKR 32,400.00
    },
    {
      variant_id: "var-3",
      product_id: "p-3",
      sku: "BAS-RICE-SUPER",
      name: "Super Basmati Rice 1kg Pack",
      name_ur: "سپر باسپتی چاول 1 کلو پیک",
      barcode: "8961234500019",
      unit_code: "KG",
      on_hand_milli: 8000, // 8 kg (Low Stock)
      avg_cost_paisa: 34000, // PKR 340.00
      total_valuation_paisa: 272000, // PKR 2,720.00
    },
  ]);

  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>([
    {
      id: "pur-1",
      doc_no: "PUR-000001",
      vendor_id: "v-1",
      vendor_name: "Shan Foods Distributor",
      vendor_invoice_no: "SHAN-9841",
      status: "received",
      freight_paisa: 50000, // PKR 500.00
      total_paisa: 1000000, // PKR 10,000.00
      created_at: "2026-10-29 11:30 AM",
    },
    {
      id: "pur-2",
      doc_no: "PUR-000002",
      vendor_id: "v-3",
      vendor_name: "Tapal Tea Agency",
      vendor_invoice_no: "TAP-2026-104",
      status: "received",
      freight_paisa: 80000, // PKR 800.00
      total_paisa: 3240000, // PKR 32,400.00
      created_at: "2026-10-29 01:15 PM",
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
      qty: 100,
      unit_cost_pkr: 95,
    },
  ]);

  // Calculations for landed cost & WAC
  const goodsSubtotalPkr = invoiceLines.reduce((acc, l) => acc + l.qty * l.unit_cost_pkr, 0);
  const grandTotalPkr = goodsSubtotalPkr + (Number(freightPkr) || 0);

  // Proportional landed cost calculation per line
  const linesWithLandedCost = invoiceLines.map((line) => {
    const lineTotal = line.qty * line.unit_cost_pkr;
    const freightShare = goodsSubtotalPkr > 0 ? (lineTotal * (Number(freightPkr) || 0)) / goodsSubtotalPkr : 0;
    const effectiveTotal = lineTotal + freightShare;
    const effectiveUnitCost = line.qty > 0 ? effectiveTotal / line.qty : line.unit_cost_pkr;
    return {
      ...line,
      lineTotal,
      freightShare,
      effectiveUnitCost,
    };
  });

  const handleAddLine = () => {
    const defaultItem = stockBalances[0];
    setInvoiceLines([
      ...invoiceLines,
      {
        id: `line-${Date.now()}`,
        variant_id: defaultItem.variant_id,
        sku: defaultItem.sku,
        product_name: defaultItem.name,
        unit_code: defaultItem.unit_code,
        qty: 10,
        unit_cost_pkr: defaultItem.avg_cost_paisa / 100,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (invoiceLines.length > 1) {
      setInvoiceLines(invoiceLines.filter((l) => l.id !== id));
    }
  };

  const handleLineChange = (id: string, field: "variant_id" | "qty" | "unit_cost_pkr", value: any) => {
    setInvoiceLines(
      invoiceLines.map((l) => {
        if (l.id === id) {
          if (field === "variant_id") {
            const match = stockBalances.find((sb) => sb.variant_id === value);
            if (match) {
              return {
                ...l,
                variant_id: match.variant_id,
                sku: match.sku,
                product_name: match.name,
                unit_code: match.unit_code,
                unit_cost_pkr: match.avg_cost_paisa / 100,
              };
            }
          }
          return { ...l, [field]: value };
        }
        return l;
      })
    );
  };

  const handlePostInvoice = () => {
    if (!selectedVendorId) {
      alert("Please select a vendor.");
      return;
    }

    const vendor = vendors.find((v) => v.id === selectedVendorId);
    const newDocNo = `PUR-${String(invoices.length + 1).padStart(6, "0")}`;

    const newInvoice: PurchaseInvoiceRecord = {
      id: `pur-${Date.now()}`,
      doc_no: newDocNo,
      vendor_id: selectedVendorId,
      vendor_name: vendor ? vendor.name : "Vendor",
      vendor_invoice_no: vendorInvoiceNo || undefined,
      status: "received",
      freight_paisa: Math.round((Number(freightPkr) || 0) * 100),
      total_paisa: Math.round(grandTotalPkr * 100),
      created_at: new Date().toLocaleString(),
    };

    // Update stock balances and WAC
    const updatedStock = stockBalances.map((sb) => {
      const match = linesWithLandedCost.find((l) => l.variant_id === sb.variant_id);
      if (match) {
        const curOnHand = sb.on_hand_milli;
        const inboundMilli = match.qty * 1000;
        const curCostPaisa = sb.avg_cost_paisa;
        const inboundCostPaisa = Math.round(match.effectiveUnitCost * 100);

        const newOnHand = curOnHand + inboundMilli;
        const currentVal = (curOnHand * curCostPaisa) / 1000;
        const inboundVal = (inboundMilli * inboundCostPaisa) / 1000;
        const newAvgCostPaisa = newOnHand > 0 ? ((currentVal + inboundVal) * 1000) / newOnHand : inboundCostPaisa;

        return {
          ...sb,
          on_hand_milli: newOnHand,
          avg_cost_paisa: Math.round(newAvgCostPaisa),
          total_valuation_paisa: Math.round((newOnHand * newAvgCostPaisa) / 1000),
        };
      }
      return sb;
    });

    setStockBalances(updatedStock);
    setInvoices([newInvoice, ...invoices]);
    setIsInvoiceModalOpen(false);
    setSelectedVendorId("");
    setVendorInvoiceNo("");
    setFreightPkr(0);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Truck className="w-7 h-7 text-emerald-400" />
            {t("purchasing.title")}
          </h2>
          <p className="text-slate-400 text-sm mt-1">{t("purchasing.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsInvoiceModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-lg shadow-emerald-950/40 hover:shadow-emerald-900/50"
          >
            <Plus className="w-4 h-4" />
            {t("purchasing.new_invoice_btn")}
          </button>
        </div>
      </div>

      {/* Tabs Selector & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "invoices"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t("purchasing.tab_invoices")}
          </button>

          <button
            onClick={() => setActiveTab("stock")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "stock"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Boxes className="w-4 h-4" />
            {t("purchasing.tab_stock")}
          </button>

          <button
            onClick={() => setActiveTab("vendors")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "vendors"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            {t("purchasing.tab_vendors")}
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
            <Search className="w-4 h-4 text-slate-500 absolute top-3 left-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search records..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Tab 1: Invoices Table */}
      {activeTab === "invoices" && (
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">{t("purchasing.doc_no")}</th>
                  <th className="px-6 py-4">{t("purchasing.vendor")}</th>
                  <th className="px-6 py-4">{t("purchasing.vendor_invoice_no")}</th>
                  <th className="px-6 py-4">{t("purchasing.status")}</th>
                  <th className="px-6 py-4">{t("purchasing.freight")}</th>
                  <th className="px-6 py-4">{t("purchasing.total")}</th>
                  <th className="px-6 py-4">{t("purchasing.created_at")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-emerald-400">{inv.doc_no}</td>
                    <td className="px-6 py-4 font-sans font-medium text-white">{inv.vendor_name}</td>
                    <td className="px-6 py-4 text-slate-400">{inv.vendor_invoice_no || "—"}</td>
                    <td className="px-6 py-4 font-sans">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        {t("purchasing.received")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      PKR {(inv.freight_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 font-bold text-white">
                      PKR {(inv.total_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-xs font-sans text-slate-400">{inv.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Stock Balances & Valuation */}
      {activeTab === "stock" && (
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">{t("purchasing.sku")}</th>
                  <th className="px-6 py-4">{t("purchasing.product_name")}</th>
                  <th className="px-6 py-4">{t("purchasing.barcode")}</th>
                  <th className="px-6 py-4">{t("purchasing.on_hand")}</th>
                  <th className="px-6 py-4">{t("purchasing.avg_cost")}</th>
                  <th className="px-6 py-4">{t("purchasing.valuation")}</th>
                  <th className="px-6 py-4">{t("purchasing.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {stockBalances.map((item) => {
                  const onHandUnits = item.on_hand_milli / 1000;
                  const isLow = onHandUnits <= 10;
                  const isOut = onHandUnits <= 0;

                  return (
                    <tr key={item.variant_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-200">{item.sku}</td>
                      <td className="px-6 py-4 font-sans">
                        <div className="font-medium text-white">{item.name}</div>
                        {item.name_ur && (
                          <div className="text-xs text-emerald-400/80 font-nastaliq mt-0.5">{item.name_ur}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{item.barcode || "—"}</td>
                      <td className="px-6 py-4 font-bold text-white">
                        {onHandUnits.toLocaleString()} <span className="text-xs font-normal text-slate-400 font-sans">{item.unit_code}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        PKR {(item.avg_cost_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-400">
                        PKR {(item.total_valuation_paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 font-sans">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {t("purchasing.status_out_of_stock")}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {t("purchasing.status_low_stock")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {t("purchasing.status_in_stock")}
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
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">{t("purchasing.vendor")}</th>
                  <th className="px-6 py-4">{t("purchasing.vendor_phone")}</th>
                  <th className="px-6 py-4">{t("purchasing.vendor_ntn")}</th>
                  <th className="px-6 py-4">{t("purchasing.outstanding_balance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-sans">
                      <div className="font-semibold text-white">{v.name}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">{v.phone || "—"}</td>
                    <td className="px-6 py-4 text-slate-400">{v.ntn || "—"}</td>
                    <td className="px-6 py-4 font-bold text-amber-400">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Add New Vendor & Distributor</h3>
              </div>
              <button
                onClick={() => setIsAddVendorOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
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
                <label className="block font-semibold text-slate-300 mb-1">
                  Vendor / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={newVendorForm.name}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
                  placeholder="e.g. Habib Oil Mills Distributor"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={newVendorForm.phone}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                  placeholder="0300-1234567"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  NTN / Business Tax ID
                </label>
                <input
                  type="text"
                  value={newVendorForm.ntn}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, ntn: e.target.value })}
                  placeholder="e.g. 1234567-8"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Credit Limit (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVendorForm.credit_limit_pkr}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, credit_limit_pkr: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Opening Balance (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newVendorForm.opening_balance_pkr}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, opening_balance_pkr: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddVendorOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow"
                >
                  Save Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Invoice Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6 text-emerald-400" />
                <h3 className="text-xl font-bold text-white">{t("purchasing.new_invoice_btn")}</h3>
              </div>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Header Form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("purchasing.vendor")} *
                </label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">{t("purchasing.select_vendor")}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("purchasing.vendor_invoice_no")}
                </label>
                <input
                  type="text"
                  value={vendorInvoiceNo}
                  onChange={(e) => setVendorInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-2026-99"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {t("purchasing.freight")} (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={freightPkr}
                  onChange={(e) => setFreightPkr(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-400" />
                  Line Items & Landed Cost Breakdown
                </h4>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("purchasing.add_line")}
                </button>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 w-28">Quantity</th>
                      <th className="px-4 py-3 w-32">Unit Cost (PKR)</th>
                      <th className="px-4 py-3 w-32">Allocated Freight</th>
                      <th className="px-4 py-3 w-32">Effective Cost</th>
                      <th className="px-4 py-3 w-32">Total (PKR)</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono">
                    {linesWithLandedCost.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-900/50">
                        <td className="px-4 py-2 font-sans">
                          <select
                            value={line.variant_id}
                            onChange={(e) => handleLineChange(line.id, "variant_id", e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-sans"
                          >
                            {stockBalances.map((item) => (
                              <option key={item.variant_id} value={item.variant_id}>
                                {item.sku} - {item.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(e) => handleLineChange(line.id, "qty", Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white text-right focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            value={line.unit_cost_pkr}
                            onChange={(e) => handleLineChange(line.id, "unit_cost_pkr", Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white text-right focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-right text-slate-400">
                          +{line.freightShare.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-emerald-400">
                          {line.effectiveUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-white">
                          {line.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-slate-500 hover:text-rose-400 transition-colors"
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
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Weighted Average Cost (WAC) will recalculate based on effective landed cost.</span>
                </div>
                <div className="text-slate-500">
                  Total invoice amount will be credited to vendor's Khata account.
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Grand Total (PKR)</div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    PKR {grandTotalPkr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePostInvoice}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950"
                >
                  {t("purchasing.post_invoice")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
