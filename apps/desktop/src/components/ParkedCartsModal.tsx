import React from "react";
import { useTranslation } from "react-i18next";
import { ParkedCartItem } from "../lib/contracts";
import { X, Play, Trash2, Clock, ShoppingBag } from "lucide-react";

interface ParkedCartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  parkedCarts: ParkedCartItem[];
  onRecall: (cartId: string) => void;
  onDiscard: (cartId: string) => void;
}

export const ParkedCartsModal: React.FC<ParkedCartsModalProps> = ({
  isOpen,
  onClose,
  parkedCarts,
  onRecall,
  onDiscard,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const formatPkr = (paisa: number) => {
    return `PKR ${(paisa / 100).toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {t("pos.parked_title")}
              </h2>
              <p className="text-xs text-slate-400">
                {parkedCarts.length} held transactions pending cashier recall
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

        {/* List of Held Carts */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {parkedCarts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <ShoppingBag className="w-10 h-10 stroke-[1.5] text-slate-600" />
              <p className="text-sm font-medium">No held carts</p>
              <p className="text-xs text-slate-500">
                You can hold any active cart using the "Hold Cart" button or F4 shortcut.
              </p>
            </div>
          ) : (
            parkedCarts.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/50 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 flex items-center justify-between transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">
                      {item.cart_name || "Held Order"}
                    </span>
                    <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                      {item.item_count} items
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3">
                    <span>{formatPkr(item.total_paisa)}</span>
                    <span>•</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(item.parked_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onRecall(item.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{t("pos.recall")}</span>
                  </button>

                  <button
                    onClick={() => onDiscard(item.id)}
                    className="p-1.5 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 rounded-lg border border-slate-700 transition"
                    title={t("pos.discard")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition"
          >
            {t("pos.cancel")} (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
