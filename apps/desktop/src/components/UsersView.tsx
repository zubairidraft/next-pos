import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldAlert, UserPlus, Users } from "lucide-react";
import { api, errorText, Role, UserSummary } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";

const input = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white";
const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300";

const ROLE_HELP: Record<Role, string> = {
  Owner: "Everything, including backups, users and settings",
  Manager: "Sales, discounts, returns, prices, purchases, stock, reports",
  Cashier: "Sales and returns (returns need a Manager PIN)",
  StockKeeper: "Purchases and stock counts",
};

export function UsersView() {
  const toast = useToast();
  const { session, refresh } = useSession();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: "", password: "", pin: "", role: "Cashier" as Role });

  const load = () => api.listUsers().then(setUsers).catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser({ username: f.username.trim(), password: f.password, pin: f.pin || null, role: f.role });
      toast.success(`User ${f.username} created`);
      setF({ username: "", password: "", pin: "", role: "Cashier" });
      load();
      refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const changePin = async (u: UserSummary) => {
    const pin = await toast.prompt(`New PIN for ${u.username}`, "4 to 8 digits", { type: "password" });
    if (!pin) return;
    try {
      await api.setPin(pin, u.id);
      toast.success("PIN changed");
      load();
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const toggle = async (u: UserSummary) => {
    if (u.active && !(await toast.confirm(`Disable ${u.username}?`, "They will not be able to log in until enabled again.", { danger: true, confirmLabel: "Disable" }))) return;
    try {
      await api.setUserActive(u.id, !u.active);
      load();
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const showPhrase = async () => {
    const pw = await toast.prompt("Show recovery phrase", "Your Owner password", { type: "password", message: "Only the Owner can see this. Keep it on paper, never on this PC." });
    if (!pw) return;
    try {
      const phrase = await api.revealRecoveryPhrase(pw);
      await toast.confirm("Recovery phrase", phrase, { confirmLabel: "Done" });
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_340px] gap-4">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
        <h2 className="text-base font-bold flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-emerald-500" /> Users</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2">Username</th>
              <th>Role</th>
              <th>PIN</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="py-2 font-semibold">{u.username}{u.id === session?.user_id && <span className="text-xs text-slate-400"> (you)</span>}</td>
                <td>{u.role}</td>
                <td>{u.has_pin ? "Set" : <span className="text-amber-600">Not set</span>}</td>
                <td>{u.active ? <span className="text-emerald-600">Active</span> : <span className="text-rose-600">Disabled</span>}</td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => changePin(u)} className="text-xs font-semibold text-emerald-600"><KeyRound className="w-3.5 h-3.5 inline" /> PIN</button>
                  {u.id !== session?.user_id && (
                    <button onClick={() => toggle(u)} className="text-xs font-semibold text-slate-500">{u.active ? "Disable" : "Enable"}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={showPhrase} className="mt-5 text-xs font-semibold text-amber-600 flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5" /> Show the shop recovery phrase
        </button>
      </section>

      <form onSubmit={create} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 h-fit">
        <h2 className="text-base font-bold flex items-center gap-2"><UserPlus className="w-4 h-4 text-emerald-500" /> Add user</h2>
        <label className={label}>Username<input className={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label className={label}>Password (8+ characters)<input type="password" className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label className={label}>PIN (4–8 digits)<input inputMode="numeric" className={input} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} /></label>
        <label className={label}>
          Role
          <select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {(["Cashier", "Manager", "StockKeeper", "Owner"] as Role[]).map((r) => (
              <option key={r} value={r}>{r === "StockKeeper" ? "Stock keeper" : r}</option>
            ))}
          </select>
          <span className="block font-normal text-slate-500 mt-1">{ROLE_HELP[f.role]}</span>
        </label>
        <button disabled={busy || f.username.trim().length < 3 || f.password.length < 8} className="w-full py-2 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Create user"}
        </button>
      </form>
    </div>
  );
}
