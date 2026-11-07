import { useEffect, useState } from "react";
import { Boxes, Delete, KeyRound, Loader2, Lock, User } from "lucide-react";
import { api, errorText, UserSummary } from "../lib/api";
import { useSession } from "../context/SessionContext";

/** Startup / lock screen: pick a user and type the PIN, or use username + password. */
export function LoginScreen() {
  const { status, setSession } = useSession();
  const users = (status?.users || []).filter((u) => u.active);
  const [selected, setSelected] = useState<UserSummary | null>(users.find((u) => u.has_pin) || null);
  const [mode, setMode] = useState<"pin" | "password">(users.some((u) => u.has_pin) ? "pin" : "password");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPin("");
    setError(null);
  }, [selected, mode]);

  const submitPin = async (value: string) => {
    if (!selected || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      setSession(await api.loginPin(selected.id, value));
    } catch (e) {
      setError(errorText(e));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.loginPassword(username, password));
    } catch (err) {
      setError(errorText(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard digits for the PIN pad.
  useEffect(() => {
    if (mode !== "pin") return;
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 8 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submitPin(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{status?.store_name || "Next POS"}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Log in to start</p>
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4 text-xs font-semibold">
          <button
            className={`flex-1 py-1.5 rounded-lg ${mode === "pin" ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white" : "text-slate-500"}`}
            onClick={() => setMode("pin")}
            disabled={!users.some((u) => u.has_pin)}
          >
            <KeyRound className="w-3.5 h-3.5 inline mr-1" /> PIN
          </button>
          <button
            className={`flex-1 py-1.5 rounded-lg ${mode === "password" ? "bg-white dark:bg-slate-900 shadow text-slate-900 dark:text-white" : "text-slate-500"}`}
            onClick={() => setMode("password")}
          >
            <Lock className="w-3.5 h-3.5 inline mr-1" /> Password
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-3 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold">
            {error}
          </div>
        )}

        {mode === "pin" ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {users
                .filter((u) => u.has_pin)
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    className={`px-2 py-2 rounded-xl border text-xs font-semibold truncate ${
                      selected?.id === u.id
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    {u.username}
                    <span className="block text-[10px] font-normal opacity-70">{u.role}</span>
                  </button>
                ))}
            </div>
            <div className="flex justify-center gap-2 mb-4" aria-label="PIN digits">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  disabled={busy}
                  onClick={() => setPin((p) => (p.length < 8 ? p + d : p))}
                  className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-lg font-bold text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {d}
                </button>
              ))}
              <button disabled={busy} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete digit" className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <Delete className="w-5 h-5" />
              </button>
              <button disabled={busy} onClick={() => setPin((p) => (p.length < 8 ? p + "0" : p))} className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-lg font-bold text-slate-900 dark:text-white">
                0
              </button>
              <button
                disabled={busy || pin.length < 4 || !selected}
                onClick={() => submitPin(pin)}
                className="py-3 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold flex items-center justify-center"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : "OK"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitPassword} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Username
              <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white" />
            </label>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white" />
            </label>
            <button disabled={busy || !username || !password} className="w-full py-2.5 rounded-xl bg-emerald-600 disabled:opacity-40 text-white font-bold text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Log in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
