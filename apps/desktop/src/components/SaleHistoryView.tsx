import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Edit,
  History,
  Loader2,
  Printer,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  api,
  errorText,
  formatPkr,
  formatQty,
  printerPrefs,
  SaleDetail,
  SaleListRow,
} from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { printElement, receiptPage } from "../lib/print";
import { ReceiptView } from "./ReceiptView";
import { Key } from "./entry/keyboard";
import { SaleReturnsModal } from "./SaleReturnsModal";
import { SaleEditView } from "./SaleEditView";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function quick(range: string): [string, string] {
  const now = new Date();
  const today = ymd(now);
  const d = new Date(now);
  switch (range) {
    case "yesterday":
      d.setDate(d.getDate() - 1);
      return [ymd(d), ymd(d)];
    case "week": {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [ymd(d), today];
    }
    case "month":
      return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    default:
      return [today, today];
  }
}

export function SaleHistoryView() {
  const toast = useToast();
  const { can } = useSession();

  // Filters & pagination
  const [from, setFrom] = useState(() => quick("today")[0]);
  const [to, setTo] = useState(() => quick("today")[1]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [limit] = useState(200);
  const [offset, setOffset] = useState(0);

  // Data lists
  const [sales, setSales] = useState<SaleListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // Detail panel state
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Subviews / modals
  const [editingSale, setEditingSale] = useState<SaleDetail | null>(null);
  const [returnDocNo, setReturnDocNo] = useState<string | null>(null);
  const [viewingRevision, setViewingRevision] = useState<{ revision: number; snapshot: any } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Debounce search query 250ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch sales list
  const loadSales = useCallback(
    async (isLoadMore = false) => {
      setLoading(true);
      try {
        const offsetMin = new Date().getTimezoneOffset(); // in minutes
        const res = await api.listSales({
          from,
          to,
          offset_min: -offsetMin, // Local shop offset
          query: debouncedQuery.trim() || undefined,
          limit,
          offset: isLoadMore ? offset : 0,
        });

        if (isLoadMore) {
          setSales((prev) => [...prev, ...res]);
        } else {
          setSales(res);
          if (res.length > 0) {
            setSelectedIndex(0);
            setSelectedId(res[0].id);
          } else {
            setSelectedIndex(-1);
            setSelectedId(null);
            setDetail(null);
          }
        }
      } catch (e) {
        toast.error(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [from, to, debouncedQuery, limit, offset, toast]
  );

  useEffect(() => {
    loadSales();
  }, [from, to, debouncedQuery, loadSales]);

  // Load sale detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .saleDetail(selectedId)
      .then((d) => setDetail(d))
      .catch((e) => {
        toast.error(errorText(e));
        setDetail(null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId, toast]);

  // Printing logic
  const printWithWindows = async () => {
    const el = document.getElementById("receipt-print");
    if (!el || !detail) return;
    const p = receiptPage(printerPrefs().width);
    await printElement(el, {
      ...p,
      title: detail.receipt.sale.doc_no,
      body: p.body + " #receipt-print { border: 0 !important; border-radius: 0 !important; padding: 0 !important; }",
    });
  };

  const printReceipt = async () => {
    if (!detail) return;
    const p = printerPrefs();
    if (!p.raw) return printWithWindows();
    try {
      await api.printReceipt(detail.receipt.sale.id, p.name, p.width);
      toast.success("Printed receipt");
    } catch (e) {
      toast.error(`Receipt print failed: ${errorText(e)}. Trying Windows print...`);
      printWithWindows();
    }
  };

  // View old snapshot
  const viewRevision = async (rev: number) => {
    if (!selectedId) return;
    try {
      const snap = await api.saleRevision(selectedId, rev);
      setViewingRevision({ revision: rev, snapshot: snap });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // If modal or subview is open, do not intercept
      if (editingSale || returnDocNo || viewingRevision) return;

      const isInput =
        document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";

      // Quick date keys: Alt+T, Alt+Y, Alt+W, Alt+M
      if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const [f, t] = quick("today");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        const [f, t] = quick("yesterday");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        const [f, t] = quick("week");
        setFrom(f);
        setTo(t);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const [f, t] = quick("month");
        setFrom(f);
        setTo(t);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (isInput) {
          (document.activeElement as HTMLElement)?.blur();
        } else {
          setSelectedId(null);
          setSelectedIndex(-1);
        }
        return;
      }

      // Receipt action keys (when not typing in an input)
      if (!isInput && detail) {
        if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          printReceipt();
          return;
        }
        if (e.key.toLowerCase() === "e") {
          e.preventDefault();
          if (detail.can_edit) {
            setEditingSale(detail);
          } else {
            toast.error(detail.edit_blocked_reason || "This sale cannot be edited.");
          }
          return;
        }
        if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          if (can("SalesReturn")) {
            setReturnDocNo(detail.receipt.sale.doc_no);
          } else {
            toast.error("You do not have permission for sales returns.");
          }
          return;
        }
      }

      // Up / Down arrow navigation in table
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, sales.length - 1);
          if (next >= 0 && sales[next]) {
            setSelectedId(sales[next].id);
          }
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          if (next >= 0 && sales[next]) {
            setSelectedId(sales[next].id);
          }
          return next;
        });
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setOffset((prev) => prev + limit);
        loadSales(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingSale, returnDocNo, viewingRevision, detail, sales, limit, loadSales, toast, can]);

  // If editing subview is open
  if (editingSale) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <SaleEditView
          saleDetail={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={(newReceipt) => {
            setEditingSale(null);
            loadSales();
            setSelectedId(newReceipt.sale.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col gap-4">
      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-emerald-500" /> Sale History
        </h2>
        <div className="text-xs text-slate-500 flex items-center gap-3">
          <span>
            <Key k="F2" /> Search
          </span>
          <span>
            <Key k="↑" /> <Key k="↓" /> Select
          </span>
          <span>
            <Key k="P" /> Print
          </span>
          <span>
            <Key k="E" /> Edit
          </span>
          <span>
            <Key k="R" /> Return
          </span>
        </div>
      </div>

      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-end gap-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          From
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="block mt-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium"
          />
        </label>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          To
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="block mt-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium"
          />
        </label>

        {/* Quick Date Buttons */}
        <div className="flex flex-wrap gap-1 items-end pb-0.5">
          {[
            ["today", "Today", "Alt+T"],
            ["yesterday", "Yesterday", "Alt+Y"],
            ["week", "Week", "Alt+W"],
            ["month", "Month", "Alt+M"],
          ].map(([k, label, hotkey]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                const [f, t] = quick(k);
                setFrom(f);
                setTo(t);
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 text-slate-700 dark:text-slate-300"
            >
              <span>{label}</span>
              <span className="text-[10px] opacity-60 font-mono">({hotkey})</span>
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="flex-1 min-w-[200px] relative">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
            Search <Key k="F2" />
          </label>
          <div className="relative">
            <input
              ref={searchInputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Receipt no, customer, phone, product SKU/barcode"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Split List and Receipt Panel */}
      <div className="flex flex-col lg:flex-row gap-4 items-start min-h-[460px]">
        {/* Table of sales */}
        <div
          ref={tableRef}
          className="flex-1 w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[70vh] overflow-y-auto"
        >
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold z-10">
              <tr>
                <th className="px-3 py-2.5">Date / Time</th>
                <th className="px-3 py-2.5">Receipt #</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Salesman</th>
                <th className="px-3 py-2.5 text-right">Items</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5">Settlement</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                    Loading sale receipts...
                  </td>
                </tr>
              )}

              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No sale receipts found for the selected period.
                  </td>
                </tr>
              )}

              {sales.map((s, idx) => {
                const isSelected = s.id === selectedId || idx === selectedIndex;
                const isEdited = s.revision > 0;
                const isReturned = s.returned_paisa > 0;

                return (
                  <tr
                    key={s.id}
                    onClick={() => {
                      setSelectedId(s.id);
                      setSelectedIndex(idx);
                    }}
                    className={`cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-medium"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {new Date(s.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {s.doc_no}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[140px]">
                      {s.customer_name || <span className="text-slate-400">Walk-in</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]">
                      {s.salesman || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{s.item_count}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatPkr(s.total_paisa)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 truncate max-w-[160px]">
                      {s.paid_text || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        {isEdited && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Rev {s.revision}
                          </span>
                        )}
                        {isReturned && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            Returned
                          </span>
                        )}
                        {s.status === "voided" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                            Voided
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right side Detail panel */}
        <aside className="w-full lg:w-[360px] shrink-0 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4 flex flex-col gap-3">
          {detailLoading && !detail && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mb-2" /> Loading receipt details...
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="py-20 text-center text-slate-400 text-xs">
              Select a receipt from the table to view, print, or edit.
            </div>
          )}

          {detail && (
            <>
              {/* Action buttons row */}
              <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={printReceipt}
                  title="Print receipt (P)"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 flex items-center gap-1 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" /> Print <Key k="P" />
                </button>

                <button
                  onClick={() => {
                    if (detail.can_edit) {
                      setEditingSale(detail);
                    } else {
                      toast.error(detail.edit_blocked_reason || "Cannot edit this receipt.");
                    }
                  }}
                  disabled={!detail.can_edit}
                  title={detail.can_edit ? "Edit sale (E)" : detail.edit_blocked_reason || "Editing blocked"}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                    detail.can_edit
                      ? "bg-amber-600 text-white hover:bg-amber-500 shadow-xs"
                      : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" /> Edit <Key k="E" />
                </button>

                {can("SalesReturn") && (
                  <button
                    onClick={() => setReturnDocNo(detail.receipt.sale.doc_no)}
                    title="Return items from this sale (R)"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 flex items-center gap-1 shadow-xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Return <Key k="R" />
                  </button>
                )}
              </div>

              {detail.edit_blocked_reason && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-800/60 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>{detail.edit_blocked_reason}</span>
                </div>
              )}

              {/* Receipt View */}
              <div className="overflow-y-auto max-h-[380px] rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
                <ReceiptView receipt={detail.receipt} id="receipt-print" />
              </div>

              {/* Payments & Credit details */}
              <div className="space-y-1 text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
                  Payment breakdown
                </div>
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-slate-600 dark:text-slate-400 py-0.5">
                    <span className="capitalize">
                      {p.method} ({p.direction})
                    </span>
                    <span className="font-mono font-medium">{formatPkr(p.amount_paisa)}</span>
                  </div>
                ))}
                {detail.credit_paisa > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400 py-0.5">
                    <span>Khata (credit)</span>
                    <span className="font-mono font-medium">{formatPkr(detail.credit_paisa)}</span>
                  </div>
                )}
              </div>

              {/* Returns list if any */}
              {detail.returns.length > 0 && (
                <div className="space-y-1 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-rose-600 text-[11px] uppercase tracking-wider">
                    Returns on this sale
                  </div>
                  {detail.returns.map((r) => (
                    <div key={r.id} className="flex justify-between text-slate-600 dark:text-slate-400 py-0.5">
                      <span>
                        {r.doc_no}
                        {r.reason ? ` (${r.reason})` : ""}
                      </span>
                      <span className="font-mono font-bold text-rose-600">
                        −{formatPkr(r.refund_paisa)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Revisions list if any */}
              {detail.revisions.length > 0 && (
                <div className="space-y-1 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-amber-600 text-[11px] uppercase tracking-wider">
                    Edit history
                  </div>
                  {detail.revisions.map((rev) => (
                    <button
                      key={rev.revision}
                      type="button"
                      onClick={() => viewRevision(rev.revision)}
                      className="w-full text-left p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 transition group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Rev {rev.revision}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(rev.edited_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {rev.reason} · by {rev.edited_by || "System"}
                      </div>
                      <div className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 font-semibold mt-0.5">
                        Click to view old version
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Sale Returns Modal */}
      {returnDocNo && (
        <SaleReturnsModal
          initialDocNo={returnDocNo}
          onClose={() => setReturnDocNo(null)}
          onDone={() => {
            setReturnDocNo(null);
            loadSales();
          }}
        />
      )}

      {/* Old Version Read-Only Modal */}
      {viewingRevision && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 flex flex-col gap-3 max-h-[90vh]">
            {/* Prominent OLD VERSION banner */}
            <div className="bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 px-4 py-2 rounded-xl text-center font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2">
              <History className="w-4 h-4" />
              OLD VERSION, rev {viewingRevision.revision}
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {viewingRevision.snapshot.doc_no}
              </span>
              <span className="text-slate-400">
                {new Date(viewingRevision.snapshot.created_at).toLocaleString()}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 text-xs font-mono">
              <div className="space-y-1">
                <div className="font-bold text-slate-500">Items:</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(viewingRevision.snapshot.lines || []).map((l: any, i: number) => (
                    <div key={i} className="py-1 flex justify-between">
                      <div>
                        <div>Item {i + 1}</div>
                        <div className="text-[11px] text-slate-400">
                          {formatQty(l.qty_milli)} × {formatPkr(l.unit_price_paisa)}
                        </div>
                      </div>
                      <div className="font-bold">{formatPkr(l.total_paisa)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-2 space-y-1">
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL:</span>
                  <span>{formatPkr(viewingRevision.snapshot.total_paisa)}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                autoFocus
                onClick={() => setViewingRevision(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700"
              >
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
