// Clean PDF and Excel files for reports and product lists.
// In the desktop app files are saved in Documents\Next POS Exports;
// in browser test mode they download normally.
import { api, formatPkr, isTauri, ReportCellKind, ReportTable } from "./api";

type Cell = string | number | null;

/** How a report value is shown on screen and in the PDF. */
export function formatCell(v: Cell, kind: ReportCellKind): string {
  if (v === null || v === undefined || v === "") return "";
  switch (kind) {
    case "money":
      return typeof v === "number" ? formatPkr(v) : String(v);
    case "qty":
      return typeof v === "number" ? (v / 1000).toLocaleString("en-PK", { maximumFractionDigits: 3 }) : String(v);
    case "int":
      return typeof v === "number" ? v.toLocaleString("en-PK") : String(v);
    case "percent":
      return typeof v === "number" ? `${v.toFixed(1)}%` : String(v);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(String(v))
        ? new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : new Date(String(v)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    case "datetime":
      return new Date(String(v)).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    default:
      return String(v);
  }
}

export const isNumericKind = (k: ReportCellKind) => k === "money" || k === "qty" || k === "int" || k === "percent";

export function periodText(t: ReportTable): string {
  if (!t.dated) return `As of ${formatCell(new Date().toISOString(), "datetime")}`;
  const f = formatCell(t.from, "date");
  const to = formatCell(t.to, "date");
  return f === to ? f : `${f} to ${to}`;
}

export function fileStem(t: ReportTable, store: string) {
  // Local calendar dates (the shop's day), not UTC.
  const d = (s: string) => {
    const x = new Date(s);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const safe = (s: string) => s.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, " ");
  return safe(`${store ? store + " - " : ""}${t.title}${t.dated ? ` ${d(t.from)} to ${d(t.to)}` : ` ${d(new Date().toISOString())}`}`);
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Save a file. Returns where it went (desktop) or null (browser download). */
export async function saveFile(name: string, data: ArrayBuffer, mime: string): Promise<string | null> {
  if (isTauri) return api.saveExport(name, toBase64(data));
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return null;
}

// ------------------------------------------------------------ PDF

export async function reportPdf(t: ReportTable, store: string): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const wide = t.columns.length > 6;
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(store || "Next POS", margin, 15);
  doc.setFontSize(12);
  doc.text(t.title, margin, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(periodText(t), margin, 27.5);
  doc.text(`Printed ${formatCell(new Date().toISOString(), "datetime")}`, pageW - margin, 15, { align: "right" });
  doc.setTextColor(0);

  let y = 32;
  if (t.summary.length) {
    // Summary as small boxes in a row (wrapping).
    const boxW = 44;
    const perRow = Math.max(1, Math.floor((pageW - margin * 2) / (boxW + 3)));
    t.summary.forEach((s, i) => {
      const x = margin + (i % perRow) * (boxW + 3);
      const top = y + Math.floor(i / perRow) * 14;
      doc.setDrawColor(210);
      doc.setFillColor(246, 248, 247);
      doc.roundedRect(x, top, boxW, 12, 1.5, 1.5, "FD");
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text(doc.splitTextToSize(s.label, boxW - 4)[0], x + 2, top + 4);
      doc.setFontSize(9.5);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.text(formatCell(s.value, s.kind) || "-", x + 2, top + 9.5);
      doc.setFont("helvetica", "normal");
    });
    y += Math.ceil(t.summary.length / perRow) * 14 + 2;
  }

  const right = Object.fromEntries(t.columns.map((c, i) => [i, { halign: isNumericKind(c.kind) ? "right" : "left" }])) as Record<number, { halign: "right" | "left" }>;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 14 },
    head: [t.columns.map((c) => c.label)],
    body: t.rows.map((r) => r.map((v, i) => formatCell(v, t.columns[i].kind))),
    foot: t.totals.length ? [t.totals.map((v, i) => (v === null ? "" : typeof v === "string" ? v : formatCell(v, t.columns[i].kind)))] : undefined,
    showFoot: "lastPage",
    theme: "striped",
    styles: { font: "helvetica", fontSize: wide ? 7.5 : 8.5, cellPadding: 1.6, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [236, 253, 245], textColor: 20, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: right,
    // Headings and totals line up with their numbers.
    didParseCell: (data) => {
      if (data.section !== "body") data.cell.styles.halign = isNumericKind(t.columns[data.column.index]?.kind) ? "right" : "left";
    },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text(`${t.title} · ${periodText(t)}`, margin, doc.internal.pageSize.getHeight() - 7);
      doc.text(`Page ${n}`, pageW - margin, doc.internal.pageSize.getHeight() - 7, { align: "right" });
      doc.setTextColor(0);
    },
  });
  if (!t.rows.length) {
    doc.setFontSize(10);
    doc.text("Nothing in this period.", margin, y + 14);
  }
  if (t.note) {
    const end = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(doc.splitTextToSize(t.note, pageW - margin * 2), margin, Math.min(end + 6, doc.internal.pageSize.getHeight() - 16));
  }
  return doc.output("arraybuffer");
}

// ------------------------------------------------------------ Excel

const numFmt: Partial<Record<ReportCellKind, string>> = {
  money: '#,##0.00',
  qty: '#,##0.###',
  int: '#,##0',
  percent: '0.0"%"',
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
};

/** The value as Excel should hold it: rupees and units as numbers, dates as dates. */
function excelValue(v: Cell, kind: ReportCellKind): string | number | Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (kind === "money") return v / 100;
    if (kind === "qty") return v / 1000;
    return v;
  }
  if (kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (kind === "datetime") return new Date(v);
  return v;
}

export async function reportXlsx(t: ReportTable, store: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Next POS";
  wb.created = new Date();
  const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[:\\/?*[\]]/g, " "), { views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([store || "Next POS"]).font = { bold: true, size: 14 };
  ws.addRow([t.title]).font = { bold: true, size: 12 };
  ws.addRow([periodText(t)]).font = { color: { argb: "FF666666" } };
  const head = ws.addRow(t.columns.map((c) => c.label));
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
    c.alignment = { vertical: "middle" };
  });
  for (const r of t.rows) ws.addRow(r.map((v, i) => excelValue(v, t.columns[i].kind)));
  if (t.totals.length) {
    const tr = ws.addRow(t.totals.map((v, i) => (typeof v === "string" ? v : excelValue(v, t.columns[i].kind))));
    tr.eachCell((c) => {
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
      c.border = { top: { style: "thin", color: { argb: "FF059669" } } };
    });
  }
  t.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (numFmt[c.kind]) col.numFmt = numFmt[c.kind]!;
    if (isNumericKind(c.kind)) col.alignment = { horizontal: "right" };
    let w = c.label.length;
    for (const r of t.rows.slice(0, 500)) w = Math.max(w, formatCell(r[i], c.kind).length);
    col.width = Math.min(Math.max(w + 2, 8), 60);
  });
  // The title rows keep their own look.
  for (let r = 1; r <= 3; r++) ws.getRow(r).eachCell((c) => (c.numFmt = "General"));
  if (t.summary.length) {
    ws.addRow([]);
    ws.addRow(["Summary"]).font = { bold: true };
    for (const s of t.summary) {
      const row = ws.addRow([s.label, excelValue(s.value, s.kind)]);
      const cell = row.getCell(2);
      if (numFmt[s.kind]) cell.numFmt = numFmt[s.kind]!;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
    }
  }
  if (t.note) {
    ws.addRow([]);
    ws.addRow([t.note]).font = { italic: true, color: { argb: "FF666666" } };
  }
  return wb.xlsx.writeBuffer();
}

/** Plain CSV of a report (product lists are imported back from this layout too). */
export function reportCsv(header: string[], rows: (string | number | null)[][]): ArrayBuffer {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

// ------------------------------------------------------------ products (export that imports back)

export const PRODUCT_COLUMNS = ["sku", "name", "name_ur", "category", "brand", "unit", "barcode", "retail_price", "wholesale_price", "low_stock_alert", "type", "stock", "avg_cost"];

/** Product list in the import layout (stock and avg_cost are for reading only). */
export async function productRows(): Promise<(string | number | null)[][]> {
  const t = await api.report("list_products", new Date().toISOString(), new Date().toISOString());
  const k = (key: string) => t.columns.findIndex((c) => c.key === key);
  const nameUr = new Map<string, string | null>();
  try {
    for (const p of await api.searchProducts("", 500)) nameUr.set(p.sku, p.name_ur);
  } catch {
    /* Urdu names are optional */
  }
  return t.rows.map((r) => {
    const n = (key: string) => (typeof r[k(key)] === "number" ? (r[k(key)] as number) : null);
    return [
      r[k("sku")],
      r[k("name")],
      nameUr.get(String(r[k("sku")])) ?? "",
      r[k("category")],
      r[k("brand")],
      r[k("unit")],
      r[k("barcode")],
      n("price") !== null ? n("price")! / 100 : null,
      n("wholesale") !== null ? n("wholesale")! / 100 : null,
      n("alert") ? n("alert")! / 1000 : null,
      r[k("type")] === "Service" ? "service" : "product",
      n("stock") !== null ? n("stock")! / 1000 : null,
      n("cost") !== null ? n("cost")! / 100 : null,
    ];
  });
}

export async function productsXlsx(rows: (string | number | null)[][]): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  const head = ws.addRow(PRODUCT_COLUMNS);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  });
  for (const r of rows) ws.addRow(r.map((v, i) => (i === 6 && v !== null ? String(v) : v)));
  const widths = [16, 36, 24, 16, 16, 8, 16, 12, 14, 14, 10, 10, 10];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(7).numFmt = "@";
  [8, 9, 13].forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));
  return wb.xlsx.writeBuffer();
}

// ------------------------------------------------------------ stock count sheet (count on paper, then type in)

export interface CountSheetItem {
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
}

export interface CountSheetInfo {
  store: string;
  /** The open count's number, if one is open. */
  doc: string | null;
}

const SHEET_HEAD = ["#", "Product", "SKU", "Barcode", "Unit", "Counted", "Note"];

function sheetSubtitle(info: CountSheetInfo) {
  return `${info.doc ? `Count ${info.doc} · ` : ""}Printed ${formatCell(new Date().toISOString(), "datetime")}`;
}

/** Printable sheet in the same order as the Stock count screen, with empty boxes to write in. */
export async function countSheetPdf(items: CountSheetItem[], info: CountSheetInfo): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(info.store || "Next POS", margin, 15);
  doc.setFontSize(12);
  doc.text("Stock count sheet", margin, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(sheetSubtitle(info), margin, 27.5);
  doc.setTextColor(0);
  doc.setFontSize(9.5);
  doc.text("Counted by: ______________________", margin, 35);
  doc.text("Date: ______________", pageW - margin, 35, { align: "right" });

  autoTable(doc, {
    startY: 40,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [SHEET_HEAD],
    body: items.map((it, i) => [String(i + 1), it.name, it.sku, it.barcode || "", it.unit, "", ""]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, minCellHeight: 8.5, valign: "middle", lineColor: [190, 190, 190], lineWidth: 0.2 },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 9, halign: "right" },
      2: { cellWidth: 31 },
      3: { cellWidth: 28 },
      4: { cellWidth: 12 },
      5: { cellWidth: 24 },
      6: { cellWidth: 22 },
    },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text(`Stock count sheet · ${info.store || "Next POS"}`, margin, pageH - 7);
      doc.text(`Page ${n}`, pageW - margin, pageH - 7, { align: "right" });
      doc.setTextColor(0);
    },
  });
  if (!items.length) {
    doc.setFontSize(10);
    doc.text("No products to count.", margin, 54);
  }
  return doc.output("arraybuffer");
}

/** The same sheet in Excel (print it, or fill the Counted column on a laptop). */
export async function countSheetXlsx(items: CountSheetItem[], info: CountSheetInfo): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Next POS";
  wb.created = new Date();
  const ws = wb.addWorksheet("Count sheet", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:5" },
  });
  ws.addRow([info.store || "Next POS"]).font = { bold: true, size: 14 };
  ws.addRow(["Stock count sheet"]).font = { bold: true, size: 12 };
  ws.addRow([sheetSubtitle(info)]).font = { color: { argb: "FF666666" } };
  ws.addRow(["Counted by:", "", "", "Date:"]).font = { bold: true };
  const head = ws.addRow(SHEET_HEAD);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  });
  const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
  items.forEach((it, i) => {
    const row = ws.addRow([i + 1, it.name, it.sku, it.barcode || "", it.unit, null, null]);
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: thin, bottom: thin, left: thin, right: thin };
      c.alignment = { vertical: "middle" };
    });
  });
  [6, 34, 16, 18, 8, 14, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(4).numFmt = "@";
  ws.getColumn(6).numFmt = "#,##0.###";
  return wb.xlsx.writeBuffer();
}
