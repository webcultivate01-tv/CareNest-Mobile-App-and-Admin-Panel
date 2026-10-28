import { clinicTime } from "../config/booking.js";
import { findAdminById } from "../model/adminModel.js";
import {
  REPORT_CONTENT_TYPES,
  buildReportExcel,
  buildReportPdf,
  reportFileName,
} from "../config/reportFiles.js";
import { MAX_REPORT_ROWS, PREVIEW_ROWS, REPORT_FORMATS } from "../config/reports.js";
import { REPORT_KEYS, getFilterOptions, getReport, runReport } from "../model/reportModel.js";
import { appointmentStatuses } from "../model/appointmentModel.js";
import { refundStatuses, refundTypes } from "../model/refundModel.js";

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

// ---- filter parsing ---------------------------------------------------------------------------

const APPOINTMENT_PAYMENT_STATUSES = ["pending", "paid", "failed", "partially_refunded", "refunded"];
const PAYMENT_TXN_STATUSES = ["captured", "pending", "failed", "partially_refunded", "refunded"];

const oneOf = (value, allowed) => (allowed.includes(value) ? value : "");

// the clinic day after `dateStr` (YYYY-MM-DD), stepped in UTC so it never lands on a DST seam
const nextClinicDay = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

// An ISO instant, or a plain YYYY-MM-DD from a date picker. A plain date is the clinic's own day,
// not the server's: appointments are TIMESTAMPTZ, so reading "2026-02-01" as the server's midnight
// would shift the whole range by the host's offset and quietly drop the clinic's early hours on a
// UTC server. clinicTime() turns a clinic wall-clock date into the right instant (see
// config/booking.js, which the booking rules use for exactly the same reason).
//
// Anything unparseable is dropped rather than silently becoming 1970, which would widen the report
// instead of surfacing the mistake.
const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // "to 5 Feb" has to include all of the 5th: take the next day's midnight, less a millisecond
    const instant = endOfDay
      ? new Date(clinicTime(nextClinicDay(value), 0).getTime() - 1)
      : clinicTime(value, 0);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseAmount = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

// Only the filters a report actually declares are read, so a filter left over in the browser's
// state (or hand-written onto the URL) can never quietly narrow a different report's numbers.
export const parseReportFilters = (report, query, options) => {
  const wanted = new Set(report.filters);
  const filters = {};

  if (wanted.has("dateRange")) {
    filters.dateFrom = parseDate(query.dateFrom, false);
    filters.dateTo = parseDate(query.dateTo, true);
  }
  if (wanted.has("search")) filters.search = String(query.search || "").trim().slice(0, 120);
  if (wanted.has("status")) filters.status = oneOf(query.status, appointmentStatuses);
  if (wanted.has("paymentStatus")) filters.paymentStatus = oneOf(query.paymentStatus, APPOINTMENT_PAYMENT_STATUSES);
  if (wanted.has("paymentTxnStatus")) filters.paymentTxnStatus = oneOf(query.paymentTxnStatus, PAYMENT_TXN_STATUSES);
  if (wanted.has("method")) filters.method = oneOf(query.method, options.methods);
  if (wanted.has("specialty")) filters.specialty = oneOf(query.specialty, options.specialties);
  if (wanted.has("doctorStatus")) filters.doctorStatus = oneOf(query.doctorStatus, ["active", "inactive"]);
  if (wanted.has("consent")) filters.consent = oneOf(query.consent, ["yes", "no"]);
  if (wanted.has("refundStatus")) filters.refundStatus = oneOf(query.refundStatus, refundStatuses);
  if (wanted.has("refundType")) filters.refundType = oneOf(query.refundType, refundTypes);
  if (wanted.has("amountRange")) {
    filters.minAmount = parseAmount(query.minAmount);
    filters.maxAmount = parseAmount(query.maxAmount);
  }
  if (wanted.has("doctor")) {
    const doctor = options.doctors.find((d) => String(d.id) === String(query.doctorId));
    filters.doctorId = doctor ? doctor.id : null;
    // only used for the "Doctor: Dr Amit" line printed on the file
    if (doctor) filters.doctorName = doctor.name;
  }

  // a backwards range returns nothing and looks like a bug, so swap it instead
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
  }
  return filters;
};

// what the card grid and the filter panel are built from
export const getReportTypes = async (req, res) => {
  try {
    const options = await getFilterOptions();
    const reports = REPORT_KEYS.map((key) => {
      const report = getReport(key);
      return {
        key: report.key,
        title: report.title,
        description: report.description,
        dateLabel: report.dateLabel,
        searchPlaceholder: report.searchPlaceholder,
        filters: report.filters,
        columns: report.columns.map(({ key: columnKey, header, type }) => ({ key: columnKey, header, type })),
      };
    });
    return res.status(200).json({ reports, options, formats: REPORT_FORMATS, maxRows: MAX_REPORT_ROWS });
  } catch (error) {
    return sendError(res, "GetReportTypes", error);
  }
};

// The on-screen preview: the same rows and totals the file will contain, just the first few of
// them - so nobody downloads a file to find out their filters matched nothing.
export const previewReport = async (req, res) => {
  try {
    const report = getReport(req.params.reportKey);
    if (!report) {
      return res.status(404).json({ message: "Unknown report" });
    }
    const options = await getFilterOptions();
    const filters = parseReportFilters(report, req.query, options);
    const { rows, total, summary } = await runReport(report.key, filters, PREVIEW_ROWS);
    return res.status(200).json({
      key: report.key,
      columns: report.columns.map(({ key, header, type }) => ({ key, header, type })),
      rows,
      total,
      summary,
      previewRows: PREVIEW_ROWS,
      maxRows: MAX_REPORT_ROWS,
    });
  } catch (error) {
    return sendError(res, "PreviewReport", error);
  }
};

export const generateReport = async (req, res) => {
  try {
    const report = getReport(req.params.reportKey);
    if (!report) {
      return res.status(404).json({ message: "Unknown report" });
    }
    const format = String(req.query.format || "").toLowerCase();
    if (!REPORT_FORMATS.includes(format)) {
      return res.status(400).json({ message: "Choose either PDF or Excel" });
    }

    const options = await getFilterOptions();
    const filters = parseReportFilters(report, req.query, options);
    const { rows, total, summary } = await runReport(report.key, filters, MAX_REPORT_ROWS);

    // stamped on the file so a printed page can be traced back to who ran it
    const admin = await findAdminById(req.adminId);
    const generatedBy = admin ? `${admin.name} (${admin.code || admin.role})` : "CareNest Admin";
    const payload = { report, rows, total, summary, filters, generatedBy };

    const file = format === "excel" ? await buildReportExcel(payload) : await buildReportPdf(payload);
    const name = reportFileName(report, format);

    res.set("Content-Type", REPORT_CONTENT_TYPES[format]);
    res.set("Content-Disposition", `attachment; filename="${name}"`);
    res.set("Content-Length", String(file.length));
    // the row counts let the panel confirm what was downloaded without reopening the file
    res.set("X-Report-Rows", String(rows.length));
    res.set("X-Report-Total", String(total));
    res.set("Access-Control-Expose-Headers", "Content-Disposition, X-Report-Rows, X-Report-Total");
    return res.status(200).send(file);
  } catch (error) {
    return sendError(res, "GenerateReport", error);
  }
};
