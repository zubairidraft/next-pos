import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, FileDown, FileSpreadsheet, FolderOpen, Loader2, Printer, Search } from "lucide-react";
import { api, errorText, isTauri, ReportTable } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { useToast } from "../lib/toast";
import { fileStem, formatCell, isNumericKind, periodText, reportPdf, reportXlsx, saveFile } from "../lib/exporter";
import { A4_LANDSCAPE, A4_PAGE, printElement } from "../lib/print";
import { endOf, QUICK_RANGES as QUICK, quickRange as quick, REPORT_GROUPS as GROUPS, startOf } from "../lib/reportCatalog";


/** All reports, each for a from – to period, with PDF / Excel / print. */
export function ReportsView({ initialKind = "daily" }: { initialKind?: string }) {
  const toast = useToast();
  const { status, can } = useSession();
  const [kind, setKind] = useState(initialKind);
  const [from, setFrom] = useState(() => quick("today")[0]);
  const [to, setTo] = useState(() => quick("today")[1]);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyLow, setOnlyLow] = useState(initialKind === "stock");
  const [busy, setBusy] = useState<"" | "pdf" | "xlsx">("");
  useEffect(() => {
    setKind(initialKind);
    setOnlyLow(initialKind === "stock");
  }, [initialKind]);

  const store = status?.store_name || "";
  const items = GROUPS.flatMap((g) => g.items).filter((i) => !i.owner || can("SettingsManage"));
  const current = items.find((i) => i.kind === kind) || items[0];
  const dated = !kind.startsWith("list_");

  const run = useCallback(
    async (f: string, t: string) => {
      if (f > t) return toast.error("The 'from' date is after the 'to' date.");
      setLoading(true);
      try {
        setTable(await api.report(kind, startOf(f), endOf(t)));
      } catch (e) {
        setTable(null);
        toast.error(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [kind, toast]
  );
  useEffect(() => {
    run(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const statusCol = table?.columns.findIndex((c) => c.key === "status") ?? -1;
  const shown = useMemo(() => {
    if (!table) return null;
    const q = filter.trim().toLowerCase();
    let rows = table.rows;
    if (kind === "stock" && onlyLow && statusCol >= 0) rows = rows.filter((r) => r[statusCol]);
    if (q) rows = rows.filter((r) => r.some((v) => String(v ?? "").toLowerCase().includes(q)));
    if (rows === table.rows) return table;
    // Totals for the rows still shown.
    const totals = table.totals.length
      ? table.totals.map((v, i) => (typeof v === "number" ? rows.reduce((s, r) => s + (typeof r[i] === "number" ? (r[i] as number) : 0), 0) : v))
      : [];
    const note = [table.note, `Filtered: ${rows.length} of ${table.rows.length} rows.`].filter(Boolean).join(" ");
    return { ...table, rows, totals, note };
  }, [table, filter, onlyLow, kind, statusCol]);

  const exportAs = async (fmt: "pdf" | "xlsx") => {
    if (!shown) return;
    setBusy(fmt);
    try {
      const data = fmt === "pdf" ? await reportPdf(shown, store) : await reportXlsx(shown, store);
      const name = `${fileStem(shown, store)}.${fmt}`;
      const where = await saveFile(name, data, fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      toast.success(where ? `Saved: ${where}` : `${name} downloaded`);
    } catch (e) {
      toast.error(`Export failed: ${errorText(e)}`);
    } finally {
      setBusy("");
    }
  };

  const print = () => {
    const el = document.getElementById("report-print");
    if (el && shown) printElement(el, { ...(shown.columns.length > 6 ? A4_LANDSCAPE : A4_PAGE), title: shown.title });
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <nav aria-label="Reports" className="lg:w-56 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 space-y-3 h-fit">
        <h2 className="text-base font-bold flex items-center gap-2 px-1"><BarChart3 className="w-5 h-5 text-emerald-500" /> Reports</h2>
        {GROUPS.map((g) => {
          const list = g.items.filter((i) => !i.owner || can("SettingsManage"));
          if (!list.length) return null;
          return (
            <div key={g.title}>
              <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 px-1 mb-0.5">{g.title}</div>
              {list.map((i) => (
                <button
                  key={i.kind}
                  onClick={() => {
                    setKind(i.kind);
                    setFilter("");
                  }}
                  aria-current={kind === i.kind}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm ${kind === i.kind ? "bg-emerald-600 text-white font-semibold" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          );
        })}
      </nav>

      <section className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3 justify-between">
          <div>
            <h3 className="text-lg font-bold">{table?.title || current?.label}</h3>
            <p className="text-xs text-slate-500">{table ? periodText(table) : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportAs("pdf")} disabled={!shown || !!busy} className="px-3 py-2 rounded-xl bg-rose-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1">
              {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
            </button>
            <button onClick={() => exportAs("xlsx")} disabled={!shown || !!busy} className="px-3 py-2 rounded-xl bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1">
              {busy === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel
            </button>
            <button onClick={print} disabled={!shown} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-xs font-semibold flex items-center gap-1"><Printer className="w-4 h-4" /> Print</button>
            {isTauri && (
              <button onClick={() => api.openExportsFolder().catch((e) => toast.error(errorText(e)))} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold flex items-center gap-1"><FolderOpen className="w-4 h-4" /> Saved files</button>
            )}
          </div>
        </div>

        {dated && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(from, to);
            }}
          >
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              From
              <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              To
              <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
            </label>
            <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Show</button>
            <div className="flex flex-wrap gap-1">
              {QUICK.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const [f, t] = quick(k);
                    setFrom(f);
                    setTo(t);
                    run(f, t);
                  }}
                  className="px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                >
                  {l}
                </button>
              ))}
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search in this report" aria-label="Search in report" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
          </div>
          {kind === "stock" && (
            <label className="text-xs font-semibold flex items-center gap-2">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="w-4 h-4" /> Only low / out of stock
            </label>
          )}
          {loading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        </div>

        {shown && (
          <div id="report-print" className="space-y-3">
            <div className="hidden print:block">
              <div className="font-bold text-base">{store}</div>
              <div className="font-semibold">{shown.title} · {periodText(shown)}</div>
            </div>
            {shown.summary.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                {shown.summary.map((s) => (
                  <div key={s.label} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <div className="text-[11px] text-slate-500">{s.label}</div>
                    <div className="text-base font-extrabold mt-0.5">{formatCell(s.value, s.kind) || "—"}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-auto max-h-[60vh] border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-sm" data-testid="report-table">
                <thead className="sticky top-0 bg-emerald-600 text-white text-xs">
                  <tr>
                    {shown.columns.map((c) => (
                      <th key={c.key} className={`px-3 py-2 whitespace-nowrap font-semibold ${isNumericKind(c.kind) ? "text-right" : "text-left"}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.rows.length === 0 && (
                    <tr><td colSpan={shown.columns.length} className="py-10 text-center text-slate-500">Nothing in this period.</td></tr>
                  )}
                  {shown.rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800 even:bg-slate-50/60 dark:even:bg-slate-800/30">
                      {r.map((v, j) => {
                        const c = shown.columns[j];
                        const bad = (c.key === "status" && (v === "Out of stock" || v === "Not selling")) || (c.key === "flag" && v === "Sold below cost") || (typeof v === "number" && v < 0 && c.kind === "money");
                        const warn = c.key === "status" && v === "Low";
                        return (
                          <td key={j} className={`px-3 py-1.5 ${isNumericKind(c.kind) ? "text-right whitespace-nowrap" : ""} ${bad ? "text-rose-600 font-semibold" : ""} ${warn ? "text-amber-600 font-semibold" : ""}`}>
                            {formatCell(v, c.kind)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {shown.totals.length > 0 && shown.rows.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-emerald-50 dark:bg-emerald-950/60 font-bold">
                    <tr>
                      {shown.totals.map((v, j) => (
                        <td key={j} className={`px-3 py-2 border-t-2 border-emerald-600 ${isNumericKind(shown.columns[j].kind) ? "text-right whitespace-nowrap" : ""}`}>
                          {typeof v === "string" ? v : formatCell(v, shown.columns[j].kind)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {shown.note && <p className="text-xs text-slate-500">{shown.note}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
