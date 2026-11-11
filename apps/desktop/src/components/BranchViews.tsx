// Branches on one PC (each one is a separate shop with its own data) and the
// shop name shown at the top of the screen.
import { useEffect, useState } from "react";
import { Boxes, Check, Loader2, Plus, Store, X } from "lucide-react";
import { api, Branch, BranchesInfo, BusinessSettings, errorText } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";

const field = "w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm";
const branchName = (b: Branch, i: number) => b.name.trim() || (i === 0 ? "Main branch" : "New branch (not set up yet)");

/** Shown when the app starts and there is more than one branch on this PC. */
export function BranchPicker({ info, onStay }: { info: BranchesInfo; onStay: () => void }) {
  const toast = useToast();
  const [opening, setOpening] = useState<string | null>(null);
  const open = async (b: Branch) => {
    if (b.id === info.current) return onStay();
    setOpening(b.id);
    try {
      await api.branchOpen(b.id);
    } catch (e) {
      setOpening(null);
      toast.error(errorText(e));
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/30 text-emerald-600"><Boxes className="w-6 h-6" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Choose a branch</h1>
            <p className="text-xs text-slate-500">Each branch has its own products, stock, sales and users.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {info.list.map((b, i) => (
            <button
              key={b.id}
              autoFocus={i === 0}
              disabled={!!opening}
              onClick={() => open(b)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left transition disabled:opacity-50"
            >
              <Store className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="flex-1 font-semibold text-slate-800 dark:text-slate-100 truncate">{branchName(b, i)}</span>
              {opening === b.id && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** More → Branches: open another branch, or add one (Owner). */
export function BranchesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<BranchesInfo | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    api.branches().then(setInfo).catch((e) => toast.error(errorText(e)));
  }, [isOpen, toast]);

  if (!isOpen) return null;

  const open = async (b: Branch) => {
    const ok = await toast.confirm(`Open ${branchName(b, info!.list.indexOf(b))}?`, "This window closes and Next POS opens again with that branch. Log in there with that branch's users.", { confirmLabel: "Open branch" });
    if (!ok) return;
    setBusy(b.id);
    try {
      await api.branchOpen(b.id);
    } catch (e) {
      setBusy(null);
      toast.error(errorText(e));
    }
  };

  const add = async () => {
    setBusy("add");
    try {
      const b = await api.branchCreate(name);
      setName("");
      setInfo(await api.branches());
      toast.success(`Branch "${b.name}" added. Open it to set it up.`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Branches" className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2"><Store className="w-5 h-5 text-emerald-600" /> Branches</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Each branch is a separate shop on this PC, with its own products, stock, sales, users, backup and cloud link.</p>
        {!info ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
        ) : (
          <div className="flex flex-col gap-2">
            {info.list.map((b, i) => {
              const here = b.id === info.current;
              return (
                <div key={b.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${here ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                  <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="flex-1 text-sm font-semibold truncate">{branchName(b, i)}</span>
                  {here ? (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Open now</span>
                  ) : (
                    <button disabled={!!busy} onClick={() => open(b)} className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1">
                      {busy === b.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Open
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <form
          className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New branch name, e.g. Gulberg" aria-label="New branch name" className={field} maxLength={60} />
          <button disabled={!name.trim() || !!busy} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1 shrink-0">
            {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add branch
          </button>
        </form>
      </div>
    </div>
  );
}

/** More → Shop name: the name at the top of the screen, on receipts and in the branch list. */
export function ShopNameModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const toast = useToast();
  const { refresh } = useSession();
  const [s, setS] = useState<BusinessSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setS(null);
    api.getSettings().then(setS).catch((e) => toast.error(errorText(e)));
  }, [isOpen, toast]);

  if (!isOpen) return null;

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api.saveSettings({ ...s, name: s.name.trim(), name_ur: s.name_ur?.trim() || null });
      await refresh();
      await api.branches().catch(() => null); // keeps the branch list's name in step
      toast.success("Shop name saved");
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-label="Shop name"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><Store className="w-5 h-5 text-emerald-600" /> Shop name</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">Shown at the top of the screen, on receipts and reports, and in the branch list.</p>
        {!s ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
        ) : (
          <>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Shop / branch name *
              <input autoFocus required value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className={`${field} mt-1`} maxLength={60} />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Name in Urdu
              <input dir="rtl" value={s.name_ur || ""} onChange={(e) => setS({ ...s, name_ur: e.target.value })} className={`${field} mt-1`} maxLength={60} />
            </label>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold">Cancel</button>
          <button disabled={!s || !s.name.trim() || busy} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>
  );
}
