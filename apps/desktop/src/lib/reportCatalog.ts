// The list of reports and the date helpers, shared by the desktop Reports screen
// and the phone app so both always offer the same reports.

export interface ReportItem {
  kind: string;
  label: string;
  owner?: boolean;
}
export const REPORT_GROUPS: { title: string; items: ReportItem[] }[] = [
  { title: "Stock", items: [{ kind: "stock", label: "Stock report" }] },
  { title: "Purchase", items: [{ kind: "purchases", label: "Purchase report" }, { kind: "purchase_returns", label: "Purchase return report" }] },
  { title: "Sales", items: [{ kind: "sales", label: "Sales report" }, { kind: "sale_returns", label: "Sale return report" }, { kind: "services", label: "Services report" }] },
  { title: "Daily", items: [{ kind: "daily", label: "Daily summary" }] },
  { title: "Khata", items: [{ kind: "recovery", label: "Recovery report" }] },
  { title: "Staff", items: [{ kind: "salesman", label: "Salesman report" }, { kind: "activity", label: "Activity report", owner: true }] },
  { title: "Claims", items: [{ kind: "claims", label: "Claim report" }] },
  { title: "Profit", items: [{ kind: "profit", label: "Profit report" }] },
  {
    title: "Analysis",
    items: [
      { kind: "analysis_trend", label: "Sales trend" },
      { kind: "analysis_movers", label: "Fast / slow items" },
      { kind: "analysis_margin", label: "Product margin" },
    ],
  },
  {
    title: "Lists",
    items: [
      { kind: "list_products", label: "Products" },
      { kind: "list_customers", label: "Customers" },
      { kind: "list_vendors", label: "Vendors" },
    ],
  },
];

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function quickRange(range: string): [string, string] {
  const now = new Date();
  const today = ymd(now);
  const d = new Date(now);
  switch (range) {
    case "yesterday":
      d.setDate(d.getDate() - 1);
      return [ymd(d), ymd(d)];
    case "week": {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday first
      return [ymd(d), today];
    }
    case "month":
      return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case "last_month":
      return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
    case "year":
      return [ymd(new Date(now.getFullYear(), 0, 1)), today];
    default:
      return [today, today];
  }
}

export const QUICK_RANGES: [string, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["last_month", "Last month"],
  ["year", "This year"],
];

export const startOf = (d: string) => new Date(`${d}T00:00:00`).toISOString();
export const endOf = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();
