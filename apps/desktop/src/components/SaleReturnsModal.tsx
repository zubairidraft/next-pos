import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Sparkles,
} from "lucide-react";

interface ReturnItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  unitPricePaisa: number;
  qtySoldMilli: number;
  qtyReturnMilli: number;
  restockType: "sellable" | "damaged";
}

interface SaleReturnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReturnProcessed: (docNo: string, refundPaisa: number) => void;
}

export const SaleReturnsModal: React.FC<SaleReturnsModalProps> = ({
  isOpen,
  onClose,
  onReturnProcessed,
}) => {
  const { t } = useTranslation();

  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [activeInvoice, setActiveInvoice] = useState<string | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [refundMethod, setRefundMethod] = useState<"cash" | "credit">("cash");
  const [returnReason, setReturnReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatPkr = (paisa: number) => `PKR ${(paisa / 100).toFixed(2)}`;

  const handleSearchInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const q = invoiceQuery.trim();
    if (!q) return;

    // Load sample sale invoice for demonstration & testing
    setActiveInvoice(q.toUpperCase());
    setReturnItems([
      {
        id: "line-01",
        name: "Tapal Danedar Tea 450g",
        sku: "BEV-TEA-450",
        unit: "PKT",
        unitPricePaisa: 62000,
        qtySoldMilli: 2000,
        qtyReturnMilli: 1000,
        restockType: "sellable",
      },
      {
        id: "line-02",
        name: "Dalda Cooking Oil 1 Litre",
        sku: "GRO-OIL-1L",
        unit: "PC",
        unitPricePaisa: 54000,
        qtySoldMilli: 1000,
        qtyReturnMilli: 0,
        restockType: "sellable",
      },
    ]);
  };

  const updateReturnQty = (lineId: string, deltaMilli: number) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === lineId) {
          const next = item.qtyReturnMilli + deltaMilli;
          if (next < 0) return item;
          if (next > item.qtySoldMilli) {
            alert(`Cannot return more than purchased (${item.qtySoldMilli / 1000} ${item.unit})!`);
            return item;
          }
          return { ...item, qtyReturnMilli: next };
        }
        return item;
      })
    );
  };

  const toggleRestockType = (lineId: string) => {
    setReturnItems((prev) =>
      prev.map((item) => {
        if (item.id === lineId) {
          return {
            ...item,
            restockType: item.restockType === "sellable" ? "damaged" : "sellable",
          };
        }
        return item;
      })
    );
  };

  const totalRefundPaisa = returnItems.reduce(
    (sum, item) => sum + Math.round((item.qtyReturnMilli * item.unitPricePaisa) / 1000),
    0
  );

  const handleSubmitReturn = () => {
    if (totalRefundPaisa <= 0) {
      setErrorMsg("Please select at least 1 item quantity to return.");
      return;
    }

    const docNo = `RET-${Math.floor(1000 + Math.random() * 9000)}`;
    onReturnProcessed(docNo, totalRefundPaisa);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {t("returns.title")}
              </h2>
              <p className="text-xs text-slate-400">
                Stock replenishment & refund processing against sales invoice
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Search Invoice Form */}
          <form onSubmit={handleSearchInvoice} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
                placeholder={t("returns.invoice_placeholder")}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setInvoiceQuery("INV-202610-0042");
                setActiveInvoice("INV-202610-0042");
                setReturnItems([
                  {
                    id: "line-01",
                    name: "Tapal Danedar Tea 450g",
                    sku: "BEV-TEA-450",
                    unit: "PKT",
                    unitPricePaisa: 62000,
                    qtySoldMilli: 2000,
                    qtyReturnMilli: 1000,
                    restockType: "sellable",
                  },
                ]);
              }}
              className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-medium rounded-xl border border-emerald-500/30 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sample Inv</span>
            </button>
          </form>

          {/* Invoice Lines to Return */}
          {activeInvoice && (
            <div className="space-y-4">
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-2 text-right">Sold Qty</th>
                      <th className="py-2.5 px-3 text-center">Return Qty</th>
                      <th className="py-2.5 px-3 text-center">Restock Shelf</th>
                      <th className="py-2.5 px-3 text-right">Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {returnItems.map((item) => {
                      const refundForLine = Math.round(
                        (item.qtyReturnMilli * item.unitPricePaisa) / 1000
                      );
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/20">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white text-xs">{item.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{item.sku}</div>
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-400 font-mono">
                            {item.qtySoldMilli / 1000} {item.unit}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => updateReturnQty(item.id, -1000)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-bold text-white min-w-8 text-center">
                                {item.qtyReturnMilli / 1000}
                              </span>
                              <button
                                onClick={() => updateReturnQty(item.id, 1000)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleRestockType(item.id)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                item.restockType === "sellable"
                                  ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/40"
                                  : "bg-rose-600/20 text-rose-400 border-rose-500/40"
                              }`}
                            >
                              {item.restockType === "sellable" ? "Sellable" : "Damaged / Waste"}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-white font-mono">
                            {formatPkr(refundForLine)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Settlement Method & Reason */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 block font-medium">
                    {t("returns.refund_method")}
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as "cash" | "credit")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="cash">Cash Outflow Refund</option>
                    <option value="credit">Khata Customer Credit (Ledger)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400 block font-medium">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="e.g. Expired, damaged, or wrong item"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Total Refund Banner */}
              <div className="p-4 bg-gradient-to-r from-rose-950/40 via-slate-900 to-rose-950/20 border border-rose-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-rose-400 font-bold block">
                    {t("returns.refund_amount")}
                  </span>
                  <div className="text-2xl font-black text-white">
                    {formatPkr(totalRefundPaisa)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSubmitReturn}
                  disabled={totalRefundPaisa <= 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950 transition"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t("returns.post_return_btn")}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
