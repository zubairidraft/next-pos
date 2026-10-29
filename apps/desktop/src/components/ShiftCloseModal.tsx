import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
} from "lucide-react";

interface ShiftCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  openingFloatPaisa: number;
  expectedCashPaisa: number;
  cashierName: string;
  onShiftClosed: (countedPaisa: number) => void;
}

interface Denominations {
  n5000: number;
  n1000: number;
  n500: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
  coins: number;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = ({
  isOpen,
  onClose,
  openingFloatPaisa,
  expectedCashPaisa,
  cashierName,
  onShiftClosed,
}) => {
  const { t } = useTranslation();

  const [denoms, setDenoms] = useState<Denominations>({
    n5000: 0,
    n1000: 0,
    n500: 0,
    n100: 0,
    n50: 0,
    n20: 0,
    n10: 0,
    coins: 0,
  });

  const [isZReportPrinted, setIsZReportPrinted] = useState(false);

  if (!isOpen) return null;

  const countedPaisa =
    denoms.n5000 * 5000 * 100 +
    denoms.n1000 * 1000 * 100 +
    denoms.n500 * 500 * 100 +
    denoms.n100 * 100 * 100 +
    denoms.n50 * 50 * 100 +
    denoms.n20 * 20 * 100 +
    denoms.n10 * 10 * 100 +
    denoms.coins * 100;

  const variancePaisa = countedPaisa - expectedCashPaisa;

  const formatPkr = (paisa: number) => {
    return `PKR ${(paisa / 100).toFixed(2)}`;
  };

  const handleDenomChange = (key: keyof Denominations, valStr: string) => {
    const val = parseInt(valStr) || 0;
    setDenoms((prev) => ({
      ...prev,
      [key]: Math.max(0, val),
    }));
  };

  const handleCloseShift = () => {
    setIsZReportPrinted(true);
    onShiftClosed(countedPaisa);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {t("shift.title")}
              </h2>
              <p className="text-xs text-slate-400">
                Cashier: <span className="text-white font-medium">{cashierName}</span> • Shift Z-Report balancing
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
        {!isZReportPrinted ? (
          <div className="p-6 space-y-5">
            {/* Float & Expected Cash Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 block">{t("shift.opening_float")}</span>
                <span className="text-base font-bold text-white">{formatPkr(openingFloatPaisa)}</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 block">{t("shift.expected_cash")}</span>
                <span className="text-base font-bold text-emerald-400">{formatPkr(expectedCashPaisa)}</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 block">{t("shift.counted_cash")}</span>
                <span className="text-base font-bold text-sky-400">{formatPkr(countedPaisa)}</span>
              </div>
            </div>

            {/* Note & Currency Breakdown Counter */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  {t("shift.denomination_title")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // Quick fill exact expected
                    const count1000 = Math.floor(expectedCashPaisa / 100000);
                    const remainder = expectedCashPaisa % 100000;
                    const count500 = Math.floor(remainder / 50000);
                    const remainder2 = remainder % 50000;
                    const count100 = Math.floor(remainder2 / 10000);
                    setDenoms({
                      n5000: 0,
                      n1000: count1000,
                      n500: count500,
                      n100: count100,
                      n50: 0,
                      n20: 0,
                      n10: 0,
                      coins: (remainder2 % 10000) / 100,
                    });
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Quick Match Expected
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "Rs. 5,000", key: "n5000" as const },
                  { label: "Rs. 1,000", key: "n1000" as const },
                  { label: "Rs. 500", key: "n500" as const },
                  { label: "Rs. 100", key: "n100" as const },
                  { label: "Rs. 50", key: "n50" as const },
                  { label: "Rs. 20", key: "n20" as const },
                  { label: "Rs. 10", key: "n10" as const },
                  { label: "Coins / Change", key: "coins" as const },
                ].map((item) => (
                  <div key={item.key} className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                    <span className="text-[10px] text-slate-400 block font-medium">{item.label}</span>
                    <input
                      type="number"
                      min="0"
                      value={denoms[item.key] || ""}
                      onChange={(e) => handleDenomChange(item.key, e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-xs font-bold text-white focus:outline-none focus:border-emerald-500 mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Discrepancy / Variance Alert Bar */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                variancePaisa === 0
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : variancePaisa > 0
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {variancePaisa === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                )}
                <span>
                  {variancePaisa === 0
                    ? t("shift.balanced")
                    : variancePaisa > 0
                    ? `${t("shift.surplus")}: +${formatPkr(variancePaisa)}`
                    : `${t("shift.shortage")}: -${formatPkr(Math.abs(variancePaisa))}`}
                </span>
              </div>
              <span className="font-mono text-sm">{formatPkr(variancePaisa)}</span>
            </div>
          </div>
        ) : (
          /* Z-Report Summary Print View */
          <div className="p-6 space-y-4">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs text-slate-300">
              <div className="text-center font-bold text-sm text-white pb-1 border-b border-slate-800">
                DAILY SHIFT Z-REPORT (روزانہ زیڈ رپورٹ)
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span className="text-white">{cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>Shift Status:</span>
                <span className="text-emerald-400">CLOSED & BALANCED</span>
              </div>
              <div className="flex justify-between">
                <span>Opening Float:</span>
                <span>{formatPkr(openingFloatPaisa)}</span>
              </div>
              <div className="flex justify-between">
                <span>Counted Cash:</span>
                <span>{formatPkr(countedPaisa)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800 font-bold text-white">
                <span>Discrepancy / Variance:</span>
                <span className={variancePaisa === 0 ? "text-emerald-400" : "text-amber-400"}>
                  {formatPkr(variancePaisa)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Shift successfully closed and Z-Report sent to thermal printer.</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
          >
            {isZReportPrinted ? "Done" : "Cancel"}
          </button>

          {!isZReportPrinted && (
            <button
              onClick={handleCloseShift}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950 transition"
            >
              <Printer className="w-4 h-4" />
              <span>{t("shift.close_shift_btn")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
