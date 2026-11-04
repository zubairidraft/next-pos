import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Printer,
  Coins,
  Scissors,
  CheckCircle2,
  Copy,
  Sliders,
} from "lucide-react";
import { api, ReceiptPayload } from "../lib/api";

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    return localStorage.getItem("pos_printer_name") || "";
  });
  const [rollWidth, setRollWidth] = useState<"58mm" | "80mm">(() => {
    return (localStorage.getItem("pos_roll_width") as any) || "58mm";
  });
  const [autoKickDrawer, setAutoKickDrawer] = useState(() => {
    const val = localStorage.getItem("pos_auto_kick_drawer");
    return val !== null ? val === "true" : true;
  });
  const [autoCutPaper, setAutoCutPaper] = useState(() => {
    const val = localStorage.getItem("pos_auto_cut_paper");
    return val !== null ? val === "true" : true;
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastStreamBytes, setLastStreamBytes] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.listSystemPrinters()
        .then((list) => {
          setPrinters(list);
          if (!selectedPrinter && list.length > 0) {
            setSelectedPrinter(list[0]);
          }
        })
        .catch((e) => console.warn("Failed to list printers:", e));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestDrawerKick = async () => {
    const kickHex = "1B 70 00 19 FA";
    setLastStreamBytes(`[Drawer Kick Pulse] ${kickHex}`);
    try {
      await api.kickCashDrawer(selectedPrinter || undefined);
      setStatusMsg("Cash drawer kick pulse sent to " + (selectedPrinter || "Default Printer") + "!");
    } catch (err: any) {
      setStatusMsg("Drawer kick: " + (err?.message || String(err)));
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleTestCutPaper = async () => {
    const cutHex = "1D 56 42 00";
    setLastStreamBytes(`[Paper Cut Command] ${cutHex}`);
    try {
      await api.cutPrinterPaper(selectedPrinter || undefined);
      setStatusMsg("Paper cut command sent to " + (selectedPrinter || "Default Printer") + "!");
    } catch (err: any) {
      setStatusMsg("Paper cut: " + (err?.message || String(err)));
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleTestPrintReceipt = async () => {
    const testPayload: ReceiptPayload = {
      store_name: "Al-Madina Superstore",
      store_name_ur: "المدینہ سپر سٹور",
      store_address: "Main Commercial Market, Lahore, Pakistan",
      store_phone: "0300-1234567",
      ntn: "1234567-8",
      invoice_no: "TEST-0001",
      date_time: new Date().toLocaleString(),
      cashier_name: "Admin",
      customer_name: "Walk-in Customer",
      items: [
        {
          name: "Tapal Danedar Tea 450g",
          name_ur: "ٹپال دانے دار چائے",
          qty_display: "1 PC",
          unit_price_paisa: 62000,
          total_paisa: 62000,
        },
        {
          name: "Dalda Fortified Cooking Oil 1L",
          name_ur: "ڈالڈا کوکنگ آئل",
          qty_display: "1 PC",
          unit_price_paisa: 54000,
          total_paisa: 54000,
        },
      ],
      subtotal_paisa: 116000,
      discount_paisa: 0,
      tax_paisa: 0,
      grand_total_paisa: 116000,
      payments: [["cash", 116000]],
      change_paisa: 0,
      footer_note: "ESC/POS Thermal Hardware Test",
      footer_note_ur: "کاروبار پی او ایس میں خوش آمدید",
    };

    try {
      await api.printSaleReceipt(testPayload, selectedPrinter || undefined, rollWidth);
      setStatusMsg("Test receipt sent directly to " + (selectedPrinter || "Default Printer") + "!");
    } catch (err: any) {
      setStatusMsg("Hardware print failed: " + (err?.message || String(err)));
    }
    setLastStreamBytes(`[ESC/POS ${rollWidth} Stream] Sent to ${selectedPrinter || "Default Printer"}`);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSelectPrinter = (p: string) => {
    setSelectedPrinter(p);
    localStorage.setItem("pos_printer_name", p);
  };

  const handleSelectRollWidth = (w: "58mm" | "80mm") => {
    setRollWidth(w);
    localStorage.setItem("pos_roll_width", w);
  };

  const handleToggleAutoKick = (val: boolean) => {
    setAutoKickDrawer(val);
    localStorage.setItem("pos_auto_kick_drawer", String(val));
  };

  const handleToggleAutoCut = (val: boolean) => {
    setAutoCutPaper(val);
    localStorage.setItem("pos_auto_cut_paper", String(val));
  };

  const copyToClipboard = () => {
    if (lastStreamBytes) {
      navigator.clipboard.writeText(lastStreamBytes);
      alert(t("printer.copied_bytes"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {t("printer.title")}
              </h2>
              <p className="text-xs text-slate-400">
                Pure Rust ESC/POS engine with 1-bit Urdu Nastaliq raster graphics
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

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {statusMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Hardware Printer Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Installed Thermal Printer (Windows Spooler / Network)</span>
              </span>
              <span className="text-[10px] text-slate-400">
                {printers.length} printer{printers.length === 1 ? "" : "s"} detected
              </span>
            </label>
            <select
              value={selectedPrinter}
              onChange={(e) => handleSelectPrinter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
            >
              <option value="">-- Windows Default Printer --</option>
              {printers.map((prn) => (
                <option key={prn} value={prn}>
                  {prn}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Bypasses Windows graphics rasterizer via RAW spooling. Supports network printers (e.g. 192.168.1.100:9100).
            </p>
          </div>

          {/* Roll Width Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>{t("printer.roll_width")}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectRollWidth("58mm")}
                className={`p-3.5 rounded-xl border text-left transition ${
                  rollWidth === "58mm"
                    ? "bg-emerald-600/20 border-emerald-500 text-white"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <div className="text-sm font-bold">{t("printer.width_58mm")}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">384 dots • 32 columns</div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRollWidth("80mm")}
                className={`p-3.5 rounded-xl border text-left transition ${
                  rollWidth === "80mm"
                    ? "bg-emerald-600/20 border-emerald-500 text-white"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <div className="text-sm font-bold">{t("printer.width_80mm")}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">576 dots • 48 columns</div>
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Auto-kick Cash Drawer on Cash Sale (RJ11)</span>
              <input
                type="checkbox"
                checked={autoKickDrawer}
                onChange={(e) => handleToggleAutoKick(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Auto-cut Thermal Paper on Sale Complete</span>
              <input
                type="checkbox"
                checked={autoCutPaper}
                onChange={(e) => handleToggleAutoCut(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </label>
            <div className="text-[11px] text-emerald-400/90 pt-1 border-t border-slate-800/80">
              ✓ {t("printer.urdu_raster")} active
            </div>
          </div>

          {/* Hardware Diagnostic Actions */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">
              Hardware Actions
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleTestPrintReceipt}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
              >
                <Printer className="w-4 h-4" />
                <span>Test Receipt</span>
              </button>

              <button
                type="button"
                onClick={handleTestDrawerKick}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow transition"
              >
                <Coins className="w-4 h-4" />
                <span>Kick Drawer</span>
              </button>

              <button
                type="button"
                onClick={handleTestCutPaper}
                className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition"
              >
                <Scissors className="w-4 h-4 text-rose-400" />
                <span>Cut Paper</span>
              </button>
            </div>
          </div>

          {/* Byte Stream Preview */}
          {lastStreamBytes && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Last Generated ESC/POS Bytes:</span>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
              <div className="p-3 bg-slate-950 font-mono text-[10px] text-slate-300 rounded-xl border border-slate-800 max-h-24 overflow-y-auto break-all">
                {lastStreamBytes}
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
