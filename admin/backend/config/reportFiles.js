import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import {
  EXCEL_INT_FORMAT,
  EXCEL_MONEY_FORMAT,
  MAX_REPORT_ROWS,
  cellText,
  cellValue,
  columnAlign,
  columnExcelWidth,
  columnNumFmt,
  columnPdfWidth,
  excelColumns,
  formatDateTime,
  pdfColumns,
  summaryText,
} from "./reports.js";

// Turns a report's rows into a file the recipient can actually use:
//
//   PDF   - a paginated, printable table. Read-only by nature, so it is the version that gets
//           shared and filed.
//   Excel - a real .xlsx workbook where money and counts are numbers with a rupee/number format,
//           so the recipient can sort, filter and total them. Deliberately NOT CSV: a CSV loses
//           every number format, mangles leading-zero ids and has no second sheet for the filters.
//
// Both files carry the same header block (who generated it, when, over which filters) so a printed
// page or a forwarded workbook can always be traced back to the query that produced it.

const BRAND = "#059669"; // emerald-600, the panel's accent
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const ZEBRA = "#f9fafb";

// ---- shared header text ----------------------------------------------------------------------

// The filter lines printed on the file. A report is a legal-ish record of "what the data said" -
// without the filters written on it, a page of 40 rows is unreadable six months later.
export const describeFilters = (report, filters) => {
  const lines = [];
  const range =
    filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom ? formatDateTime(filters.dateFrom) : "the beginning"} to ${
          filters.dateTo ? formatDateTime(filters.dateTo) : "now"
        }`
      : "All time";
  lines.push([report.dateLabel || "Date range", range]);

  const labels = {
    search: "Search",
    status: "Appointment status",
    paymentStatus: "Payment state",
    paymentTxnStatus: "Transaction status",
    method: "Payment method",
    specialty: "Specialty",
    doctorStatus: "Doctor status",
    consent: "Marketing consent",
    refundStatus: "Refund status",
    refundType: "Refund type",
    doctorName: "Doctor",
  };
  for (const [key, label] of Object.entries(labels)) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== "") lines.push([label, String(value)]);
  }
  if (filters.minAmount != null) lines.push(["Minimum amount", `Rs. ${Number(filters.minAmount).toFixed(2)}`]);
  if (filters.maxAmount != null) lines.push(["Maximum amount", `Rs. ${Number(filters.maxAmount).toFixed(2)}`]);
  return lines;
};

// shown when a range matched more rows than a single file is allowed to carry
export const truncationNote = (total) =>
  total > MAX_REPORT_ROWS
    ? `Showing the first ${MAX_REPORT_ROWS.toLocaleString("en-IN")} of ${total.toLocaleString(
        "en-IN"
      )} matching rows. Narrow the date range or filters to get the rest.`
    : "";

export const reportFileName = (report, format) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `carenest-${report.key}-report-${stamp}.${format === "excel" ? "xlsx" : "pdf"}`;
};

// ---- PDF ---------------------------------------------------------------------------------------

const PAGE_MARGIN = 30;
const HEADER_FONT_SIZE = 7.5;
const BODY_FONT_SIZE = 7.5;
const MAX_CELL_LINES = 3; // a wrapped cell past this is ellipsised rather than pushing the row tall

export const buildReportPdf = ({ report, rows, total, summary, filters, generatedBy }) =>
  new Promise((resolve, reject) => {
    const columns = pdfColumns(report);
    // bufferPages lets the "Page 1 of 7" footer be stamped at the end, once the count is known
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const contentWidth = right - left;
    const bottom = doc.page.height - PAGE_MARGIN - 18; // leave room for the footer

    // relative column weights -> actual point widths that fill the page exactly
    const weights = columns.map((c) => columnPdfWidth(c));
    const weightTotal = weights.reduce((sum, w) => sum + w, 0);
    const widths = weights.map((w) => (w / weightTotal) * contentWidth);
    const xs = widths.reduce((acc, w, i) => [...acc, acc[i] + w], [left]);

    const cellPadding = 3;
    const textWidth = (i) => widths[i] - cellPadding * 2;

    // ---- cover block (first page only) ----
    doc.font("Helvetica-Bold").fillColor(BRAND).fontSize(16).text("CareNest", left, PAGE_MARGIN);
    doc.font("Helvetica-Bold").fillColor(INK).fontSize(14).text(report.title, left, doc.y + 2);
    doc.font("Helvetica").fillColor(MUTED).fontSize(8.5).text(report.description, left, doc.y + 2, { width: contentWidth });

    doc.moveDown(0.6);
    doc.fontSize(8).fillColor(MUTED);
    doc.text(`Generated on ${formatDateTime(new Date())} by ${generatedBy}`, left, doc.y);
    // one plain line per filter - no pdfkit `continued` run to get out of step with the cursor
    doc.font("Helvetica").fillColor(MUTED);
    for (const [label, value] of describeFilters(report, filters)) {
      doc.text(`${label}: ${value}`, left, doc.y, { width: contentWidth });
    }

    // ---- summary tiles ----
    if (summary.length) {
      const top = doc.y + 8;
      const tileWidth = contentWidth / summary.length;
      const tileHeight = 32;
      doc.roundedRect(left, top, contentWidth, tileHeight, 3).fillAndStroke("#f0fdf4", LINE);
      summary.forEach((stat, index) => {
        const x = left + index * tileWidth;
        if (index > 0) doc.moveTo(x, top + 5).lineTo(x, top + tileHeight - 5).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.font("Helvetica").fillColor(MUTED).fontSize(6.5).text(stat.label.toUpperCase(), x + 6, top + 6, {
          width: tileWidth - 12,
        });
        doc.font("Helvetica-Bold").fillColor(INK).fontSize(10).text(summaryText(stat), x + 6, top + 16, {
          width: tileWidth - 12,
          lineBreak: false,
        });
      });
      doc.y = top + tileHeight + 8;
    }

    const note = truncationNote(total);
    if (note) {
      doc.font("Helvetica-Oblique").fillColor("#b45309").fontSize(7.5).text(note, left, doc.y, { width: contentWidth });
      doc.y += 4;
    }

    // ---- table ----
    const drawHeaderRow = () => {
      const top = doc.y;
      const height =
        Math.max(
          ...columns.map((c, i) =>
            doc.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE).heightOfString(c.header, { width: textWidth(i) })
          )
        ) + cellPadding * 2;
      doc.rect(left, top, contentWidth, height).fill(BRAND);
      doc.font("Helvetica-Bold").fillColor("#ffffff").fontSize(HEADER_FONT_SIZE);
      columns.forEach((column, i) => {
        doc.text(column.header, xs[i] + cellPadding, top + cellPadding, {
          width: textWidth(i),
          align: columnAlign(column),
        });
      });
      doc.y = top + height;
      return height;
    };

    const rowHeightOf = (texts) => {
      doc.font("Helvetica").fontSize(BODY_FONT_SIZE);
      const lineHeight = doc.currentLineHeight();
      const tallest = Math.max(
        ...texts.map((text, i) => Math.min(doc.heightOfString(text, { width: textWidth(i) }), lineHeight * MAX_CELL_LINES))
      );
      return Math.max(tallest, lineHeight) + cellPadding * 2;
    };

    drawHeaderRow();

    if (rows.length === 0) {
      doc.font("Helvetica-Oblique").fillColor(MUTED).fontSize(9).text("No records match these filters.", left, doc.y + 10, {
        width: contentWidth,
        align: "center",
      });
    }

    rows.forEach((row, rowIndex) => {
      const texts = columns.map((column) => cellText(column, row[column.key]));
      const height = rowHeightOf(texts);

      if (doc.y + height > bottom) {
        doc.addPage();
        doc.y = PAGE_MARGIN;
        drawHeaderRow();
      }

      const top = doc.y;
      if (rowIndex % 2 === 1) doc.rect(left, top, contentWidth, height).fill(ZEBRA);
      doc.font("Helvetica").fillColor(INK).fontSize(BODY_FONT_SIZE);
      columns.forEach((column, i) => {
        doc.text(texts[i], xs[i] + cellPadding, top + cellPadding, {
          width: textWidth(i),
          height: height - cellPadding * 2,
          align: columnAlign(column),
          ellipsis: true,
        });
      });
      doc
        .moveTo(left, top + height)
        .lineTo(right, top + height)
        .strokeColor(LINE)
        .lineWidth(0.4)
        .stroke();
      doc.y = top + height;
    });

    // ---- footer on every page (the page count is only known now) ----
    // The footer deliberately sits in the bottom margin, and pdfkit starts a brand new page
    // whenever text would cross that margin - which would add a blank page per footer. Dropping
    // the bottom margin to 0 for the duration of the stamping is the documented way around it.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const marginBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font("Helvetica")
        .fillColor(MUTED)
        .fontSize(7)
        .text(
          `CareNest ${report.title} - ${rows.length.toLocaleString("en-IN")} row(s) - Page ${i + 1} of ${range.count}`,
          left,
          doc.page.height - PAGE_MARGIN - 8,
          { width: contentWidth, align: "center", lineBreak: false }
        );
      doc.page.margins.bottom = marginBottom;
    }

    doc.end();
  });

// ---- Excel -------------------------------------------------------------------------------------

export const buildReportExcel = async ({ report, rows, total, summary, filters, generatedBy }) => {
  const columns = excelColumns(report);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CareNest Admin";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(report.title.slice(0, 31), {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // widths come from the column definitions, so an email column is wide and a count column is not
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = columnExcelWidth(column);
  });

  const lastColumn = columns.length;
  const titleRow = sheet.addRow([report.title]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, lastColumn);
  titleRow.getCell(1).font = { size: 15, bold: true, color: { argb: "FF065F46" } };
  titleRow.height = 22;

  const subtitleRow = sheet.addRow([report.description]);
  sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, lastColumn);
  subtitleRow.getCell(1).font = { size: 10, color: { argb: "FF6B7280" } };

  const metaRow = sheet.addRow([`Generated on ${formatDateTime(new Date())} by ${generatedBy}`]);
  sheet.mergeCells(metaRow.number, 1, metaRow.number, lastColumn);
  metaRow.getCell(1).font = { size: 9, color: { argb: "FF6B7280" } };

  const note = truncationNote(total);
  if (note) {
    const noteRow = sheet.addRow([note]);
    sheet.mergeCells(noteRow.number, 1, noteRow.number, lastColumn);
    noteRow.getCell(1).font = { size: 9, bold: true, color: { argb: "FFB45309" } };
  }

  sheet.addRow([]);

  // summary tiles become a label row + a value row, so the numbers stay numbers
  if (summary.length) {
    const labelRow = sheet.addRow(summary.map((stat) => stat.label));
    labelRow.eachCell((cell) => {
      cell.font = { size: 9, bold: true, color: { argb: "FF6B7280" } };
    });
    const valueRow = sheet.addRow(summary.map((stat) => stat.value));
    valueRow.eachCell((cell, index) => {
      cell.font = { size: 12, bold: true };
      cell.numFmt = summary[index - 1].type === "money" ? EXCEL_MONEY_FORMAT : EXCEL_INT_FORMAT;
    });
    sheet.addRow([]);
  }

  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
  headerRow.height = 24;

  for (const row of rows) {
    const added = sheet.addRow(columns.map((column) => cellValue(column, row[column.key])));
    added.eachCell((cell, index) => {
      const column = columns[index - 1];
      const numFmt = columnNumFmt(column);
      if (numFmt) cell.numFmt = numFmt;
      cell.alignment = { horizontal: columnAlign(column), vertical: "top", wrapText: column.type === "text" };
      cell.font = { size: 10 };
    });
  }

  // the header row stays visible while scrolling, and Excel's own filter dropdowns sit on it
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  if (rows.length) {
    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number + rows.length, column: lastColumn },
    };
  }

  // the exact query behind the numbers, on its own sheet so the data sheet stays a clean table
  const filterSheet = workbook.addWorksheet("Filters");
  filterSheet.getColumn(1).width = 28;
  filterSheet.getColumn(2).width = 60;
  const heading = filterSheet.addRow(["Filter", "Value"]);
  heading.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  });
  for (const [label, value] of describeFilters(report, filters)) filterSheet.addRow([label, value]);
  filterSheet.addRow(["Matching rows", total]);
  filterSheet.addRow(["Rows in this file", rows.length]);
  filterSheet.addRow(["Generated on", formatDateTime(new Date())]);
  filterSheet.addRow(["Generated by", generatedBy]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const REPORT_CONTENT_TYPES = {
  pdf: "application/pdf",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
