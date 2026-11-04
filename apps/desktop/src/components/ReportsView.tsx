import { useState, useEffect } from "react";
import {
  TrendingUp,
  DollarSign,
  PieChart,
  ShoppingBag,
  Receipt,
  Download,
  Calendar,
  Users,
  AlertTriangle,
  Boxes,
  ShieldAlert,
  Award,
  UserCheck,
  Percent,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  api,
  FinancialSummary,
  CategoryPerformance,
  TopProduct,
  InventoryValuation,
  LowStockReportRow,
} from "../lib/api";

function getDateBounds(range: "today" | "yesterday" | "week" | "month" | "year") {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function ReportsView() {
  const [activeTab, setActiveTab] = useState<
    "sales" | "inventory" | "financials" | "customers" | "employees"
  >("sales");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "year">("today");

  const [loading, setLoading] = useState(false);
  const [liveSummary, setLiveSummary] = useState<FinancialSummary | null>(null);
  const [liveCategories, setLiveCategories] = useState<CategoryPerformance[]>([]);
  const [liveTopProducts, setLiveTopProducts] = useState<TopProduct[]>([]);
  const [liveValuation, setLiveValuation] = useState<InventoryValuation | null>(null);
  const [liveLowStock, setLiveLowStock] = useState<LowStockReportRow[]>([]);
  const [isLiveActive, setIsLiveActive] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchReports = async () => {
      setLoading(true);
      const bounds = getDateBounds(dateRange);
      try {
        const [sum, cats, tops, val, low] = await Promise.all([
          api.getReportsSummary(bounds.start, bounds.end).catch(() => null),
          api.getCategoryPerformance(bounds.start, bounds.end).catch(() => []),
          api.getTopProducts(bounds.start, bounds.end, 10).catch(() => []),
          api.getInventoryValuation().catch(() => null),
          api.getLowStockReport().catch(() => []),
        ]);

        if (isMounted) {
          if (sum && (sum.sales_count > 0 || sum.gross_sales_paisa > 0)) {
            setLiveSummary(sum);
            setIsLiveActive(true);
          } else {
            setLiveSummary(sum);
          }
          if (cats && cats.length > 0) setLiveCategories(cats);
          if (tops && tops.length > 0) setLiveTopProducts(tops);
          if (val && val.total_variants_count > 0) setLiveValuation(val);
          if (low && low.length > 0) setLiveLowStock(low);
        }
      } catch (e) {
        console.warn("Failed to load live reports:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchReports();
    return () => {
      isMounted = false;
    };
  }, [dateRange]);

  const formatPkr = (paisa: number) => {
    return `PKR ${(paisa / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 1. Sales & Revenue Default State
  const DEFAULT_SALES_SUMMARY = {
    gross_sales_paisa: 48500000,
    discounts_paisa: 1500000,
    tax_paisa: 2800000,
    net_sales_paisa: 47000000,
    cogs_paisa: 37600000,
    gross_profit_paisa: 9400000,
    gross_margin_percent: 20.0,
    orders_count: 324,
    units_sold: 1420,
    avg_ticket_paisa: 145061,
  };

  const DEFAULT_PAYMENT_BREAKDOWN = [
    { method: "Cash", amount_paisa: 28500000, percent: 60.6, count: 215 },
    { method: "Credit / Khata", amount_paisa: 9200000, percent: 19.6, count: 48 },
    { method: "Debit / Credit Card", amount_paisa: 5100000, percent: 10.9, count: 32 },
    { method: "Raast (Instant P2M)", amount_paisa: 2400000, percent: 5.1, count: 18 },
    { method: "JazzCash / EasyPaisa", amount_paisa: 1800000, percent: 3.8, count: 11 },
  ];

  const DEFAULT_CATEGORY_SALES = [
    { name: "Cooking Oil & Ghee", qty: 280, revenue: 18500000, cogs: 15200000, profit: 3300000, margin: 17.8 },
    { name: "Dairy & Beverages", qty: 450, revenue: 13500000, cogs: 11200000, profit: 2300000, margin: 17.0 },
    { name: "Snacks & Confectionery", qty: 390, revenue: 8200000, cogs: 5900000, profit: 2300000, margin: 28.0 },
    { name: "Personal Care & Cleaning", qty: 300, revenue: 6800000, cogs: 5300000, profit: 1500000, margin: 22.1 },
  ];

  const refundsAndVoids = [
    { id: "RET-101", invoice: "INV-202610-0019", item: "Olpers Milk 1L Tetra", qty: 2, amount: 58000, reason: "Customer purchased wrong variant", cashier: "Ahmed Khan (Cashier #1)", time: "11:45 AM" },
    { id: "RET-102", invoice: "INV-202610-0082", item: "Shan Biryani Masala 50g", qty: 1, amount: 14000, reason: "Torn outer packet seal", cashier: "Bilal Raza (Cashier #2)", time: "02:10 PM" },
    { id: "VOID-103", invoice: "INV-202610-0114", item: "Complete Cart Void", qty: 5, amount: 245000, reason: "Customer forgot wallet at counter", cashier: "Ahmed Khan (Cashier #1)", time: "04:30 PM" },
  ];

  // 2. Inventory & Stock Reports State
  const DEFAULT_LOW_STOCK = [
    { sku: "DALDA-OIL-5L", name: "Dalda Cooking Oil 5L Tin", on_hand: 18, reorder_point: 25, unit: "CAN", supplier: "Dalda Foods", suggested_order: 30 },
    { sku: "SUGAR-FINE-1KG", name: "Fine White Sugar 1kg Pack", on_hand: 22, reorder_point: 50, unit: "KG", supplier: "Al-Rehman Traders", suggested_order: 100 },
    { sku: "TEA-TAPAL-400", name: "Tapal Danedar Tea 400g Pouch", on_hand: 12, reorder_point: 30, unit: "PCS", supplier: "Tapal Tea Agency", suggested_order: 40 },
    { sku: "DET-SURF-1KG", name: "Surf Excel Detergent 1kg", on_hand: 8, reorder_point: 20, unit: "PCS", supplier: "Unilever Pakistan", suggested_order: 25 },
  ];

  const DEFAULT_STOCK_VELOCITY = [
    { sku: "MILK-OLPERS-1L", name: "Olpers Milk 1L Tetra", status: "Fast Moving", velocity: "120 units / day", days_cover: "3.5 days", turnover: "High" },
    { sku: "TEA-TAPAL-400", name: "Tapal Danedar Tea 400g", status: "Fast Moving", velocity: "65 units / day", days_cover: "4.2 days", turnover: "High" },
    { sku: "SHAN-KOR-50G", name: "Shan Special Korma Masala", status: "Steady", velocity: "15 units / day", days_cover: "14 days", turnover: "Medium" },
    { sku: "PREM-GHEE-10K", name: "Desi Ghee 10kg Bucket", status: "Slow Moving", velocity: "1 unit / week", days_cover: "65 days", turnover: "Low" },
    { sku: "SP-OLIVE-250M", name: "Imported Extra Virgin Olive 250ml", status: "Dead Stock (>45d)", velocity: "0 units / 30d", days_cover: "180 days", turnover: "Critical" },
  ];

  const stockVelocity = liveTopProducts.length > 0
    ? liveTopProducts.map((p) => ({
        sku: p.sku,
        name: p.name,
        status: "Top Seller",
        velocity: `${Math.round(p.qty_sold_milli / 1000)} sold`,
        days_cover: `PKR ${(p.revenue_paisa / 100).toFixed(0)}`,
        turnover: "High",
      }))
    : DEFAULT_STOCK_VELOCITY;

  const DEFAULT_VALUATION = {
    total_items_count: 580,
    total_stock_units: 14850,
    cost_valuation_paisa: 382400000,
    retail_valuation_paisa: 468000000,
    unrealized_profit_paisa: 85600000,
    margin_percent: 18.29,
  };

  // Compute live or fallback values
  const salesSummary = (liveSummary && liveSummary.sales_count > 0) ? {
    gross_sales_paisa: liveSummary.gross_sales_paisa,
    discounts_paisa: liveSummary.discounts_paisa,
    tax_paisa: liveSummary.tax_paisa,
    net_sales_paisa: liveSummary.net_sales_paisa,
    cogs_paisa: liveSummary.cogs_paisa,
    gross_profit_paisa: liveSummary.gross_profit_paisa,
    gross_margin_percent: Math.round(liveSummary.gross_margin_percent * 10) / 10,
    orders_count: liveSummary.sales_count,
    units_sold: Math.round(liveSummary.total_units_sold_milli / 1000),
    avg_ticket_paisa: liveSummary.average_ticket_paisa,
  } : DEFAULT_SALES_SUMMARY;

  const paymentBreakdown = (liveSummary && liveSummary.tender_breakdown && liveSummary.tender_breakdown.length > 0)
    ? liveSummary.tender_breakdown.map(([method, amt]) => {
        const total = liveSummary.gross_sales_paisa || 1;
        return {
          method: method.toUpperCase(),
          amount_paisa: amt,
          percent: Math.round((amt / total) * 1000) / 10,
          count: Math.round(amt / (liveSummary.average_ticket_paisa || 1)) || 1,
        };
      })
    : DEFAULT_PAYMENT_BREAKDOWN;

  const categorySales = liveCategories.length > 0 ? liveCategories.map((c) => ({
    name: c.category_name,
    qty: Math.round(c.qty_sold_milli / 1000),
    revenue: c.revenue_paisa,
    cogs: c.cogs_paisa,
    profit: c.gross_profit_paisa,
    margin: Math.round(c.gross_margin_percent * 10) / 10,
  })) : DEFAULT_CATEGORY_SALES;

  const lowStockAlerts = liveLowStock.length > 0 ? liveLowStock : DEFAULT_LOW_STOCK;

  const stockValuation = liveValuation ? {
    total_items_count: liveValuation.total_variants_count,
    total_stock_units: Math.round(liveValuation.total_stock_milli / 1000),
    cost_valuation_paisa: liveValuation.total_cost_valuation_paisa,
    retail_valuation_paisa: liveValuation.total_retail_valuation_paisa,
    unrealized_profit_paisa: liveValuation.potential_profit_paisa,
    margin_percent: liveValuation.total_retail_valuation_paisa > 0
      ? Math.round((liveValuation.potential_profit_paisa / liveValuation.total_retail_valuation_paisa) * 10000) / 100
      : 0,
  } : DEFAULT_VALUATION;

  const stockAdjustments = [
    { date: "2026-10-31", item: "Olpers Milk 1000ml", reason: "Damaged packaging leak", qty_diff: -4, value_paisa: 96000, user: "Supervisor Imran" },
    { date: "2026-10-30", item: "Super Basmati Rice 1kg", reason: "Physical audit shortage (spillage)", qty_diff: -2, value_paisa: 64000, user: "Auditor Rashid" },
    { date: "2026-10-28", item: "Tapal Danedar 400g", reason: "Carton recount surplus", qty_diff: +2, value_paisa: 144000, user: "Supervisor Imran" },
  ];

  // 3. Financial & Profitability State
  const plStatement = {
    gross_revenue_paisa: 48500000,
    discounts_given_paisa: 1500000,
    net_revenue_paisa: 47000000,
    cogs_paisa: 37600000,
    gross_profit_paisa: 9400000,
    expenses: [
      { category: "Store Rent & Maintenance", amount_paisa: 1800000 },
      { category: "Staff Salaries & Daily Wages", amount_paisa: 2500000 },
      { category: "WAPDA Electricity & Generator Fuel", amount_paisa: 1200000 },
      { category: "Packaging Bags & Consumables", amount_paisa: 350000 },
      { category: "POS Cloud & Internet Subscriptions", amount_paisa: 150000 },
    ],
    total_expenses_paisa: 6000000,
    net_operating_profit_paisa: 3400000, // PKR 34,000
    net_margin_percent: 7.23,
  };

  const taxSummary = {
    total_taxable_sales_paisa: 17500000,
    sales_tax_collected_paisa: 2800000, // 16% on taxable
    tax_exempt_essential_sales_paisa: 29500000, // zero-rated milk, pulses, flour
    effective_tax_rate: "16.0% GST",
  };

  const zReportShift = {
    register_id: "REG-01 (Main Counter)",
    opened_at: "2026-11-02 08:00 AM",
    closed_at: "2026-11-02 05:30 PM",
    opening_float_paisa: 1000000, // PKR 10,000 float
    cash_sales_paisa: 28500000,
    cash_refunds_paisa: 58000,
    cash_drop_paisa: 500000,
    expected_cash_paisa: 38942000, // 10k + 285k - 580 - 5k
    counted_actual_cash_paisa: 38940000,
    discrepancy_paisa: -2000, // PKR 20 short
  };

  // 4. Customer Analytics State
  const topCustomers = [
    { id: "cust-01", name: "Haji Muhammad Aslam", phone: "0300-1234567", orders_count: 48, lifetime_spend: 34500000, outstanding_khata: 2850000, tier: "Platinum VIP", loyalty_points: 3450 },
    { id: "cust-02", name: "Chaudhry Riaz Ahmed", phone: "0301-7654321", orders_count: 35, lifetime_spend: 28000000, outstanding_khata: 3200000, tier: "Gold VIP", loyalty_points: 2800 },
    { id: "cust-03", name: "Malik Usman Store", phone: "0321-9876543", orders_count: 29, lifetime_spend: 21500000, outstanding_khata: 1420000, tier: "Gold VIP", loyalty_points: 2150 },
    { id: "cust-04", name: "Dr. Farhan Qureshi", phone: "0333-8899112", orders_count: 22, lifetime_spend: 14200000, outstanding_khata: 0, tier: "Silver", loyalty_points: 1420 },
    { id: "cust-05", name: "Captain Tariq Mehmood", phone: "0345-4422110", orders_count: 18, lifetime_spend: 9800000, outstanding_khata: 0, tier: "Silver", loyalty_points: 980 },
  ];

  // 5. Employee & Staff State
  const staffPerformance = [
    { id: "emp-01", name: "Ahmed Khan", role: "Head Cashier", shifts_worked: 26, transactions: 1840, total_sales: 28500000, avg_speed: "42 sec/ticket", void_count: 2, commission: 285000 },
    { id: "emp-02", name: "Bilal Raza", role: "Junior Cashier", shifts_worked: 24, transactions: 1220, total_sales: 18500000, avg_speed: "55 sec/ticket", void_count: 4, commission: 185000 },
    { id: "emp-03", name: "Hamza Tariq", role: "Night Shift Cashier", shifts_worked: 22, transactions: 840, total_sales: 11200000, avg_speed: "48 sec/ticket", void_count: 1, commission: 112000 },
  ];

  const handleExportCSV = () => {
    const csvRows: string[] = [];
    csvRows.push("Next POS - Comprehensive Enterprise Business Intelligence Report");
    csvRows.push(`Report Module,${activeTab.toUpperCase()}`);
    csvRows.push(`Date Range,${dateRange.toUpperCase()}`);
    csvRows.push(`Exported Timestamp,"${new Date().toLocaleString()}"`);
    csvRows.push("");

    if (activeTab === "sales") {
      csvRows.push("METRIC,VALUE (PKR)");
      csvRows.push(`Gross Sales,${(salesSummary.gross_sales_paisa / 100).toFixed(2)}`);
      csvRows.push(`Discounts,${(salesSummary.discounts_paisa / 100).toFixed(2)}`);
      csvRows.push(`Sales Tax Collected,${(salesSummary.tax_paisa / 100).toFixed(2)}`);
      csvRows.push(`Net Sales,${(salesSummary.net_sales_paisa / 100).toFixed(2)}`);
      csvRows.push(`COGS (Cost of Goods Sold),${(salesSummary.cogs_paisa / 100).toFixed(2)}`);
      csvRows.push(`Gross Profit,${(salesSummary.gross_profit_paisa / 100).toFixed(2)}`);
      csvRows.push(`Gross Margin %,${salesSummary.gross_margin_percent}%`);
      csvRows.push(`Total Orders Count,${salesSummary.orders_count}`);
      csvRows.push(`Average Ticket Size,${(salesSummary.avg_ticket_paisa / 100).toFixed(2)}`);
      csvRows.push("");
      csvRows.push("CATEGORY,QTY SOLD,REVENUE (PKR),COGS (PKR),GROSS PROFIT (PKR),MARGIN %");
      categorySales.forEach((c) => {
        csvRows.push(`"${c.name}",${c.qty},${(c.revenue / 100).toFixed(2)},${(c.cogs / 100).toFixed(2)},${(c.profit / 100).toFixed(2)},${c.margin}%`);
      });
      csvRows.push("");
      csvRows.push("TENDER METHOD,TOTAL (PKR),PERCENTAGE,ORDERS COUNT");
      paymentBreakdown.forEach((p) => {
        csvRows.push(`"${p.method}",${(p.amount_paisa / 100).toFixed(2)},${p.percent}%,${p.count}`);
      });
    } else if (activeTab === "inventory") {
      csvRows.push("LOW STOCK REORDER ALERTS");
      csvRows.push("SKU,PRODUCT NAME,ON HAND,REORDER POINT,UNIT,SUPPLIER,SUGGESTED ORDER QTY");
      lowStockAlerts.forEach((item) => {
        csvRows.push(`${item.sku},"${item.name}",${item.on_hand},${item.reorder_point},${item.unit},"${item.supplier}",${item.suggested_order}`);
      });
      csvRows.push("");
      csvRows.push("STOCK VELOCITY TURNOVER");
      csvRows.push("SKU,PRODUCT NAME,STATUS,DAILY VELOCITY,DAYS COVER,TURNOVER");
      stockVelocity.forEach((v) => {
        csvRows.push(`${v.sku},"${v.name}",${v.status},${v.velocity},${v.days_cover},${v.turnover}`);
      });
    } else if (activeTab === "financials") {
      csvRows.push("PROFIT & LOSS STATEMENT");
      csvRows.push(`Gross Revenue,${(plStatement.gross_revenue_paisa / 100).toFixed(2)}`);
      csvRows.push(`Discounts Allowed,${(plStatement.discounts_given_paisa / 100).toFixed(2)}`);
      csvRows.push(`Net Revenue,${(plStatement.net_revenue_paisa / 100).toFixed(2)}`);
      csvRows.push(`Cost of Goods Sold (COGS),${(plStatement.cogs_paisa / 100).toFixed(2)}`);
      csvRows.push(`Gross Profit,${(plStatement.gross_profit_paisa / 100).toFixed(2)}`);
      csvRows.push("");
      csvRows.push("OPERATING EXPENSES,AMOUNT (PKR)");
      plStatement.expenses.forEach((e) => {
        csvRows.push(`"${e.category}",${(e.amount_paisa / 100).toFixed(2)}`);
      });
      csvRows.push(`Total Operating Expenses,${(plStatement.total_expenses_paisa / 100).toFixed(2)}`);
      csvRows.push(`Net Operating Profit,${(plStatement.net_operating_profit_paisa / 100).toFixed(2)}`);
    } else if (activeTab === "customers") {
      csvRows.push("VIP CUSTOMER ANALYTICS");
      csvRows.push("CUSTOMER NAME,PHONE,ORDERS COUNT,LIFETIME SPEND (PKR),KHATA BALANCE (PKR),TIER,POINTS");
      topCustomers.forEach((c) => {
        csvRows.push(`"${c.name}",${c.phone},${c.orders_count},${(c.lifetime_spend / 100).toFixed(2)},${(c.outstanding_khata / 100).toFixed(2)},${c.tier},${c.loyalty_points}`);
      });
    } else if (activeTab === "employees") {
      csvRows.push("EMPLOYEE SALES PERFORMANCE");
      csvRows.push("EMPLOYEE,DESIGNATION,SHIFTS,TRANSACTIONS,TOTAL SALES (PKR),AVG SPEED,VOIDS,COMMISSION (PKR)");
      staffPerformance.forEach((s) => {
        csvRows.push(`"${s.name}",${s.role},${s.shifts_worked},${s.transactions},${(s.total_sales / 100).toFixed(2)},${s.avg_speed},${s.void_count},${(s.commission / 100).toFixed(2)}`);
      });
    }

    const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `NextPOS_${activeTab}_Report_${dateRange}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <span>Executive Business Intelligence & Analytics</span>
            {loading && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
            {isLiveActive ? (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                Live SQLite
              </span>
            ) : (
              <span className="text-[10px] uppercase font-medium tracking-wider px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                Demo Preview
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enterprise reporting for Sales, Inventory Valuation, P&L, Tax GST, Customers, and Cashier Performance.
          </p>
        </div>

        {/* Global Controls: Date Range & Export */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
            <button
              onClick={() => setDateRange("today")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                dateRange === "today"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange("yesterday")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                dateRange === "yesterday"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDateRange("week")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                dateRange === "week"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange("month")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                dateRange === "month"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              This Month
            </button>
          </div>

          {/* Export to CSV Button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition shadow-xs"
            title="Download CSV Spreadsheet for Excel"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Module Tabs (The 5 Core Pillars) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("sales")}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === "sales"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>1. Sales & Revenue</span>
        </button>

        <button
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === "inventory"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>2. Inventory & Stock</span>
        </button>

        <button
          onClick={() => setActiveTab("financials")}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === "financials"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>3. Financials & P&L</span>
        </button>

        <button
          onClick={() => setActiveTab("customers")}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === "customers"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>4. Customer Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab("employees")}
          className={`pb-3 text-xs font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === "employees"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>5. Staff & Cashier Audits</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: SALES & REVENUE REPORTS */}
      {/* ============================================================== */}
      {activeTab === "sales" && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Gross Sales</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {formatPkr(salesSummary.gross_sales_paisa)}
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-flex items-center gap-1">
                +14.2% vs previous period
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Net Revenue</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {formatPkr(salesSummary.net_sales_paisa)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">After PKR 15k order discounts</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Gross Profit (COGS Deducted)</span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                {formatPkr(salesSummary.gross_profit_paisa)}
              </div>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{salesSummary.gross_margin_percent}% Margin</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Orders & Avg Ticket</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {salesSummary.orders_count} orders
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Avg Ticket: {formatPkr(salesSummary.avg_ticket_paisa)}</span>
            </div>
          </div>

          {/* Category Sales & Payment Methods Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Category Breakdown Table */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-500" />
                  Category-Wise Sales & Profit Contribution
                </h3>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-2.5">Category</th>
                      <th className="px-3.5 py-2.5 text-center">Units</th>
                      <th className="px-3.5 py-2.5 text-right">Revenue</th>
                      <th className="px-3.5 py-2.5 text-right">Profit</th>
                      <th className="px-3.5 py-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                    {categorySales.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                        <td className="px-3.5 py-2.5 text-center font-mono">{c.qty}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">{formatPkr(c.revenue)}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatPkr(c.profit)}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-500" />
                Payment Method Tender Share
              </h3>

              <div className="space-y-3">
                {paymentBreakdown.map((p, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{p.method} ({p.count} txns)</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{formatPkr(p.amount_paisa)} ({p.percent}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${p.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Refunds & Returns Audit Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-500" />
                  Refunds, Returns & Voided Orders (Leakage Prevention)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Full cashier audit trail for items returned or cancelled at counter.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                {refundsAndVoids.length} Incidents Recorded
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Doc #</th>
                    <th className="px-4 py-3">Original Invoice</th>
                    <th className="px-4 py-3">Item / Description</th>
                    <th className="px-4 py-3 text-right">Refund Amount</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Cashier</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                  {refundsAndVoids.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-bold text-rose-600 dark:text-rose-400">{r.id}</td>
                      <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">{r.invoice}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{r.item} (x{r.qty})</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {formatPkr(r.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.reason}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">{r.cashier}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] font-mono">{r.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: INVENTORY & STOCK REPORTS */}
      {/* ============================================================== */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          {/* Stock Valuation Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total SKUs in Warehouse</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                {stockValuation.total_items_count} products
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{stockValuation.total_stock_units.toLocaleString()} total units on hand</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Valuation at Cost (WAC)</span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
                {formatPkr(stockValuation.cost_valuation_paisa)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Total invested inventory capital</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Valuation at Retail Price</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {formatPkr(stockValuation.retail_valuation_paisa)}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Expected sales realization</span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Unrealized Gross Margin</span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                {formatPkr(stockValuation.unrealized_profit_paisa)}
              </div>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{stockValuation.margin_percent}% potential margin</span>
            </div>
          </div>

          {/* Low Stock Alerts (Reorder Report) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Low Stock Reorder Alerts (Safety Level Breaches)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Products that have fallen below minimum thresholds requiring immediate supplier purchase orders.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                {lowStockAlerts.length} SKUs Critical
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 text-center">On Hand</th>
                    <th className="px-4 py-3 text-center">Safety Level</th>
                    <th className="px-4 py-3">Preferred Supplier</th>
                    <th className="px-4 py-3 text-right">Suggested Order Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                  {lowStockAlerts.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-bold text-amber-600 dark:text-amber-400">{item.sku}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                        {item.on_hand} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-500 dark:text-slate-400">
                        {item.reorder_point} {item.unit}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.supplier}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        +{item.suggested_order} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fast vs Slow Moving Inventory Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock Velocity Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-500" />
                Velocity & Dead Stock Identification
              </h3>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-2.5">Product</th>
                      <th className="px-3.5 py-2.5">Velocity</th>
                      <th className="px-3.5 py-2.5">Coverage</th>
                      <th className="px-3.5 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                    {stockVelocity.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">{v.name}</td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">{v.velocity}</td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">{v.days_cover}</td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              v.turnover === "High"
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                                : v.turnover === "Critical"
                                ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stock Adjustments & Damage Loss Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Physical Audit Variance & Damage Loss Logs
              </h3>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3.5 py-2.5">Product</th>
                      <th className="px-3.5 py-2.5">Reason</th>
                      <th className="px-3.5 py-2.5 text-center">Diff</th>
                      <th className="px-3.5 py-2.5 text-right">Loss (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                    {stockAdjustments.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{a.date}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900 dark:text-white">{a.item}</td>
                        <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">{a.reason}</td>
                        <td className="px-3.5 py-2.5 text-center font-mono font-bold text-rose-600 dark:text-rose-400">{a.qty_diff}</td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">{formatPkr(a.value_paisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: FINANCIALS & P&L REPORTS */}
      {/* ============================================================== */}
      {activeTab === "financials" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* P&L Statement Card */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  Profit & Loss (P&L) Statement
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">All figures in Pakistani Rupee (PKR)</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-semibold text-slate-800 dark:text-slate-200">
                  <span>Gross Operating Sales</span>
                  <span className="font-mono">{formatPkr(plStatement.gross_revenue_paisa)}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400 pl-4">
                  <span>Less: Total Discounts & Promotions</span>
                  <span className="font-mono text-rose-500">- {formatPkr(plStatement.discounts_given_paisa)}</span>
                </div>
                <div className="flex justify-between py-2 border-y border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-950/40 px-2 rounded-lg">
                  <span>Net Revenue</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatPkr(plStatement.net_revenue_paisa)}</span>
                </div>

                <div className="flex justify-between py-1.5 text-slate-700 dark:text-slate-300 font-semibold">
                  <span>Less: Cost of Goods Sold (COGS - Landed WAC)</span>
                  <span className="font-mono text-rose-500">- {formatPkr(plStatement.cogs_paisa)}</span>
                </div>

                <div className="flex justify-between py-2 border-y border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white bg-emerald-50 dark:bg-emerald-950/20 px-2 rounded-lg">
                  <span>Gross Profit</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatPkr(plStatement.gross_profit_paisa)} (20.0%)</span>
                </div>

                {/* Operating Expenses Section */}
                <div className="pt-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">Operating Expenses (Opex):</span>
                  {plStatement.expenses.map((e, idx) => (
                    <div key={idx} className="flex justify-between py-1 pl-4 text-slate-600 dark:text-slate-400">
                      <span>{e.category}</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{formatPkr(e.amount_paisa)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 pl-4 font-semibold text-slate-800 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
                    <span>Total Operating Expenses</span>
                    <span className="font-mono text-rose-500">- {formatPkr(plStatement.total_expenses_paisa)}</span>
                  </div>
                </div>

                {/* Final Net Profit */}
                <div className="flex justify-between py-3 border-t-2 border-slate-300 dark:border-slate-700 font-extrabold text-sm text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-950 px-3 rounded-xl mt-3">
                  <span>Net Operating Profit</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base">
                    {formatPkr(plStatement.net_operating_profit_paisa)} ({plStatement.net_margin_percent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Tax & Z-Report Column */}
            <div className="lg:col-span-4 space-y-6">
              {/* Tax Summary Report */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-500" />
                  Tax / GST Filing Summary (FBR / PRA)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Taxable Goods (GST 16%):</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatPkr(taxSummary.total_taxable_sales_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>GST Collected on Sales:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPkr(taxSummary.sales_tax_collected_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Zero-Rated / Exempt Items:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatPkr(taxSummary.tax_exempt_essential_sales_paisa)}</span>
                  </div>
                </div>
              </div>

              {/* Shift Z-Report Cash Drawer Reconciliation */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-500" />
                  Shift Register Closure (Z-Report)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Counter Register:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{zReportShift.register_id}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Drawer Opening Float:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{formatPkr(zReportShift.opening_float_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Expected Cash in Drawer:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{formatPkr(zReportShift.expected_cash_paisa)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Physical Cash Counted:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatPkr(zReportShift.counted_actual_cash_paisa)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 font-bold">
                    <span>Cash Variance / Discrepancy:</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{formatPkr(zReportShift.discrepancy_paisa)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: CUSTOMER ANALYTICS */}
      {/* ============================================================== */}
      {activeTab === "customers" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  VIP Customers & Lifetime Value (LTV) Ranking
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Top revenue-generating clients, loyalty reward points balance, and outstanding Khata exposure.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Customer Profile</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3 text-center">Visits</th>
                    <th className="px-4 py-3 text-right">Lifetime Spend</th>
                    <th className="px-4 py-3 text-right">Current Khata Due</th>
                    <th className="px-4 py-3 text-center">VIP Tier</th>
                    <th className="px-4 py-3 text-right">Loyalty Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                  {topCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">{c.phone}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{c.orders_count}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatPkr(c.lifetime_spend)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                        {c.outstanding_khata > 0 ? formatPkr(c.outstanding_khata) : "Clear (0.00)"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            c.tier.includes("Platinum")
                              ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20"
                              : c.tier.includes("Gold")
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {c.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {c.loyalty_points.toLocaleString()} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: STAFF & CASHIER PERFORMANCE */}
      {/* ============================================================== */}
      {activeTab === "employees" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                  Cashier & Staff Sales Velocity & Void Audits
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Shift performance, average checkout speed, commission calculations, and security void alerts.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Employee Name</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3 text-center">Shifts</th>
                    <th className="px-4 py-3 text-center">Transactions</th>
                    <th className="px-4 py-3 text-right">Total Revenue Closed</th>
                    <th className="px-4 py-3 text-center">Speed</th>
                    <th className="px-4 py-3 text-center">Voids Logged</th>
                    <th className="px-4 py-3 text-right">Commission (1%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-sans">
                  {staffPerformance.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{s.name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.role}</td>
                      <td className="px-4 py-3 text-center font-mono font-semibold">{s.shifts_worked}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-900 dark:text-white">{s.transactions}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatPkr(s.total_sales)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{s.avg_speed}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                            s.void_count > 2
                              ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {s.void_count} voids
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {formatPkr(s.commission)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
