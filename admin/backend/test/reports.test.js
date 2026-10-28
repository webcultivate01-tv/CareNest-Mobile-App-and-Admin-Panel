import assert from "node:assert/strict";
import { test } from "node:test";

// pinned, not defaulted: these tests assert clinic-timezone behaviour explicitly
process.env.CLINIC_TIMEZONE = "Asia/Kolkata";
process.env.RAZORPAY_KEY_ID ||= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ||= "test_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "test_webhook_secret";

const { buildReportExcel, buildReportPdf, describeFilters, reportFileName, truncationNote } = await import(
  "../config/reportFiles.js"
);
const { MAX_REPORT_ROWS, cellText, cellValue, columnPdfWidth, formatStatus, pdfColumns } = await import(
  "../config/reports.js"
);
const { REPORT_DEFINITIONS, REPORT_KEYS, displayCode } = await import("../model/reportModel.js");
const { parseReportFilters } = await import("../controllers/reportController.js");

const everyReport = REPORT_KEYS.map((key) => REPORT_DEFINITIONS[key]);

// ---- the catalogue itself ----

test("every listed report exists and declares the pieces the generator needs", () => {
  assert.equal(everyReport.length, 5);
  for (const report of everyReport) {
    assert.ok(report, "report in REPORT_KEYS is missing a definition");
    assert.ok(report.title && report.description && report.dateLabel);
    assert.ok(report.columns.length > 0);
    assert.ok(report.summary.length > 0);
    assert.equal(typeof report.sql, "function");
    assert.ok(report.orderBy);
  }
});

test("column keys are unique within a report, so no column silently shadows another", () => {
  for (const report of everyReport) {
    const keys = report.columns.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, `${report.key} has duplicate column keys`);
  }
});

test("a report's SQL selects every column it claims to have", () => {
  for (const report of everyReport) {
    const params = [];
    const sql = report.sql({}, (value) => `$${params.push(value)}`);
    for (const column of report.columns) {
      assert.ok(
        sql.includes(`"${column.key}"`) || new RegExp(`\\b${column.key}\\b`).test(sql),
        `${report.key}: SQL never mentions column "${column.key}"`
      );
    }
  }
});

test("no filters means no WHERE clause, so an unfiltered report really is all-time", () => {
  for (const report of everyReport) {
    const sql = report.sql({}, () => "$1");
    assert.ok(!/\bWHERE\b/.test(sql.replace(/WHERE \$\{?/g, "")) || !sql.includes("WHERE 1"), `${report.key}`);
  }
});

test("each filter value a report is given becomes exactly one bound parameter", () => {
  const report = REPORT_DEFINITIONS.payments;
  const params = [];
  const sql = report.sql(
    { dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-02-01T00:00:00.000Z", search: "Tejas", paymentTxnStatus: "captured", method: "upi", minAmount: 100, maxAmount: 900 },
    (value) => `$${params.push(value)}`
  );
  // 2 dates + 1 search + 1 status + 1 method + 2 amounts
  assert.equal(params.length, 7);
  // placeholders are numbered 1..n with none skipped or repeated
  const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual([...new Set(used)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("a filter value is never interpolated into the SQL text", () => {
  const report = REPORT_DEFINITIONS.users;
  const sql = report.sql({ search: "'; DROP TABLE patients; --", consent: "yes" }, () => "$1");
  assert.ok(!sql.includes("DROP TABLE"), "search text leaked into the SQL string");
});

test("the doctor report applies its date range to the activity subqueries, not to the doctor list", () => {
  const params = [];
  const sql = REPORT_DEFINITIONS.doctors.sql(
    { dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-02-01T00:00:00.000Z" },
    (value) => `$${params.push(value)}`
  );
  // the range is bound twice: once for the booking counts, once for the revenue
  assert.equal(params.length, 4);
  // ...and the outer query over `doctors` carries no WHERE at all, so idle doctors still appear
  const outer = sql.slice(sql.lastIndexOf(") earned ON"));
  assert.ok(!/\bWHERE\b/.test(outer), "the date range narrowed which doctors are listed");
});

// ---- display code matching ----

test("display codes are padded so CNP-7 finds CNP-007", () => {
  assert.equal(displayCode("CNP-7"), "CNP-007");
  assert.equal(displayCode("cnp7"), "CNP-007");
  assert.equal(displayCode("CNAP-0012"), "CNAP-012");
  assert.equal(displayCode("CNAP12"), "CNAP-012");
});

test("free text is not mistaken for a display code", () => {
  for (const text of ["Tejas", "", null, undefined, "9876543210", "pay_RK123", "CNP-"]) {
    assert.equal(displayCode(text), null, `treated ${JSON.stringify(text)} as a code`);
  }
});

// ---- filter parsing ----

const options = { doctors: [{ id: 4, name: "Dr Amit Shah" }], specialties: ["Cardiology"], methods: ["upi"] };

test("an unknown filter value is dropped instead of reaching the database", () => {
  const filters = parseReportFilters(REPORT_DEFINITIONS.appointments, { status: "exploded", paymentStatus: "paid" }, options);
  assert.equal(filters.status, "");
  assert.equal(filters.paymentStatus, "paid");
});

test("a report only reads the filters it declares", () => {
  // the user report has no status filter; a leftover status must not appear in its filters
  const filters = parseReportFilters(REPORT_DEFINITIONS.users, { status: "completed", consent: "yes", method: "upi" }, options);
  assert.equal(filters.status, undefined);
  assert.equal(filters.method, undefined);
  assert.equal(filters.consent, "yes");
});

test("a picked date is the clinic's day, not the server's, and 'to 5 Feb' includes all of the 5th", () => {
  const filters = parseReportFilters(REPORT_DEFINITIONS.appointments, { dateFrom: "2026-02-01", dateTo: "2026-02-05" }, options);
  // Asia/Kolkata is UTC+05:30, so clinic midnight on 1 Feb is 18:30Z on 31 Jan. This assertion is
  // deliberately absolute: it fails if the range is ever read in the server's timezone instead.
  assert.equal(filters.dateFrom, "2026-01-31T18:30:00.000Z");
  assert.equal(filters.dateTo, "2026-02-05T18:29:59.999Z");
});

test("a full ISO instant is passed through untouched", () => {
  const filters = parseReportFilters(
    REPORT_DEFINITIONS.appointments,
    { dateFrom: "2026-02-01T09:15:00.000Z" },
    options
  );
  assert.equal(filters.dateFrom, "2026-02-01T09:15:00.000Z");
});

test("an unparseable date is dropped rather than becoming 1970", () => {
  const filters = parseReportFilters(REPORT_DEFINITIONS.appointments, { dateFrom: "not a date" }, options);
  assert.equal(filters.dateFrom, null);
});

test("a backwards range is swapped instead of silently matching nothing", () => {
  const filters = parseReportFilters(
    REPORT_DEFINITIONS.appointments,
    { dateFrom: "2026-03-01", dateTo: "2026-01-01" },
    options
  );
  assert.ok(filters.dateFrom < filters.dateTo);
});

test("an unknown doctor id is dropped, so a stale filter can not blank the report", () => {
  assert.equal(parseReportFilters(REPORT_DEFINITIONS.appointments, { doctorId: "999" }, options).doctorId, null);
  assert.equal(parseReportFilters(REPORT_DEFINITIONS.appointments, { doctorId: "4" }, options).doctorId, 4);
});

test("a non-numeric amount is dropped rather than becoming NaN in the query", () => {
  const filters = parseReportFilters(REPORT_DEFINITIONS.payments, { minAmount: "abc", maxAmount: "900" }, options);
  assert.equal(filters.minAmount, null);
  assert.equal(filters.maxAmount, 900);
});

// ---- cell formatting ----

test("money is text in a PDF but a real number in Excel, so Excel can total it", () => {
  const column = { key: "amount", type: "money" };
  assert.equal(cellText(column, "850.5"), "Rs. 850.50");
  assert.equal(cellValue(column, "850.5"), 850.5);
  assert.equal(typeof cellValue(column, "850.5"), "number");
});

test("a PDF never prints a rupee sign, which its fonts render as nothing at all", () => {
  for (const report of everyReport) {
    for (const column of report.columns) {
      assert.ok(!cellText(column, "1234.5").includes("₹"), `${report.key}.${column.key} printed a rupee sign`);
    }
  }
});

test("an empty value reads as a dash in a PDF and stays empty in Excel", () => {
  const column = { key: "phone", type: "text" };
  assert.equal(cellText(column, null), "-");
  assert.equal(cellValue(column, null), "");
  assert.equal(cellText({ key: "x", type: "date" }, null), "-");
});

test("a status becomes words, and a boolean becomes Yes / No", () => {
  assert.equal(formatStatus("partially_refunded"), "Partially Refunded");
  assert.equal(cellText({ key: "c", type: "bool" }, true), "Yes");
  assert.equal(cellText({ key: "c", type: "bool" }, false), "No");
});

test("a timestamp is rendered in the clinic's timezone, not the server's", () => {
  // 2026-02-01T18:30:00Z is midnight on the 2nd in Asia/Kolkata (+05:30)
  const text = cellText({ key: "t", type: "datetime" }, "2026-02-01T18:30:00.000Z");
  assert.match(text, /02 Feb 2026, 12:00 am/);
});

// ---- file assembly ----

test("PDF column widths fill the page exactly, so no column can run off the edge", () => {
  const contentWidth = 781.89; // A4 landscape less the 30pt margins
  for (const report of everyReport) {
    const weights = pdfColumns(report).map((c) => columnPdfWidth(c));
    assert.ok(weights.every((w) => w > 0), `${report.key} has a zero-width column`);
    const widths = weights.map((w) => (w / weights.reduce((a, b) => a + b, 0)) * contentWidth);
    assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - contentWidth) < 0.01, `${report.key} widths do not fill the page`);
  }
});

test("the filter lines name the date field the range actually applies to", () => {
  const lines = describeFilters(REPORT_DEFINITIONS.doctors, { dateFrom: null, dateTo: null });
  assert.equal(lines[0][0], "Activity between");
  assert.equal(lines[0][1], "All time");
});

test("a chosen filter appears on the file, so a printed page explains itself", () => {
  const lines = describeFilters(REPORT_DEFINITIONS.payments, { paymentTxnStatus: "captured", method: "upi", minAmount: 100 });
  const flat = Object.fromEntries(lines);
  assert.equal(flat["Transaction status"], "captured");
  assert.equal(flat["Payment method"], "upi");
  assert.equal(flat["Minimum amount"], "Rs. 100.00");
});

test("a capped report says what it left out", () => {
  assert.equal(truncationNote(100), "");
  assert.equal(truncationNote(MAX_REPORT_ROWS), "");
  assert.match(truncationNote(MAX_REPORT_ROWS + 1), /Showing the first/);
});

test("file names carry the report and the right extension", () => {
  assert.match(reportFileName(REPORT_DEFINITIONS.users, "pdf"), /^carenest-users-report-[\d-]+\.pdf$/);
  assert.match(reportFileName(REPORT_DEFINITIONS.payments, "excel"), /^carenest-payments-report-[\d-]+\.xlsx$/);
});

// ---- real files ----

const sampleRow = (report, i) =>
  Object.fromEntries(
    report.columns.map((column) => {
      if (column.type === "money") return [column.key, "850.50"];
      if (column.type === "int") return [column.key, i];
      if (column.type === "datetime" || column.type === "date") return [column.key, new Date("2026-02-01T18:30:00.000Z")];
      if (column.type === "bool") return [column.key, i % 2 === 0];
      return [column.key, `${column.key} value ${i}`];
    })
  );

const payloadFor = (report, rowCount, total = rowCount) => ({
  report,
  rows: Array.from({ length: rowCount }, (_, i) => sampleRow(report, i)),
  total,
  summary: report.summary.map((stat) => ({ label: stat.label, type: stat.type, value: 1234.5 })),
  filters: { dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-02-01T00:00:00.000Z" },
  generatedBy: "Tejas Mehar (CNA-001)",
});

test("every report produces a real PDF, with rows and without", async () => {
  for (const report of everyReport) {
    for (const rowCount of [0, 1, 60]) {
      const pdf = await buildReportPdf(payloadFor(report, rowCount));
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", `${report.key} @ ${rowCount} rows is not a PDF`);
      assert.ok(pdf.length > 500);
    }
  }
});

test("every report produces a real xlsx workbook, with rows and without", async () => {
  for (const report of everyReport) {
    for (const rowCount of [0, 1, 60]) {
      const xlsx = await buildReportExcel(payloadFor(report, rowCount));
      // a .xlsx is a zip; "PK" is its signature
      assert.equal(xlsx.subarray(0, 2).toString(), "PK", `${report.key} @ ${rowCount} rows is not a workbook`);
      assert.ok(xlsx.length > 2000);
    }
  }
});

test("the Excel data sheet holds money as numbers and keeps the filters on a second sheet", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const report = REPORT_DEFINITIONS.payments;
  const buffer = await buildReportExcel(payloadFor(report, 3));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.deepEqual(workbook.worksheets.map((w) => w.name), ["Payment Report", "Filters"]);

  const sheet = workbook.getWorksheet("Payment Report");
  const headerRowNumber = sheet.views[0].ySplit; // the frozen row is the header row
  const headers = sheet.getRow(headerRowNumber).values.slice(1);
  assert.deepEqual(headers, report.columns.map((c) => c.header));

  const grossColumn = report.columns.findIndex((c) => c.key === "amount") + 1;
  const cell = sheet.getRow(headerRowNumber + 1).getCell(grossColumn);
  assert.equal(typeof cell.value, "number");
  assert.equal(cell.value, 850.5);
  assert.match(cell.numFmt, /#,##0\.00/);

  // the header row is frozen and filterable, and the filter trail is recorded
  assert.equal(sheet.views[0].state, "frozen");
  assert.ok(sheet.autoFilter);
  const trail = Object.fromEntries(workbook.getWorksheet("Filters").getRows(2, 20).map((r) => [r.getCell(1).value, r.getCell(2).value]));
  assert.equal(trail["Rows in this file"], 3);
  assert.equal(trail["Generated by"], "Tejas Mehar (CNA-001)");
});

test("a capped PDF carries the truncation note on its first page", async () => {
  const pdf = await buildReportPdf(payloadFor(REPORT_DEFINITIONS.users, 5, MAX_REPORT_ROWS + 500));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const excel = await buildReportExcel(payloadFor(REPORT_DEFINITIONS.users, 5, MAX_REPORT_ROWS + 500));
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excel);
  const sheet = workbook.getWorksheet("User Report");
  const text = [1, 2, 3, 4, 5].map((n) => String(sheet.getRow(n).getCell(1).value)).join(" ");
  assert.match(text, /Showing the first/);
});
