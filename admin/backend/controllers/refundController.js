import { findRefundableAppointments, findRefundsFiltered, getRefundSummaryStats, refundStatuses, refundTypes } from "../model/refundModel.js";

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

// last 30 days (UTC) if the caller doesn't pick a range - same default as /api/payment
const defaultRange = (dateFrom, dateTo) => {
  const to = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
};

const parseFilters = (query) => {
  const { dateFrom, dateTo } = defaultRange(query.dateFrom, query.dateTo);
  return {
    search: query.search || "",
    status: refundStatuses.includes(query.status) ? query.status : "",
    type: refundTypes.includes(query.type) ? query.type : "",
    dateFrom,
    dateTo,
  };
};

export const getRefundList = async (req, res) => {
  try {
    const filters = { ...parseFilters(req.query), page: req.query.page, pageSize: req.query.pageSize };
    const result = await findRefundsFiltered(filters);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, "GetRefundList", error);
  }
};

export const getRefundSummary = async (req, res) => {
  try {
    const { dateFrom, dateTo } = defaultRange(req.query.dateFrom, req.query.dateTo);
    const summary = await getRefundSummaryStats({ dateFrom, dateTo });
    return res.status(200).json(summary);
  } catch (error) {
    return sendError(res, "GetRefundSummary", error);
  }
};

// why a given appointment's payment (or lack of one) can't be refunded right now - shown in the
// Issue Refund wizard instead of just hiding the row
const ineligibleReason = (row) => {
  if (!row.paymentId) return "No payment was recorded for this appointment";
  if (["created", "pending"].includes(row.paymentStatus)) return "Payment has not completed yet";
  if (row.paymentStatus === "failed") return "Payment failed - nothing to refund";
  if (row.paymentStatus === "refunded") return "Already fully refunded";
  if (Number(row.paymentAmount) <= Number(row.refundedAmount)) return "Already fully refunded";
  return null;
};

// appointment + payment search that powers step 1 of the Issue Refund wizard - combines whichever
// of patientName / phone / patientCode / appointmentCode / date range the admin filled in
export const searchRefundableAppointments = async (req, res) => {
  try {
    const filters = {
      patientName: req.query.patientName || "",
      phone: req.query.phone || "",
      patientCode: req.query.patientCode || "",
      appointmentCode: req.query.appointmentCode || "",
      dateFrom: req.query.dateFrom || "",
      dateTo: req.query.dateTo || "",
      page: req.query.page,
      pageSize: req.query.pageSize,
    };
    const result = await findRefundableAppointments(filters);
    const rows = result.rows.map((row) => {
      const remainingAmount = row.paymentId ? Number(row.paymentAmount) - Number(row.refundedAmount) : 0;
      const reason = ineligibleReason(row);
      return { ...row, remainingAmount, isEligible: !reason, ineligibleReason: reason };
    });
    return res.status(200).json({ ...result, rows });
  } catch (error) {
    return sendError(res, "SearchRefundableAppointments", error);
  }
};
