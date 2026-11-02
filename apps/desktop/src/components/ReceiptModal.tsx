import React, { useEffect } from "react";
import { Printer, X, CheckCircle2, RotateCcw } from "lucide-react";
import { CartLineItem, SaleSummary } from "../lib/contracts";

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleSummary | null;
  lines: CartLineItem[];
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  lines,
  storeName = "Next POS Retail Store",
  storeAddress = "Main Commercial Market, Lahore, Pakistan",
  storePhone = "+92 300 1234567",
}) => {
  // Keyboard shortcuts: Enter / P to Print, Esc to Close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        handlePrint();
      } else if (e.key === "Escape" || e.code === "Space") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !sale) return null;

  const formatPkr = (paisa: number) => `PKR ${(paisa / 100).toFixed(2)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95">
        {/* Header Bar */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>Sale Completed Successfully</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thermal Receipt Visual Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950/70">
          <div
            id="printable-receipt"
            className="bg-white text-slate-900 font-mono text-xs p-5 rounded-xl shadow-md border border-slate-200 mx-auto max-w-[340px]"
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <h2 className="font-extrabold text-base tracking-tight">{storeName}</h2>
              <p className="text-[11px] text-slate-600 mt-0.5">{storeAddress}</p>
              <p className="text-[11px] text-slate-600">Tel: {storePhone}</p>
            </div>

            {/* Receipt Meta */}
            <div className="py-2.5 text-[11px] border-b border-dashed border-slate-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice #:</span>
                <span className="font-bold">{sale.doc_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date/Time:</span>
                <span>{sale.occurred_at || new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Customer:</span>
                <span className="font-semibold">{sale.customer_name || "Walk-in Customer"}</span>
              </div>
            </div>

            {/* Itemized Lines */}
            <div className="py-2.5 border-b border-dashed border-slate-300">
              <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500 pb-1">
                <span className="w-36">Item</span>
                <span className="w-10 text-center">Qty</span>
                <span className="w-16 text-right">Price</span>
                <span className="w-16 text-right">Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const lineTotal =
                    Math.round((line.qty_milli * line.unit_price_paisa) / 1000) -
                    line.discount_paisa;
                  return (
                    <div key={idx} className="py-1 text-[11px] flex justify-between items-start">
                      <div className="w-36 pr-1">
                        <div className="font-medium truncate">{line.product_name}</div>
                        <div className="text-[9px] text-slate-500">{line.sku}</div>
                      </div>
                      <span className="w-10 text-center font-medium">
                        {line.qty_milli / 1000}
                      </span>
                      <span className="w-16 text-right text-slate-600">
                        {(line.unit_price_paisa / 100).toFixed(0)}
                      </span>
                      <span className="w-16 text-right font-bold">
                        {(lineTotal / 100).toFixed(0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals Summary */}
            <div className="py-2.5 space-y-1 text-[11px] border-b border-dashed border-slate-300">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatPkr(sale.subtotal_paisa)}</span>
              </div>
              {sale.discount_paisa > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Order Discount:</span>
                  <span>-{formatPkr(sale.discount_paisa)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-slate-300">
                <span>GRAND TOTAL:</span>
                <span>{formatPkr(sale.grand_total_paisa)}</span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-2 space-y-0.5 text-[11px] border-b border-dashed border-slate-300">
              <div className="flex justify-between text-slate-700">
                <span>Amount Paid:</span>
                <span className="font-bold">{formatPkr(sale.total_paid_paisa)}</span>
              </div>
              {sale.change_paisa > 0 && (
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Change Return:</span>
                  <span>{formatPkr(sale.change_paisa)}</span>
                </div>
              )}
            </div>

            {/* Footer Notice */}
            <div className="text-center pt-3 text-[10px] text-slate-500 space-y-1">
              <p className="font-bold">THANK YOU FOR YOUR PURCHASE!</p>
              <p>Items exchangeable within 3 days with receipt.</p>
              <p className="font-mono text-[9px] text-slate-400 mt-2">
                * * * Powered by Next POS * * *
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Sale (Esc)</span>
          </button>

          <button
            onClick={handlePrint}
            autoFocus
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Receipt (Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
