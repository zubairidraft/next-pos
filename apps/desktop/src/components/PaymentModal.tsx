import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PaymentTender } from "../lib/contracts";
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Coins,
} from "lucide-react";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  grandTotalPaisa: number;
  customerId: string | null;
  customerName?: string;
  onComplete: (tenders: PaymentTender[], changePaisa: number) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  grandTotalPaisa,
  customerId,
  customerName,
  onComplete,
}) => {
  const { t } = useTranslation();

  const [activeMethod, setActiveMethod] = useState<PaymentTender["method"]>("cash");
  const [cashTenderedPaisa, setCashTenderedPaisa] = useState<number>(grandTotalPaisa);
  const [digitalRef, setDigitalRef] = useState<string>("");
  const [splitTenders, setSplitTenders] = useState<PaymentTender[]>([]);
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCashTenderedPaisa(grandTotalPaisa);
      setDigitalRef("");
      setSplitTenders([]);
      setIsSplitMode(false);
      setErrorMsg(null);
    }
  }, [isOpen, grandTotalPaisa]);

  // Handle keyboard shortcuts (Escape to close, Enter to submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleFinishSale();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!isOpen) return null;

  const formatPkr = (paisa: number) => {
    const rupees = (paisa / 100).toFixed(2);
    return `PKR ${rupees}`;
  };

  const changePaisa = isSplitMode
    ? Math.max(
        0,
        splitTenders.reduce((sum, t) => sum + t.amount_paisa, 0) +
          (activeMethod === "cash" ? cashTenderedPaisa : 0) -
          grandTotalPaisa
      )
    : activeMethod === "cash"
    ? Math.max(0, cashTenderedPaisa - grandTotalPaisa)
    : 0;

  const addCashAmount = (amountPkr: number) => {
    setCashTenderedPaisa((prev) => prev + amountPkr * 100);
  };

  const handleFinishSale = () => {
    setErrorMsg(null);

    if (activeMethod === "credit" && !customerId) {
      setErrorMsg("Khata / Credit tender requires selecting an existing customer!");
      return;
    }

    if (!isSplitMode) {
      if (activeMethod === "cash") {
        if (cashTenderedPaisa < grandTotalPaisa) {
          setErrorMsg("Cash received cannot be less than Grand Total!");
          return;
        }
        onComplete(
          [
            {
              method: "cash",
              amount_paisa: grandTotalPaisa,
            },
          ],
          changePaisa
        );
      } else {
        // Digital or card or credit: exact amount
        onComplete(
          [
            {
              method: activeMethod,
              amount_paisa: grandTotalPaisa,
              reference: digitalRef || undefined,
            },
          ],
          0
        );
      }
    } else {
      // Split mode
      const totalPaid = splitTenders.reduce((acc, cur) => acc + cur.amount_paisa, 0);
      if (totalPaid < grandTotalPaisa) {
        setErrorMsg(`Total paid (${formatPkr(totalPaid)}) is less than Grand Total (${formatPkr(grandTotalPaisa)})`);
        return;
      }
      onComplete(splitTenders, changePaisa);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {t("pos.pay_btn")}
              </h2>
              <p className="text-xs text-slate-400">
                {customerName ? `${t("pos.customer")}: ${customerName}` : t("pos.walk_in_customer")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grand Total Display */}
        <div className="bg-gradient-to-r from-emerald-950/50 via-slate-900 to-emerald-950/30 px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-emerald-400/90 font-medium">
              {t("pos.grand_total")}
            </span>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {formatPkr(grandTotalPaisa)}
            </div>
          </div>
          {activeMethod === "cash" && (
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-amber-400 font-medium">
                {t("pos.change_due")}
              </span>
              <div className="text-3xl font-extrabold text-amber-300 tracking-tight">
                {formatPkr(changePaisa)}
              </div>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-2 block">
              Payment Method
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <button
                type="button"
                onClick={() => setActiveMethod("cash")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "cash"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Banknote className="w-5 h-5 mb-1.5" />
                {t("pos.tender_cash")}
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod("card")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "card"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1.5" />
                {t("pos.tender_card")}
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod("jazzcash")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "jazzcash"
                    ? "bg-red-600/30 border-red-500 text-red-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5 text-red-400" />
                {t("pos.tender_jazzcash")}
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod("easypaisa")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "easypaisa"
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5 text-emerald-400" />
                {t("pos.tender_easypaisa")}
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod("raast")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "raast"
                    ? "bg-blue-600/30 border-blue-500 text-blue-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Coins className="w-5 h-5 mb-1.5 text-blue-400" />
                {t("pos.tender_raast")}
              </button>

              <button
                type="button"
                onClick={() => setActiveMethod("credit")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition ${
                  activeMethod === "credit"
                    ? "bg-amber-600/30 border-amber-500 text-amber-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <BookOpen className="w-5 h-5 mb-1.5 text-amber-400" />
                {t("pos.tender_credit")}
              </button>
            </div>
          </div>

          {/* Dynamic input per tender method */}
          {activeMethod === "cash" && (
            <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">
                  {t("pos.amount_received")} (PKR):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(cashTenderedPaisa / 100).toFixed(0)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCashTenderedPaisa(Math.round(val * 100));
                    }}
                    className="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-right text-lg font-bold text-white focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setCashTenderedPaisa(grandTotalPaisa)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg border border-slate-700"
                  >
                    {t("pos.exact_amount")}
                  </button>
                </div>
              </div>

              {/* Quick PKR Cash Bills */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
                <span className="text-[11px] text-slate-400">Quick Bills:</span>
                {[100, 500, 1000, 5000].map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => addCashAmount(bill)}
                    className="px-3 py-1.5 bg-slate-800/80 hover:bg-emerald-600/30 hover:border-emerald-500/50 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition"
                  >
                    +{bill} PKR
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMethod !== "cash" && activeMethod !== "credit" && (
            <div className="space-y-2 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
              <label className="text-xs font-medium text-slate-300 block">
                Transaction / Slip Reference (Optional):
              </label>
              <input
                type="text"
                value={digitalRef}
                onChange={(e) => setDigitalRef(e.target.value)}
                placeholder="e.g. TID-982341, Last 4 digits, or Approval Code"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {activeMethod === "credit" && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <BookOpen className="w-4 h-4" />
                <span>Customer Khata Posting</span>
              </div>
              <p className="text-xs text-amber-200/80">
                {customerId
                  ? `This entire sale amount (${formatPkr(
                      grandTotalPaisa
                    )}) will be added to ${customerName}'s ledger as an outstanding receivable.`
                  : "Please select a registered customer with a Khata account before continuing."}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition"
          >
            {t("pos.cancel")} (Esc)
          </button>

          <button
            type="button"
            onClick={handleFinishSale}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-950 transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Complete Sale & Print (Enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
