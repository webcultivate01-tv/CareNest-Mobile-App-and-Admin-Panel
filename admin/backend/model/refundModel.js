import { query } from "../config/database.js";

// Refunds are not their own table - every refund attempt is already recorded as a row in
// payment_events (type 'refund.<status>', payload = the Razorpay refund entity) by
// applyRefund() in paymentModel.js. A single payment can have several refund attempts (a
// pending one that later fails, a partial refund followed by another), and the SAME Razorpay
// refund id can appear more than once (once per status it passed through), so this file's job
// is turning that event log into one row per distinct refund with its latest known status.
export const refundStatuses = ["processing", "processed", "failed"];
export const refundTypes = ["full", "partial"];

// one row per distinct Razorpay refund id (payload->>'id'), using the most recent event for
// that id as its current state, joined with the payment/patient/appointment it belongs to
const refundsBaseCte = `
  latest_refund_events AS (
    SELECT pe.id, pe."paymentId", pe.payload, pe."createdAt",
      ROW_NUMBER() OVER (PARTITION BY (pe.payload->>'id') ORDER BY pe.id DESC) AS rn
    FROM payment_events pe
    WHERE pe.type LIKE 'refund.%'
  ),
  refunds_full AS (
    SELECT
      lre.id AS "eventId",
      COALESCE(lre.payload->>'id', 'RFD-' || lre.id) AS "refundId",
      COALESCE((lre.payload->>'amount')::numeric / 100, 0) AS "refundAmount",
      CASE COALESCE(lre.payload->>'status', 'pending')
        WHEN 'processed' THEN 'processed'
        WHEN 'failed' THEN 'failed'
        ELSE 'processing'
      END AS "refundStatus",
      COALESCE(to_timestamp((lre.payload->>'created_at')::bigint), lre."createdAt") AS "refundDate",
      lre.payload #>> '{notes,reason}' AS reason,
      p.id AS "paymentId",
      p."providerPaymentId",
      p."providerOrderId",
      p.amount AS "originalAmount",
      CASE WHEN COALESCE((lre.payload->>'amount')::numeric / 100, 0) >= p.amount THEN 'full' ELSE 'partial' END AS "refundType",
      pt.id AS "patientId",
      pt.name AS "patientName",
      pt.code AS "patientCode",
      pt.phone AS "patientPhone",
      pt.email AS "patientEmail",
      a.id AS "appointmentId",
      a.code AS "appointmentCode"
    FROM latest_refund_events lre
    JOIN payments p ON p.id = lre."paymentId"
    JOIN patients pt ON pt.id = p."patientId"
    JOIN appointments a ON a.id = p."appointmentId"
    WHERE lre.rn = 1
  )
`;

// CNP-001 / CNAP-001 style codes: strip the prefix/zeros so they match the stored code exactly
// (same convention used by paymentModel.js's own search)
const matchDisplayCode = (search) => search.trim().match(/^(CNP|CNAP)-?0*(\d+)$/i);

const buildFilterWhere = ({ search, status, type, dateFrom, dateTo }) => {
  const conditions = [];
  const params = [];
  const push = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  };

  if (search && search.trim()) {
    const code = matchDisplayCode(search);
    if (code) {
      params.push(`${code[1].toUpperCase()}-${code[2].padStart(3, "0")}`);
      conditions.push(`${code[1].toUpperCase() === "CNP" ? `"patientCode"` : `"appointmentCode"`} = $${params.length}`);
    } else {
      params.push(`%${search.trim()}%`);
      const n = params.length;
      conditions.push(
        `("patientName" ILIKE $${n} OR "patientCode" ILIKE $${n} OR COALESCE("patientPhone",'') ILIKE $${n}
          OR COALESCE("patientEmail",'') ILIKE $${n} OR "appointmentCode" ILIKE $${n}
          OR COALESCE("providerPaymentId",'') ILIKE $${n} OR "providerOrderId" ILIKE $${n} OR "refundId" ILIKE $${n})`
      );
    }
  }
  if (status) push(`"refundStatus" = ?`, status);
  if (type) push(`"refundType" = ?`, type);
  if (dateFrom) push(`"refundDate" >= ?`, dateFrom);
  if (dateTo) push(`"refundDate" <= ?`, dateTo);

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

export const findRefundsFiltered = async (filters) => {
  const { where, params } = buildFilterWhere(filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));

  const [countResult, rowsResult] = await Promise.all([
    query(`WITH ${refundsBaseCte} SELECT count(*)::int AS total FROM refunds_full ${where}`, params),
    query(
      `WITH ${refundsBaseCte} SELECT * FROM refunds_full ${where} ORDER BY "refundDate" DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
  ]);
  return { rows: rowsResult.rows, total: countResult.rows[0].total, page, pageSize };
};

export const getRefundSummaryStats = async ({ dateFrom, dateTo }) => {
  const { rows } = await query(
    `WITH ${refundsBaseCte}
     SELECT
       COALESCE(SUM("refundAmount") FILTER (WHERE "refundStatus" = 'processed'), 0) AS "totalRefundedAmount",
       count(*)::int AS "totalTransactions",
       count(*) FILTER (WHERE "refundStatus" = 'processing')::int AS "processingCount",
       count(*) FILTER (WHERE "refundStatus" = 'failed')::int AS "failedCount"
     FROM refunds_full WHERE "refundDate" BETWEEN $1 AND $2`,
    [dateFrom, dateTo]
  );
  const r = rows[0];
  return {
    totalRefundedAmount: Number(r.totalRefundedAmount),
    totalTransactions: r.totalTransactions,
    processingCount: r.processingCount,
    failedCount: r.failedCount,
    dateFrom,
    dateTo,
  };
};

// Appointment + its most relevant payment attempt, for the "Issue Refund" wizard's search step.
// An appointment can have several payment attempts (retries); this picks the successful one
// (captured/partially_refunded/refunded) when there is one, otherwise the latest attempt, so a
// failed/pending appointment still shows up with a reason it can't be refunded instead of just
// vanishing from the search results.
const refundSearchCte = `
  latest_payment_per_appointment AS (
    SELECT DISTINCT ON (p."appointmentId") p.*
    FROM payments p
    ORDER BY p."appointmentId", (p.status IN ('captured','partially_refunded','refunded')) DESC, p."createdAt" DESC
  )
`;

const buildAppointmentSearchWhere = ({ patientName, phone, patientCode, appointmentCode, dateFrom, dateTo }) => {
  // the wizard only lists confirmed bookings that can still be refunded: cancelled/pending/completed
  // bookings and ones whose payment is already fully refunded never show up in the search
  const conditions = [`a.status = 'confirmed'`, `COALESCE(lp.status, '') <> 'refunded'`];
  const params = [];
  const push = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  };

  if (patientName && patientName.trim()) push("pt.name ILIKE ?", `%${patientName.trim()}%`);
  if (phone && phone.trim()) push("pt.phone ILIKE ?", `%${phone.trim()}%`);
  if (patientCode && patientCode.trim()) push("pt.code ILIKE ?", `%${patientCode.trim()}%`);
  if (appointmentCode && appointmentCode.trim()) push("a.code ILIKE ?", `%${appointmentCode.trim()}%`);
  if (dateFrom) push(`a."scheduledAt" >= ?`, dateFrom);
  if (dateTo) push(`a."scheduledAt" <= ?`, dateTo);

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

export const findRefundableAppointments = async (filters) => {
  const { where, params } = buildAppointmentSearchWhere(filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 10));

  const baseFrom = `
    FROM appointments a
    JOIN patients pt ON pt.id = a."patientId"
    JOIN doctors d ON d.id = a."doctorId"
    LEFT JOIN latest_payment_per_appointment lp ON lp."appointmentId" = a.id
  `;

  const [countResult, rowsResult] = await Promise.all([
    query(`WITH ${refundSearchCte} SELECT count(*)::int AS total ${baseFrom} ${where}`, params),
    query(
      `WITH ${refundSearchCte}
       SELECT
         a.id AS "appointmentId", a.code AS "appointmentCode", a."scheduledAt", a.status AS "appointmentStatus",
         pt.id AS "patientId", pt.name AS "patientName", pt.code AS "patientCode", pt.phone AS "patientPhone", pt.email AS "patientEmail",
         d.name AS "doctorName", d.specialty AS "doctorSpecialty",
         lp.id AS "paymentId", lp.amount AS "paymentAmount", lp.status AS "paymentStatus", lp."refundedAmount",
         lp."capturedAt", lp."createdAt" AS "paymentCreatedAt", lp."providerPaymentId", lp."providerOrderId"
       ${baseFrom} ${where}
       ORDER BY a."scheduledAt" DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
  ]);
  return { rows: rowsResult.rows, total: countResult.rows[0].total, page, pageSize };
};
