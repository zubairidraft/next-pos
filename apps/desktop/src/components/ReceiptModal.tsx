import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Printer, X } from "lucide-react";
import { api, errorText, printerPrefs, ReceiptData } from "../lib/api";
import { printElement, receiptPage } from "../lib/print";
import { ReceiptView } from "./ReceiptView";

/**
 * Shows a posted sale exactly as stored in the database and prints it on the
 * receipt printer. The printed content is built by the backend from the sale id.
 */
export function ReceiptModal({ receipt, autoPrint, onClose }: { receipt: ReceiptData; autoPrint: boolean; onClose: () => void }) {
  const [printState, setPrintState] = useState<"idle" | "printing" | "done" | "error">("idle");
  const [printError, setPrintError] = useState<string | null>(null);
  const { sale } = receipt;

  // Only the receipt, sized for the roll, through the Windows printer driver.
  const printWithWindows = async () => {
    const el = document.getElementById("receipt-print");
    if (!el) return;
    const p = receiptPage(printerPrefs().width);
    await printElement(el, { ...p, title: sale.doc_no, body: p.body + " #receipt-print { border: 0 !important; border-radius: 0 !important; padding: 0 !important; }" });
  };

  const print = async () => {
    const p = printerPrefs();
    // No thermal printer chosen, or Windows printing chosen: receipt only, through Windows.
    if (!p.raw) return printWithWindows();
    setPrintState("printing");
    setPrintError(null);
    try {
      await api.printReceipt(sale.id, p.name, p.width);
      setPrintState("done");
    } catch (e) {
      setPrintState("error");
      setPrintError(errorText(e));
    }
  };

  useEffect(() => {
    if (autoPrint) print();
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-emerald-600 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Sale saved · {sale.doc_no}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          <ReceiptView receipt={receipt} />
          {printState === "error" && <p className="text-xs text-rose-600 mt-2">Printer: {printError}. Check More → Printer setup, or use "Print with Windows".</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 justify-end">
          <button onClick={printWithWindows} className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">Print with Windows</button>
          <button onClick={print} disabled={printState === "printing"} className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 dark:bg-slate-700 text-white flex items-center gap-1">
            {printState === "printing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {printState === "done" ? "Printed · print again" : "Print receipt"}
          </button>
          <button autoFocus onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white">New sale (Enter)</button>
        </div>
      </div>
    </div>
  );
}
