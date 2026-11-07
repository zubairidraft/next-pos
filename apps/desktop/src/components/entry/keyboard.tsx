// Keyboard-first entry pieces shared by the Sale and Purchase screens.
// Everything is a text box you type into: no drop-down lists, no number
// spinners. Enter moves to the next box; arrow keys move between rows.
import { forwardRef, KeyboardEvent, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { formatPkr, formatQty, ProductRow } from "../../lib/api";

/** Focus a cell of a grid: <input data-grid=… data-row=… data-col=…>. */
export function focusCell(grid: string, row: number, col: string) {
  const el = document.querySelector<HTMLInputElement>(`input[data-grid="${grid}"][data-row="${row}"][data-col="${col}"]`);
  if (el) {
    el.focus();
    el.select();
    return true;
  }
  return false;
}

/** Only digits and one dot (money, quantities). */
export const numeric = (v: string) => {
  const s = v.replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
};

/**
 * A grid cell: shows a value, edits as text, commits on Enter / Tab / leaving.
 * `onCommit` returns false to refuse (the old value comes back).
 */
export function CellInput({
  grid,
  row,
  col,
  value,
  onCommit,
  onEnter,
  onArrow,
  onEscape,
  className = "",
  label,
  warn,
}: {
  grid: string;
  row: number;
  col: string;
  value: string;
  onCommit: (text: string) => boolean | void;
  onEnter?: () => void;
  onArrow?: (dir: -1 | 1) => void;
  onEscape?: () => void;
  className?: string;
  label: string;
  warn?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return true;
    const ok = draft.trim() === value.trim() ? true : onCommit(draft) !== false;
    setDraft(null);
    return ok;
  };
  return (
    <input
      data-grid={grid}
      data-row={row}
      data-col={col}
      aria-label={label}
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(numeric(e.target.value))}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          onEnter?.();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          commit();
          onArrow?.(e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(null);
          onEscape?.();
        }
      }}
      className={`w-full px-2 py-1.5 rounded-lg border text-right font-semibold bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${warn ? "border-rose-400 text-rose-600" : "border-slate-200 dark:border-slate-700"} ${className}`}
    />
  );
}

export interface ItemSearchHandle {
  focus: () => void;
}

/**
 * The item box: scan a barcode (Enter), or type a name and pick with ↑ ↓ Enter.
 * `onCode` gets an exact barcode / SKU first; if it finds nothing the highlighted
 * suggestion is used.
 */
export const ItemSearch = forwardRef<ItemSearchHandle, {
  search: (q: string) => Promise<ProductRow[]>;
  onCode: (code: string) => Promise<boolean>;
  onPick: (p: ProductRow) => void;
  placeholder: string;
  showStock?: boolean;
  priceOf?: (p: ProductRow) => number | null | undefined;
  onKeyF?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEmptyEnter?: () => void;
  onArrowUpEmpty?: () => void;
}>(function ItemSearch({ search, onCode, onPick, placeholder, showStock = true, priceOf, onEmptyEnter, onArrowUpEmpty }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return setRows([]);
    const timer = setTimeout(() => search(t).then((r) => (setRows(r), setIdx(0))).catch(() => setRows([])), 130);
    return () => clearTimeout(timer);
  }, [q, search]);

  const clear = () => {
    setQ("");
    setRows([]);
  };

  const enter = async () => {
    const t = q.trim();
    if (!t) return onEmptyEnter?.();
    setBusy(true);
    try {
      if (await onCode(t)) return clear();
      if (rows[idx]) {
        onPick(rows[idx]);
        clear();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      {busy ? <Loader2 className="w-4 h-4 absolute left-3 top-3 text-emerald-600 animate-spin" /> : <Search className="w-4 h-4 absolute left-3 top-3 text-emerald-600 pointer-events-none" />}
      <input
        ref={input}
        autoFocus
        value={q}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            enter();
          } else if (e.key === "ArrowDown" && rows.length) {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, rows.length - 1));
          } else if (e.key === "ArrowUp") {
            if (rows.length) {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (!q) {
              e.preventDefault();
              onArrowUpEmpty?.();
            }
          } else if (e.key === "Escape") {
            clear();
          }
        }}
        placeholder={placeholder}
        aria-label="Item"
        className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-emerald-500/60 focus:border-emerald-500 bg-white dark:bg-slate-950 text-sm focus:outline-none"
      />
      {rows.length > 0 && (
        <div role="listbox" className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
          {rows.map((p, i) => (
            <div
              key={p.variant_id}
              role="option"
              aria-selected={i === idx}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(p);
                clear();
              }}
              className={`px-3 py-2 flex justify-between gap-3 text-sm cursor-pointer ${i === idx ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}
            >
              <span className="min-w-0">
                <span className="font-semibold block truncate">{p.name}{p.is_service && <span className="ml-1 text-[10px] px-1.5 rounded bg-indigo-100 text-indigo-700">service</span>}</span>
                <span className="text-xs text-slate-500">
                  {p.sku}
                  {p.barcode ? ` · ${p.barcode}` : ""}
                  {showStock && !p.is_service ? ` · stock ${formatQty(p.on_hand_milli, p.base_unit_code)}` : ""}
                </span>
              </span>
              <span className="font-bold whitespace-nowrap">{formatPkr(priceOf ? priceOf(p) : p.retail_price_paisa)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export interface PartyLite {
  id: string;
  name: string;
  phone: string | null;
  balance_paisa: number;
}

export interface TypeAheadHandle {
  focus: () => void;
}

/**
 * Pick a customer / vendor by typing: matches show under the box,
 * ↑ ↓ to choose, Enter to take it. "Add new" when nothing matches.
 */
export const PartyTypeAhead = forwardRef<TypeAheadHandle, {
  label: string;
  value: PartyLite | null;
  onChange: (p: PartyLite | null) => void;
  search: (q: string) => Promise<PartyLite[]>;
  onCreate?: (name: string) => Promise<PartyLite | null>;
  emptyText: string;
  onDone?: () => void;
  balanceLabel?: string;
}>(function PartyTypeAhead({ label, value, onChange, search, onCreate, emptyText, onDone, balanceLabel = "balance" }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PartyLite[]>([]);
  const [idx, setIdx] = useState(0);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => search(q.trim()).then((r) => (setRows(r.slice(0, 30)), setIdx(0))).catch(() => setRows([])), 120);
    return () => clearTimeout(t);
  }, [q, open, search]);

  const options = [...rows.map((r) => ({ kind: "pick" as const, r })), ...(onCreate && q.trim() ? [{ kind: "new" as const, r: null }] : [])];

  const choose = async (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "pick") onChange(o.r);
    else if (onCreate) {
      const made = await onCreate(q.trim());
      if (!made) return;
      onChange(made);
    }
    setQ("");
    setOpen(false);
    onDone?.();
  };

  return (
    <div className="relative">
      <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">{label}</label>
      <input
        ref={input}
        aria-label={label}
        autoComplete="off"
        value={open ? q : value ? `${value.name}${value.phone ? ` · ${value.phone}` : ""}` : ""}
        placeholder={emptyText}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (!q.trim() && !options.length) {
              setOpen(false);
              onDone?.();
            } else choose(idx);
          } else if (e.key === "Escape") {
            setOpen(false);
            onDone?.();
          } else if (e.key === "Delete" && !q) {
            onChange(null);
          }
        }}
        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {open && (
        <div role="listbox" className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto text-sm">
          {value && <div className="px-3 py-1.5 text-[11px] text-slate-400">Delete key = clear ({value.name})</div>}
          {options.length === 0 && <div className="px-3 py-2 text-slate-400">Type to search</div>}
          {options.map((o, i) =>
            o.kind === "pick" ? (
              <div key={o.r.id} role="option" aria-selected={i === idx} onMouseDown={(e) => (e.preventDefault(), choose(i))} className={`px-3 py-2 flex justify-between gap-2 cursor-pointer ${i === idx ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>
                <span className="truncate">{o.r.name}{o.r.phone ? <span className="text-xs text-slate-400"> · {o.r.phone}</span> : null}</span>
                <span className="text-xs whitespace-nowrap text-slate-500">{balanceLabel} {formatPkr(o.r.balance_paisa)}</span>
              </div>
            ) : (
              <div key="new" role="option" aria-selected={i === idx} onMouseDown={(e) => (e.preventDefault(), choose(i))} className={`px-3 py-2 flex items-center gap-1.5 cursor-pointer text-emerald-700 dark:text-emerald-300 font-semibold ${i === idx ? "bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>
                <UserPlus className="w-4 h-4" /> Add new: “{q.trim()}”
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
});

/** A labelled money / number box (no spinner). */
export const NumberBox = forwardRef<HTMLInputElement, {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  big?: boolean;
  placeholder?: string;
  hint?: string;
}>(function NumberBox({ label, value, onChange, onEnter, big, placeholder, hint }, ref) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500 flex justify-between"><span>{label}</span>{hint && <span className="text-slate-400">{hint}</span>}</span>
      <input
        ref={ref}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(numeric(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
        className={`w-full px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-right font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${big ? "py-2.5 text-xl" : "py-2 text-sm"}`}
      />
    </label>
  );
});

/** Small key hint like "F9". */
export function Key({ k }: { k: string }) {
  return <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200">{k}</kbd>;
}
