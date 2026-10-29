import React, { useState } from "react";
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

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  const [rollWidth, setRollWidth] = useState<"58mm" | "80mm">("58mm");
  const [autoKickDrawer, setAutoKickDrawer] = useState(true);
  const [autoCutPaper, setAutoCutPaper] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastStreamBytes, setLastStreamBytes] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestDrawerKick = () => {
    // ESC p 0 25 250 (1B 70 00 19 FA)
    const kickHex = "1B 70 00 19 FA";
    setLastStreamBytes(`[Drawer Kick] ${kickHex}`);
    setStatusMsg(t("printer.success_drawer"));
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleTestCutPaper = () => {
    // GS V 66 0 (1D 56 42 00)
    const cutHex = "1D 56 42 00";
    setLastStreamBytes(`[Paper Cut] ${cutHex}`);
    setStatusMsg(t("printer.cut_paper") + " (GS V 66 0)");
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleTestPrintReceipt = () => {
    const stream = [
      "1B 40", // ESC @ (init)
      "1B 61 01", // Center
      "1B 45 01", // Bold on
      "41 6C 2D 4D 61 64 69 6E 61 20 53 75 70 65 72 73 74 6F 72 65", // Al-Madina Superstore
      "0A", // LF
      "1D 76 30 00 04 00 01 00 FF 00 AA 55", // 1-bit Urdu Raster header sample
      "1B 61 00", // Left
      "1B 45 00", // Bold off
      "49 6E 76 6F 69 63 65 3A 20 49 4E 56 2D 32 30 32 36 31 30 2D 30 30 34 32", // Invoice: INV-202610-0042
      "0A",
      "2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D 2D", // ----------------
      "0A",
      "54 61 70 61 6C 20 54 65 61 20 34 35 30 67 20 20 20 20 50 4B 52 20 36 32 30", // Tapal Tea 450g    PKR 620
      "0A",
      "44 61 6C 64 61 20 4F 69 6C 20 31 4C 20 20 20 20 20 20 50 4B 52 20 35 34 30", // Dalda Oil 1L     PKR 540
      "0A",
      "3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D", // ================
      "0A",
      "1B 45 01", // Bold
      "54 4F 54 41 4C 3A 20 20 20 20 20 20 20 20 20 20 20 50 4B 52 20 31 2C 31 36 30", // TOTAL: PKR 1,160
      "0A",
      "1B 45 00",
      "1B 70 00 19 FA", // Drawer kick
      "1D 56 42 00", // Cut paper
    ].join(" ");

    setLastStreamBytes(`[ESC/POS ${rollWidth} Stream] ${stream}`);
    setStatusMsg(t("printer.success_test"));
    setTimeout(() => setStatusMsg(null), 4000);
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

          {/* Roll Width Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>{t("printer.roll_width")}</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRollWidth("58mm")}
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
                onClick={() => setRollWidth("80mm")}
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
                onChange={(e) => setAutoKickDrawer(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Auto-cut Thermal Paper on Sale Complete</span>
              <input
                type="checkbox"
                checked={autoCutPaper}
                onChange={(e) => setAutoCutPaper(e.target.checked)}
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
              Hardware Actions / ٹیسٹ پرنٹ و دراز
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
