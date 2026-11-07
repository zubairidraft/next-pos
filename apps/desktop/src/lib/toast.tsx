// Toasts and in-app dialogs, replacing window.alert / confirm / prompt
// (those block the Tauri window and cannot be styled or translated).
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface DialogState {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string; type?: string; initial?: string };
  resolve: (value: string | boolean | null) => void;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
  /** Resolves true/false. */
  confirm: (title: string, message?: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  /** Resolves the typed text, or null when cancelled. */
  prompt: (title: string, label: string, opts?: { placeholder?: string; type?: string; initial?: string; message?: string }) => Promise<string | null>;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  // Stable object, so screens can list it in effect dependencies safely.
  const api: ToastApi = useMemo(() => ({
    success: (t) => push("success", t),
    error: (t) => push("error", t),
    info: (t) => push("info", t),
    confirm: (title, message, opts) =>
      new Promise<boolean>((resolve) => {
        setDialog({ title, message, confirmLabel: opts?.confirmLabel, danger: opts?.danger, resolve: (v) => resolve(v === true) });
      }),
    prompt: (title, label, opts) =>
      new Promise<string | null>((resolve) => {
        setInputValue(opts?.initial ?? "");
        setDialog({
          title,
          message: opts?.message,
          input: { label, placeholder: opts?.placeholder, type: opts?.type, initial: opts?.initial },
          resolve: (v) => resolve(typeof v === "string" ? v : null),
        });
      }),
  }), [push]);

  const close = (value: string | boolean | null) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed top-16 right-4 rtl:right-auto rtl:left-4 z-[100] flex flex-col gap-2 w-[min(92vw,380px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={
              "flex items-start gap-2 px-3.5 py-2.5 rounded-xl shadow-xl border text-sm font-medium " +
              (t.kind === "success"
                ? "bg-emerald-600 text-white border-emerald-400"
                : t.kind === "error"
                ? "bg-rose-600 text-white border-rose-400"
                : "bg-slate-800 text-white border-slate-600")
            }
          >
            {t.kind === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : t.kind === "error" ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <Info className="w-5 h-5 shrink-0" />}
            <span className="flex-1 break-words">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="w-4 h-4 opacity-80" />
            </button>
          </div>
        ))}
      </div>
      {dialog && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && close(dialog.input ? null : false)}>
          <form
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              close(dialog.input ? inputValue : true);
            }}
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{dialog.title}</h2>
            {dialog.message && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">{dialog.message}</p>}
            {dialog.input && (
              <label className="block mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {dialog.input.label}
                <input
                  autoFocus
                  type={dialog.input.type || "text"}
                  value={inputValue}
                  placeholder={dialog.input.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => close(dialog.input ? null : false)} className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                autoFocus={!dialog.input}
                className={"px-3.5 py-2 rounded-lg text-sm font-semibold text-white " + (dialog.danger ? "bg-rose-600" : "bg-emerald-600")}
              >
                {dialog.confirmLabel || "OK"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside ToastProvider");
  return c;
}
