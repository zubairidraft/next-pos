import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Delete, Check, X, ShieldAlert } from "lucide-react";
import { api, UserSummary } from "../lib/api";

interface PinLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (cashierName: string, role: string) => void;
}

export const PinLoginModal: React.FC<PinLoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.listActiveUsers().then((uList) => {
        setUsers(uList);
        if (uList.length > 0) {
          setSelectedUserId(uList[0].id);
        }
      }).catch((e) => {
        console.error("Failed to load users:", e);
      });
      setPin("");
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    setErrorMsg(null);
    setPin((prev) => prev + digit);
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin("");
    setErrorMsg(null);
  };

  const handleVerify = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // If users list is empty (fallback dev mode)
      if (users.length === 0) {
        onSuccess("Manager", "Owner");
        setPin("");
        onClose();
        return;
      }
      const session = await api.loginWithPin(selectedUserId, pin);
      onSuccess(session.username, session.role);
      setPin("");
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || String(err));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rtl:right-auto rtl:left-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white">{t("auth.enter_pin")}</h2>
          <p className="text-xs text-slate-400 mt-1">{t("auth.unlock")}</p>
        </div>

        {/* User Selection */}
        {users.length > 1 && (
          <div className="mb-4">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* PIN Display Dots */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                pin.length > idx
                  ? "bg-emerald-500 border-emerald-400 scale-110 shadow-lg shadow-emerald-500/50"
                  : "border-slate-700 bg-slate-800"
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Numpad Grid */}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-14 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white text-xl font-bold border border-slate-700/50 transition active:scale-95"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider border border-slate-700/30 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-14 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 text-white text-xl font-bold border border-slate-700/50 transition active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 flex items-center justify-center border border-slate-700/30 transition"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleVerify}
          disabled={pin.length < 4 || loading}
          className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition"
        >
          <Check className="w-5 h-5" />
          <span>{loading ? "Verifying..." : t("auth.unlock")}</span>
        </button>
      </div>
    </div>
  );
};
