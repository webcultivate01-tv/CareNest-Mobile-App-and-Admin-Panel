// The report catalogue: one entry per card on the Reports page.
//
// Everything here is pure metadata + formatting (no database, no file writing), so it is the one
// place that answers "what does this report contain?". Three very different consumers read it:
//
//   * model/reportModel.js  - turns a definition's `sql` into the actual rows
//   * config/reportFiles.js - renders those rows as a PDF table or an Excel sheet
//   * the Reports page      - draws the cards and the matching filter controls
//
// Adding a report therefore means adding one entry here plus its SQL in reportModel.js; the cards,
// the filter panel, the PDF and the Excel sheet all follow on their own.

const clinicZone = () => process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

export const REPORT_FORMATS = ["pdf", "excel"];

// A report is a snapshot of real data, so a huge range must not be able to exhaust the server's
// memory. Rows beyond this are dropped and the file says so on its own first page / sheet.
export const MAX_REPORT_ROWS = 20000;

// how many rows the Reports page shows before the file is generated
export const PREVIEW_ROWS = 20;

// ---- value formatting ----

// Excel is UTF-8 and shows the rupee sign happily. A PDF built with pdfkit's standard fonts can
// not: they are WinAnsi-encoded and have no U+20B9 glyph, so a "₹" would measure 0pt wide and
// print as nothing at all. PDFs therefore say "Rs." - never drop this for a "₹".
export const PDF_CURRENCY = "Rs.";
export const EXCEL_MONEY_FORMAT = '"\u20B9"#,##0.00';
export const EXCEL_INT_FORMAT = "#,##0";

const amount = (value) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoneyForPdf = (value) => `${PDF_CURRENCY} ${amount(value)}`;

// "24 Oct 2026, 10:00 am" in the clinic's timezone - the same wall clock the panel shows, never
// the server's. (The database stores TIMESTAMPTZ, so the raw value is an instant, not a local time.)
export const formatDateTime = (value) => {
  if (!value) return "-";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: clinicZone(),
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value])
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}`;
};

export const formatDate = (value) => {
  if (!value) return "-";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", { timeZone: clinicZone(), day: "2-digit", month: "short", year: "numeric" })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value])
  );
  return `${parts.day} ${parts.month} ${parts.year}`;
};

// "partially_refunded" -> "Partially Refunded"
export const formatStatus = (value) =>
  value ? String(value).split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "-";

// Per-type defaults: how a column is aligned, how wide its Excel column is, and which Excel number
// format it carries. `pdfWidth` is a *relative* weight - reportFiles.js scales the weights of the
// columns it is printing to the width of the page.
export const COLUMN_TYPES = {
  text: { align: "left", excelWidth: 20, pdfWidth: 2 },
  code: { align: "left", excelWidth: 14, pdfWidth: 1.3 },
  int: { align: "right", excelWidth: 12, pdfWidth: 1, numFmt: EXCEL_INT_FORMAT },
  money: { align: "right", excelWidth: 16, pdfWidth: 1.5, numFmt: EXCEL_MONEY_FORMAT },
  datetime: { align: "left", excelWidth: 24, pdfWidth: 2.1 },
  date: { align: "left", excelWidth: 15, pdfWidth: 1.4 },
  status: { align: "left", excelWidth: 18, pdfWidth: 1.4 },
  bool: { align: "left", excelWidth: 12, pdfWidth: 1 },
};

const typeOf = (column) => COLUMN_TYPES[column.type] || COLUMN_TYPES.text;

export const columnAlign = (column) => typeOf(column).align;
export const columnPdfWidth = (column) => column.pdfWidth ?? typeOf(column).pdfWidth;
export const columnExcelWidth = (column) => column.excelWidth ?? typeOf(column).excelWidth;
export const columnNumFmt = (column) => typeOf(column).numFmt;

// the text a PDF cell prints
export const cellText = (column, value) => {
  if (column.type === "money") return formatMoneyForPdf(value);
  if (column.type === "int") return Number(value || 0).toLocaleString("en-IN");
  if (column.type === "datetime") return formatDateTime(value);
  if (column.type === "date") return formatDate(value);
  if (column.type === "status") return formatStatus(value);
  if (column.type === "bool") return value ? "Yes" : "No";
  return value === null || value === undefined || value === "" ? "-" : String(value);
};

// the value an Excel cell holds. Money and counts stay real numbers (formatted by numFmt) so the
// recipient can sort, total and chart them in Excel instead of re-typing a formatted string.
export const cellValue = (column, value) => {
  if (column.type === "money") return Number(value || 0);
  if (column.type === "int") return Number(value || 0);
  if (column.type === "datetime") return formatDateTime(value);
  if (column.type === "date") return formatDate(value);
  if (column.type === "status") return formatStatus(value);
  if (column.type === "bool") return value ? "Yes" : "No";
  return value === null || value === undefined ? "" : String(value);
};

// a summary tile's value, for the PDF/Excel header block and the on-screen preview
export const summaryText = (stat) => {
  if (stat.type === "money") return formatMoneyForPdf(stat.value);
  return Number.isFinite(stat.value) ? Number(stat.value).toLocaleString("en-IN") : String(stat.value ?? "-");
};

// Columns marked `pdf: false` are left out of the PDF only. The PDF is the version people read and
// print, so the widest, least-scannable fields (long ids, emails, notes) stay in the Excel file
// where there is room for them instead of squeezing every other column.
export const pdfColumns = (report) => report.columns.filter((c) => c.pdf !== false);
export const excelColumns = (report) => report.columns;
