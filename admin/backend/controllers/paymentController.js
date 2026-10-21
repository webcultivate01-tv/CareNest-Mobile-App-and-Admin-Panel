import { photoUrl } from "../config/photos.js";
import { razorpay } from "../config/razorpay.js";
import { findPatientById } from "../model/patientModel.js";
import {
  applyPaymentCaptured,
  applyPaymentFailed,
  applyRefund,
  findExportRows,
  findPaymentById,
  findPaymentEvents,
  findPaymentsFiltered,
  getRevenueChart,
  getSummaryStats,
  paymentStatuses,
} from "../model/paymentModel.js";

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

// last 30 days (UTC) if the caller doesn't pick a range
const defaultRange = (dateFrom, dateTo) => {
  const to = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
};

const parseFilters = (query) => {
  const { dateFrom, dateTo } = defaultRange(query.dateFrom, query.dateTo);
  return {
    search: query.search || "",
    status: paymentStatuses.includes(query.status) ? query.status : "",
    method: query.method || "",
    dateFrom,
    dateTo,
    minAmount: query.minAmount !== undefined && query.minAmount !== "" ? Number(query.minAmount) : null,
    maxAmount: query.maxAmount !== undefined && query.maxAmount !== "" ? Number(query.maxAmount) : null,
  };
};

export const getPayments = async (req, res) => {
  try {
    const filters = { ...parseFilters(req.query), page: req.query.page, pageSize: req.query.pageSize };
    const result = await findPaymentsFiltered(filters);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, "GetPayments", error);
  }
};

export const getPaymentSummary = async (req, res) => {
  try {
    const { dateFrom, dateTo } = defaultRange(req.query.dateFrom, req.query.dateTo);
    const summary = await getSummaryStats({ dateFrom, dateTo });
    return res.status(200).json(summary);
  } catch (error) {
    return sendError(res, "GetPaymentSummary", error);
  }
};

export const getPaymentChart = async (req, res) => {
  try {
    const { dateFrom, dateTo } = defaultRange(req.query.dateFrom, req.query.dateTo);
    const granularity = ["day", "week", "month"].includes(req.query.granularity) ? req.query.granularity : "day";
    const chart = await getRevenueChart({ dateFrom, dateTo, granularity });
    return res.status(200).json({ granularity, dateFrom, dateTo, points: chart });
  } catch (error) {
    return sendError(res, "GetPaymentChart", error);
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const payment = await findPaymentById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment is not found" });
    }
    const [events, patient] = await Promise.all([findPaymentEvents(payment.id), findPatientById(payment.patientId)]);
    return res.status(200).json({
      payment,
      events,
      patient: patient ? { ...patient, photo: photoUrl(req, patient.photo) } : null,
    });
  } catch (error) {
    return sendError(res, "GetPaymentById", error);
  }
};

// Prevents a text field from being interpreted as a spreadsheet formula when the CSV is opened
// in Excel/Sheets (a cell starting with =, +, - or @ can otherwise execute as a formula).
export const escapeCsvCell = (value) => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

const csvColumns = [
  ["Transaction Date", (p) => new Date(p.capturedAt || p.createdAt).toISOString()],
  ["Transaction ID", (p) => p.providerPaymentId || p.providerOrderId],
  ["Patient ID", (p) => p.patientCode],
  ["Patient Name", (p) => p.patientName],
  ["Appointment ID", (p) => p.appointmentCode],
  ["Payment Method", (p) => p.method || ""],
  ["Gross Amount (INR)", (p) => Number(p.amount).toFixed(2)],
  ["Refund Amount (INR)", (p) => Number(p.refundedAmount).toFixed(2)],
  ["Net Amount (INR)", (p) => (Number(p.amount) - Number(p.refundedAmount)).toFixed(2)],
  ["Status", (p) => p.status],
];

export const buildPaymentsCsv = (rows) => {
  const header = csvColumns.map(([label]) => escapeCsvCell(label)).join(",");
  const lines = rows.map((row) => csvColumns.map(([, get]) => escapeCsvCell(get(row))).join(","));
  return [header, ...lines].join("\r\n");
};

export const exportPayments = async (req, res) => {
  try {
    const rows = await findExportRows(parseFilters(req.query));
    const csv = buildPaymentsCsv(rows);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="carenest-payments-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return sendError(res, "ExportPayments", error);
  }
};

export const refundPayment = async (req, res) => {
  try {
    const payment = await findPaymentById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment is not found" });
    }
    if (!["captured", "partially_refunded"].includes(payment.status)) {
      return res.status(400).json({ message: "Only captured payments can be refunded" });
    }
    const remaining = Number(payment.amount) - Number(payment.refundedAmount);
    const amount = req.body.amount !== undefined && req.body.amount !== "" ? Number(req.body.amount) : remaining;
    if (!(amount > 0) || amount > remaining + 0.01) {
      return res.status(400).json({ message: `Refund amount must be between ₹0 and ₹${remaining.toFixed(2)}` });
    }

    const refund = await razorpay.payments.refund(payment.providerPaymentId, {
      amount: Math.round(amount * 100),
      notes: { reason: req.body.reason ? String(req.body.reason).slice(0, 300) : "", refundedBy: String(req.adminId) },
    });
    const updated = await applyRefund(refund);
    // Razorpay can return the refund still "pending" (queued, e.g. bank-transfer refunds) - only
    // a "processed" status means the money has actually moved, so the response must say so.
    const message =
      refund.status === "processed"
        ? "Refund processed successfully"
        : refund.status === "failed"
        ? "Refund could not be processed"
        : "Refund submitted and is being processed";
    return res.status(200).json({ message, refundStatus: refund.status, payment: updated });
  } catch (error) {
    return sendError(res, "RefundPayment", error);
  }
};

// For a payment stuck in created/pending (e.g. the webhook never arrived): ask Razorpay what
// actually happened and apply it through the same idempotent helpers the webhook uses. There is
// no path here that marks a payment successful without this live round-trip to Razorpay.
export const reconcilePayment = async (req, res) => {
  try {
    const payment = await findPaymentById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment is not found" });
    }
    if (!["created", "pending", "failed"].includes(payment.status)) {
      return res.status(400).json({ message: "This payment is already finalized" });
    }

    const attempts = await razorpay.orders.fetchPayments(payment.providerOrderId);
    const captured = attempts.items.find((entity) => entity.status === "captured");
    const failed = attempts.items.filter((entity) => entity.status === "failed");

    let updated = payment;
    if (captured) {
      updated = await applyPaymentCaptured(captured);
    } else {
      for (const entity of failed) {
        updated = (await applyPaymentFailed(entity)) || updated;
      }
    }
    return res.status(200).json({ message: "Reconciled with Razorpay", payment: updated });
  } catch (error) {
    return sendError(res, "ReconcilePayment", error);
  }
};

export const getPaymentReceipt = async (req, res) => {
  try {
    const payment = await findPaymentById(req.params.paymentId);
    if (!payment || !payment.capturedAt) {
      return res.status(400).json({ message: "No receipt is available for this payment" });
    }
    const net = Number(payment.amount) - Number(payment.refundedAmount);
    const row = (label, value) => `<tr><td class="label">${label}</td><td>${value ?? "-"}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Receipt ${payment.providerPaymentId || payment.id}</title>
      <style>
        body { font-family: system-ui, sans-serif; color: #111827; padding: 32px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .muted { color: #6b7280; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        td.label { color: #6b7280; width: 220px; }
        .total td { font-weight: 700; font-size: 16px; border-bottom: none; }
      </style></head><body>
      <h1>CareNest - Payment Receipt</h1>
      <p class="muted">Issued ${new Date().toLocaleString("en-IN")}</p>
      <table>
        ${row("Patient", payment.patientName)}
        ${row("Doctor", `${payment.doctorName} (${payment.doctorSpecialty})`)}
        ${row("Appointment Date", new Date(payment.appointmentScheduledAt).toLocaleString("en-IN"))}
        ${row("Transaction ID", payment.providerPaymentId || payment.providerOrderId)}
        ${row("Payment Method", payment.method || "-")}
        ${row("Payment Provider", "Razorpay")}
        ${row("Captured At", new Date(payment.capturedAt).toLocaleString("en-IN"))}
        ${row("Gross Amount", `₹${Number(payment.amount).toFixed(2)}`)}
        ${row("Refunded", `₹${Number(payment.refundedAmount).toFixed(2)}`)}
        <tr class="total"><td class="label">Net Amount</td><td>₹${net.toFixed(2)}</td></tr>
      </table>
    </body></html>`;
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return sendError(res, "GetPaymentReceipt", error);
  }
};
