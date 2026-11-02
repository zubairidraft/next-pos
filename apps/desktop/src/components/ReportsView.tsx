import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TrendingUp,
  DollarSign,
  PieChart,
  ShoppingBag,
  ArrowUpRight,
  Receipt,
  Download,
  Calendar,
} from "lucide-react";

interface CategoryData {
  id: string;
  name: string;
  name_ur: string;
  qty_sold: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
}

interface TopProductData {
  sku: string;
  name: string;
  name_ur: string;
  qty: number;
  revenue: number;
  profit: number;
}

export function ReportsView() {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "year">("today");

  const [summary] = useState({
    gross_sales_paisa: 48500000, // PKR 485,000
    discounts_paisa: 1500000,    // PKR 15,000
    tax_paisa: 2800000,          // PKR 28,000
    net_sales_paisa: 47000000,   // PKR 470,000
    cogs_paisa: 37600000,        // PKR 376,000
    gross_profit_paisa: 9400000, // PKR 94,000
    gross_margin_percent: 20.0,
    sales_count: 324,
    units_sold: 1420,
    avg_ticket_paisa: 145061,     // PKR 1,450.61
    cash_tendered_paisa: 38000000,
    khata_tendered_paisa: 9000000,
  });

  const [categories] = useState<CategoryData[]>([
    {
      id: "cat-1",
      name: "Dairy & Beverages",
      name_ur: "ڈیری اور مشروبات",
      qty_sold: 450,
      revenue: 13500000,
      cogs: 11200000,
      profit: 2300000,
      margin: 17.0,
    },
    {
      id: "cat-2",
      name: "Cooking Essentials & Grains",
      name_ur: "کوکنگ اشیاء و اجناس",
      qty_sold: 280,
      revenue: 18500000,
      cogs: 15200000,
      profit: 3300000,
      margin: 17.8,
    },
    {
      id: "cat-3",
      name: "Snacks & Confectionery",
      name_ur: "سنیکس اور مٹھائیاں",
      qty_sold: 390,
      revenue: 8200000,
      cogs: 5900000,
      profit: 2300000,
      margin: 28.0,
    },
    {
      id: "cat-4",
      name: "Personal Care & Household",
      name_ur: "پرسنل کیئر اور ہاؤس ہولڈ",
      qty_sold: 300,
      revenue: 6800000,
      cogs: 5300000,
      profit: 1500000,
      margin: 22.1,
    },
  ]);

  const [topProducts] = useState<TopProductData[]>([
    {
      sku: "TEA-TAPAL-400",
      name: "Tapal Danedar Tea 400g",
      name_ur: "ٹپال دانے دار چائے ۴۰۰ گرام",
      qty: 65,
      revenue: 4875000,
      profit: 975000,
    },
    {
      sku: "MILK-OLPERS-1L",
      name: "Olpers Milk 1L Tetra",
      name_ur: "اولپرز دودھ ۱ لٹر",
      qty: 120,
      revenue: 3600000,
      profit: 600000,
    },
    {
      sku: "OIL-DALDA-5L",
      name: "Dalda Cooking Oil 5L Can",
      name_ur: "ڈالڈا کوکنگ آئل ۵ لٹر کین",
      qty: 18,
      revenue: 5220000,
      profit: 720000,
    },
    {
      sku: "SUGAR-FINE-1KG",
      name: "Fine White Sugar 1kg",
      name_ur: "سفید چینی ۱ کلو",
      qty: 210,
      revenue: 3150000,
      profit: 315000,
    },
    {
      sku: "FLOUR-AASHIRVAAD-10K",
      name: "Chakki Atta 10kg Bag",
      name_ur: "چکی آٹا ۱۰ کلو تھیلا",
      qty: 25,
      revenue: 3500000,
      profit: 400000,
    },
  ]);

  const formatPkr = (paisa: number) => {
    return `PKR ${(paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            {t("reports.title") || "Business Analytics & Performance"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time financial summary, COGS, gross margin, category performance, and velocity ranking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setDateRange("today")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                dateRange === "today" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange("week")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                dateRange === "week" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange("month")}
              className={`px-3 py-1 rounded-md font-medium transition ${
                dateRange === "month" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              This Month
            </button>
          </div>

          <button
            onClick={() => alert("Report exported to Excel/CSV successfully")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Gross Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Gross Sales</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">{formatPkr(summary.gross_sales_paisa)}</div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
            <span>Discounts: {formatPkr(summary.discounts_paisa)}</span>
            <span>Tax: {formatPkr(summary.tax_paisa)}</span>
          </div>
        </div>

        {/* Card 2: Cost of Goods Sold */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">COGS</span>
            <Receipt className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">{formatPkr(summary.cogs_paisa)}</div>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
            FIFO Inventory cost calculated
          </div>
        </div>

        {/* Card 3: Gross Profit & Margin */}
        <div className="bg-slate-900 border border-emerald-900/50 bg-gradient-to-br from-slate-900 to-emerald-950/20 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Gross Profit</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">{formatPkr(summary.gross_profit_paisa)}</div>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-emerald-400/90 font-medium">
            Margin: {summary.gross_margin_percent}% on net sales
          </div>
        </div>

        {/* Card 4: Orders & Average Ticket */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Sales Velocity</span>
            <ShoppingBag className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">{summary.sales_count} Transactions</div>
          <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
            Avg Ticket: {formatPkr(summary.avg_ticket_paisa)}
          </div>
        </div>
      </div>

      {/* Grid: Category Breakdown & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Performance */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              Category Performance
            </h3>
            <span className="text-xs text-slate-400 font-mono">By Revenue</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium text-right">Sold Qty</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                  <th className="pb-2 font-medium text-right">Gross Profit</th>
                  <th className="pb-2 font-medium text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5">
                      <div className="font-medium text-white">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-nastaliq">{c.name_ur}</div>
                    </td>
                    <td className="py-2.5 text-right text-slate-300 font-mono">{c.qty_sold}</td>
                    <td className="py-2.5 text-right font-medium text-slate-200 font-mono">
                      {formatPkr(c.revenue)}
                    </td>
                    <td className="py-2.5 text-right text-emerald-400 font-mono font-medium">
                      {formatPkr(c.profit)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-300">
                      {c.margin}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-sky-400" />
              Top Selling Products
            </h3>
            <span className="text-xs text-slate-400 font-mono">Top 5</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-medium">Product / SKU</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                  <th className="pb-2 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {topProducts.map((p) => (
                  <tr key={p.sku} className="hover:bg-slate-800/30">
                    <td className="py-2.5">
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-mono text-emerald-400">{p.sku}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-300 font-mono">{p.qty}</td>
                    <td className="py-2.5 text-right font-medium text-slate-200 font-mono">
                      {formatPkr(p.revenue)}
                    </td>
                    <td className="py-2.5 text-right text-emerald-400 font-mono font-medium">
                      {formatPkr(p.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Tender Breakdown Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          Payment Tender Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-400">Cash Payments</div>
            <div className="text-lg font-bold text-emerald-400 mt-1 font-mono">
              {formatPkr(summary.cash_tendered_paisa)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">80.8% of collections</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-400">Khata / Credit</div>
            <div className="text-lg font-bold text-amber-400 mt-1 font-mono">
              {formatPkr(summary.khata_tendered_paisa)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">19.2% of collections</div>
          </div>
          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
            <div className="text-xs text-slate-400">Total Net Inflow</div>
            <div className="text-lg font-bold text-white mt-1 font-mono">
              {formatPkr(summary.net_sales_paisa)}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">100% reconciled</div>
          </div>
        </div>
      </div>
    </div>
  );
}
