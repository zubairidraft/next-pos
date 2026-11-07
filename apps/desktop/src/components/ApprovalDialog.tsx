import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ApprovalInput } from "../lib/api";
import { useSession } from "../context/SessionContext";

/**
 * Asks an Owner or Manager to approve something at the counter with their PIN.
 * The PIN is checked by the backend together with the action itself, so a
 * wrong PIN simply makes that action fail (and counts toward the lockout).
 */
export function ApprovalDialog({
  title,
  reason,
  onApprove,
  onCancel,
}: {
  title: string;
  reason: string;
  onApprove: (a: ApprovalInput) => void;
  onCancel: () => void;
}) {
  const { status } = useSession();
  const managers = (status?.users || []).filter((u) => u.active && u.has_pin && (u.role === "Owner" || u.role === "Manager"));
  const [userId, setUserId] = useState(managers[0]?.id || "");
  const [pin, setPin] = useState("");

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (userId && pin.length >= 4) onApprove({ user_id: userId, pin });
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{reason}</p>
        {managers.length === 0 ? (
          <p className="text-sm text-rose-600">No Owner or Manager has a PIN yet. The Owner can set one in More → Users.</p>
        ) : (
          <>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Approved by
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.username} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mt-3">
              PIN
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white tracking-widest"
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            Cancel
          </button>
          <button type="submit" disabled={!userId || pin.length < 4} className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 disabled:opacity-40">
            Approve
          </button>
        </div>
      </form>
    </div>
  );
}
