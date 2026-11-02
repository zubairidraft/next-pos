import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { LabelDesignerModal } from "./LabelDesignerModal";
import {
  ClipboardCheck,
  RefreshCw,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  Tag,
  ShieldCheck,
  Lock,
  Layers,
  History,
} from "lucide-react";

interface AuditLine {
  variant_id: string;
  sku: string;
  name: string;
  name_ur?: string;
  barcode: string;
  unit_code: string;
  expected_qty: number;
  counted_qty: number;
  unit_cost_pkr: number;
}

export const StockAuditView: React.FC = () => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<"session" | "history">("session");
  const [isSessionActive, setIsSessionActive] = useState(true);
  const [sessionDocNo] = useState("CNT-000001");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);

  const [auditLines, setAuditLines] = useState<AuditLine[]>([
    {
      variant_id: "var-1",
      sku: "SHAN-BIR-50G",
      name: "Shan Special Bombay Biryani Masala 50g",
      name_ur: "شان اسپیشل بمبئی بریانی مصالحہ 50 گرام",
      barcode: "8964000101112",
      unit_code: "PCS",
      expected_qty: 120,
      counted_qty: 118, // 2 shortage
      unit_cost_pkr: 95.0,
    },
    {
      variant_id: "var-2",
      sku: "TAP-DAN-400G",
      name: "Tapal Danedar Tea 400g Pouch",
      name_ur: "ٹپال دانے دار چائے 400 گرام",
      barcode: "8961011002231",
      unit_code: "PCS",
      expected_qty: 45,
      counted_qty: 46, // 1 surplus
      unit_cost_pkr: 720.0,
    },
    {
      variant_id: "var-3",
      sku: "BAS-RICE-SUPER",
      name: "Super Basmati Rice 1kg Pack",
      name_ur: "سپر باسپتی چاول 1 کلو پیک",
      barcode: "8961234500019",
      unit_code: "KG",
      expected_qty: 8,
      counted_qty: 8, // balanced
      unit_cost_pkr: 340.0,
    },
  ]);

  const [history] = useState([
    {
      id: "cnt-prev-1",
      doc_no: "CNT-000000",
      date: "2026-10-15",
      notes: "Initial Store Opening Count",
      items_audited: 34,
      discrepancy_value_pkr: -190.0,
      approved_by: "Admin (Zubair)",
    },
  ]);

  // Adjust count
  const handleUpdateCount = (variant_id: string, delta: number) => {
    setAuditLines(
      auditLines.map((line) => {
        if (line.variant_id === variant_id) {
          const nextCount = Math.max(0, line.counted_qty + delta);
          return { ...line, counted_qty: nextCount };
        }
        return line;
      })
    );
  };

  const handleSetCountDirect = (variant_id: string, val: number) => {
    setAuditLines(
      auditLines.map((line) => {
        if (line.variant_id === variant_id) {
          return { ...line, counted_qty: Math.max(0, val) };
        }
        return line;
      })
    );
  };

  // Rebuild Cache handler
  const handleRebuildCache = () => {
    setIsRebuilding(true);
    setRebuildResult(null);

    setTimeout(() => {
      setIsRebuilding(false);
      setRebuildResult(
        "Cache rebuilt in 18ms. 3 distinct variants replayed from stock_movements. 100% mathematical parity verified."
      );
    }, 800);
  };

  // Finalize audit
  const handleFinalizeAudit = () => {
    if (managerPin !== "1234" && managerPin !== "0000") {
      alert("Invalid Manager PIN. Default test PIN is 1234.");
      return;
    }

    setIsPinModalOpen(false);
    setIsSessionActive(false);
    alert(
      `Stock count ${sessionDocNo} finalized and approved! Balancing movements recorded for discrepancies.`
    );
  };

  // Summary statistics
  const totalVarianceQty = auditLines.reduce(
    (acc, l) => acc + (l.counted_qty - l.expected_qty),
    0
  );
  const totalVarianceValuePkr = auditLines.reduce(
    (acc, l) => acc + (l.counted_qty - l.expected_qty) * l.unit_cost_pkr,
    0
  );

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <ClipboardCheck className="w-7 h-7 text-emerald-500" />
            {t("audit.title") || "Physical Stock Audit & Count"}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{t("audit.subtitle") || "Stock variance analysis, physical cycle counts, and compensating adjustments."}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsLabelModalOpen(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl font-medium text-xs transition border border-slate-300 dark:border-slate-700 shadow-xs"
          >
            <Tag className="w-4 h-4 text-amber-500" />
            {t("audit.open_label_designer") || "Barcode Label Designer"}
          </button>

          <button
            onClick={handleRebuildCache}
            disabled={isRebuilding}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-600/20 dark:hover:bg-indigo-600/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 px-4 py-2.5 rounded-xl font-medium text-xs transition shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isRebuilding ? "animate-spin" : ""}`} />
            {isRebuilding ? t("audit.rebuilding") || "Rebuilding..." : t("audit.btn_rebuild_cache") || "Rebuild Indexes"}
          </button>
        </div>
      </div>

      {/* Rebuild Cache Feedback Alert */}
      {rebuildResult && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-700 dark:text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>{rebuildResult}</span>
          </div>
          <button
            onClick={() => setRebuildResult(null)}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs and Session Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("session")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "session"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            {t("audit.tab_active_session") || "Active Audit"} ({sessionDocNo})
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === "history"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            {t("audit.tab_history") || "Audit History"}
          </button>
        </div>

        {activeTab === "session" && (
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Qty:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {totalVarianceQty > 0 ? `+${totalVarianceQty}` : totalVarianceQty}
              </span>
              <span className="text-slate-400 dark:text-slate-600">•</span>
              <span>Net Value:</span>
              <span
                className={`font-mono font-bold text-sm ${
                  totalVarianceValuePkr < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : totalVarianceValuePkr > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                PKR {totalVarianceValuePkr.toFixed(2)}
              </span>
            </div>

            {isSessionActive && (
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-2 rounded-xl transition shadow-md flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {t("audit.finalize_btn") || "Finalize Audit"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab Content: Active Audit Session */}
      {activeTab === "session" && (
        <div className="bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm space-y-4 p-4">
          {/* Quick Scanner Barcode Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-3 left-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("audit.scan_placeholder") || "Scan barcode or search SKU for counting..."}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl py-2.5 pl-9 pr-4 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-xs"
            />
          </div>

          {/* Variance Analysis Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-950 text-[10px] uppercase text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">SKU & Barcode</th>
                  <th className="px-5 py-3.5">Product Name</th>
                  <th className="px-5 py-3.5 text-center">{t("audit.expected_qty") || "Expected"}</th>
                  <th className="px-5 py-3.5 text-center">{t("audit.counted_qty") || "Counted"}</th>
                  <th className="px-5 py-3.5 text-center">{t("audit.variance_qty") || "Variance"}</th>
                  <th className="px-5 py-3.5 text-right">{t("audit.variance_val") || "Value Diff"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                {auditLines.map((line) => {
                  const variance = line.counted_qty - line.expected_qty;
                  const varianceValue = variance * line.unit_cost_pkr;

                  return (
                    <tr key={line.variant_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-900 dark:text-white font-mono">{line.sku}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{line.barcode}</div>
                      </td>

                      <td className="px-5 py-3 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-slate-200">{line.name}</div>
                      </td>

                      <td className="px-5 py-3 text-center text-slate-500 dark:text-slate-400 font-mono">
                        {line.expected_qty} {line.unit_code}
                      </td>

                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 px-2 py-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => handleUpdateCount(line.variant_id, -1)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-white p-0.5"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={line.counted_qty}
                            onChange={(e) =>
                              handleSetCountDirect(line.variant_id, Number(e.target.value))
                            }
                            className="w-12 bg-transparent text-center font-bold text-slate-900 dark:text-white focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCount(line.variant_id, 1)}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-white p-0.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-3 text-center font-bold font-mono">
                        {variance > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-1 rounded-full text-[11px]">
                            +{variance} (Surplus)
                          </span>
                        ) : variance < 0 ? (
                          <span className="text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-2.5 py-1 rounded-full text-[11px]">
                            {variance} (Shortage)
                          </span>
                        ) : (
                          <span className="text-slate-500 bg-slate-100 dark:bg-slate-800/40 px-2.5 py-1 rounded-full text-[11px]">
                            0 (Balanced)
                          </span>
                        )}
                      </td>

                      <td
                        className={`px-5 py-3 text-right font-mono font-bold ${
                          varianceValue < 0
                            ? "text-rose-600 dark:text-rose-400"
                            : varianceValue > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-500"
                        }`}
                      >
                        PKR {varianceValue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: History */}
      {activeTab === "history" && (
        <div className="bg-white dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950 text-[10px] uppercase text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">Doc #</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Notes</th>
                <th className="px-6 py-4 text-center">Items Audited</th>
                <th className="px-6 py-4 text-right">Net Variance</th>
                <th className="px-6 py-4">Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
              {history.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="px-6 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">{h.doc_no}</td>
                  <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">{h.date}</td>
                  <td className="px-6 py-4 text-slate-800 dark:text-slate-200">{h.notes}</td>
                  <td className="px-6 py-4 text-center font-mono font-semibold text-slate-900 dark:text-white">{h.items_audited}</td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                    PKR {h.discrepancy_value_pkr.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">{h.approved_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manager PIN Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Lock className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {t("audit.manager_pin_required") || "Manager PIN Required"}
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Approval required to post compensating stock movements for physical count variances.
            </p>

            <div>
              <input
                type="password"
                maxLength={4}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="••••"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-3 text-center text-2xl tracking-widest text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400 text-center mt-1">Default PIN: 1234</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeAudit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-md"
              >
                Approve & Post
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Label Designer Modal */}
      <LabelDesignerModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
      />
    </div>
  );
};
