import { query } from "../config/database.js";
import { MAX_REPORT_ROWS } from "../config/reports.js";
import { appointmentStatuses } from "./appointmentModel.js";
import { refundsBaseCte, refundStatuses, refundTypes } from "./refundModel.js";
import { consentSources } from "./patientModel.js";

// The five reports the Reports page offers, each one a definition of:
//
//   filters   - which filter controls the page shows for it (the frontend renders these by name)
//   columns   - what the report contains, in order (see config/reports.js for the type system)
//   sql       - a function (filters, add) -> SELECT producing exactly those columns
//   orderBy   - how the rows are sorted
//   summary   - aggregate tiles, written as SQL over the report's own rows
//   cte       - optional WITH clause the SELECT needs
//
// Every report is run the same way by runReport() below: the `sql` becomes a CTE named `base`, and
// both the rows and the summary are read back out of it. That is what guarantees the totals printed
// at the top of a file always describe exactly the rows printed underneath - they come from the
// same filtered set, not from a second query with its own copy of the filters.

// $-placeholder builder: `add(value)` registers a parameter and hands back its placeholder, so a
// value used twice in one statement (a date range applied to two different subqueries, say) is
// simply added twice instead of the SQL having to track indexes by hand.
const makeParams = () => {
  const params = [];
  return { params, add: (value) => `$${params.push(value)}` };
};

const andAll = (conditions) => (conditions.length ? `WHERE ${conditions.join(" AND ")}` : "");

// CNP-001 (patient) / CNAP-001 (appointment) display ids: matched exactly, so searching "CNP-7"
// finds CNP-007 rather than nothing. (Same convention as paymentModel.js / refundModel.js.)
export const displayCode = (search) => {
  const match = String(search ?? "").trim().match(/^(CNAP|CNP)-?0*(\d+)$/i);
  return match ? `${match[1].toUpperCase()}-${match[2].padStart(3, "0")}` : null;
};

// a free-text search across several columns; `columns` are raw SQL expressions
const searchClause = (search, columns, add) => {
  const placeholder = add(`%${String(search).trim()}%`);
  return `(${columns.map((c) => `COALESCE(${c}, '') ILIKE ${placeholder}`).join(" OR ")})`;
};

// payments have two pre-success states ('created' = order made, checkout never opened; 'pending' =
// an attempt is in flight) but the panel only offers one "Pending" option, same as the Payments page
const paymentStatusClause = (status, column, add) =>
  status === "pending"
    ? `${column} IN ('created','pending')`
    : `${column} = ${add(status)}`;

const SUCCESSFUL_PAYMENTS = `('captured','partially_refunded','refunded')`;

export const REPORT_DEFINITIONS = {
  // ---- 1. User Report -------------------------------------------------------------------------
  users: {
    key: "users",
    title: "User Report",
    description: "Every registered patient with their booking history, spend and marketing consent.",
    dateLabel: "Registered between",
    searchPlaceholder: "Patient name, ID, phone or email",
    filters: ["dateRange", "search", "consent"],
    columns: [
      { key: "code", header: "Patient ID", type: "code" },
      { key: "name", header: "Name", type: "text" },
      { key: "phone", header: "Phone", type: "code" },
      { key: "email", header: "Email", type: "text", pdf: false, excelWidth: 28 },
      { key: "dob", header: "Date of Birth", type: "text", pdfWidth: 1.3 },
      { key: "createdAt", header: "Registered On", type: "datetime" },
      { key: "totalAppointments", header: "Appointments", type: "int" },
      { key: "completedAppointments", header: "Completed", type: "int" },
      { key: "cancelledAppointments", header: "Cancelled", type: "int" },
      { key: "lastVisit", header: "Last Visit", type: "date" },
      { key: "totalPaid", header: "Net Paid", type: "money" },
      { key: "marketingConsent", header: "Marketing Consent", type: "bool" },
      { key: "consentSource", header: "Consent Source", type: "status", pdf: false },
    ],
    orderBy: `"createdAt" DESC`,
    sql: ({ dateFrom, dateTo, search, consent }, add) => {
      const conditions = [];
      if (dateFrom) conditions.push(`p."createdAt" >= ${add(dateFrom)}`);
      if (dateTo) conditions.push(`p."createdAt" <= ${add(dateTo)}`);
      const code = displayCode(search || "");
      if (code) conditions.push(`p.code = ${add(code)}`);
      else if (search) conditions.push(searchClause(search, ["p.name", "p.code", "p.phone", "p.email"], add));
      if (consent === "yes") conditions.push(`p."marketingConsent" = true`);
      if (consent === "no") conditions.push(`p."marketingConsent" = false`);
      return `
        SELECT p.code, p.name, p.phone, p.email,
          to_char(p.dob, 'DD/MM/YYYY') AS dob,
          p."createdAt", p."marketingConsent", p."marketingConsentSource" AS "consentSource",
          COALESCE(book.total, 0)::int AS "totalAppointments",
          COALESCE(book.completed, 0)::int AS "completedAppointments",
          COALESCE(book.cancelled, 0)::int AS "cancelledAppointments",
          book."lastVisit",
          COALESCE(paid.net, 0) AS "totalPaid"
        FROM patients p
        LEFT JOIN (
          SELECT "patientId",
            count(*) AS total,
            count(*) FILTER (WHERE status = 'completed') AS completed,
            count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            max("scheduledAt") FILTER (WHERE status = 'completed') AS "lastVisit"
          FROM appointments GROUP BY "patientId"
        ) book ON book."patientId" = p.id
        LEFT JOIN (
          SELECT "patientId", sum(amount - "refundedAmount") AS net
          FROM payments WHERE status IN ${SUCCESSFUL_PAYMENTS} GROUP BY "patientId"
        ) paid ON paid."patientId" = p.id
        ${andAll(conditions)}
      `;
    },
    summary: [
      { label: "Patients", expr: "count(*)", type: "int" },
      { label: "With Appointments", expr: `count(*) FILTER (WHERE "totalAppointments" > 0)`, type: "int" },
      { label: "Marketing Consent", expr: `count(*) FILTER (WHERE "marketingConsent")`, type: "int" },
      { label: "Total Appointments", expr: `COALESCE(sum("totalAppointments"), 0)`, type: "int" },
      { label: "Net Collected", expr: `COALESCE(sum("totalPaid"), 0)`, type: "money" },
    ],
  },

  // ---- 2. Doctor Report -----------------------------------------------------------------------
  // The date range scopes the *activity* numbers, not which doctors are listed: a doctor with no
  // appointments in the window still appears, with zeros. That is the point of the report - seeing
  // who was idle is as useful as seeing who was busy.
  doctors: {
    key: "doctors",
    title: "Doctor Report",
    description: "Per-doctor workload, completion rate and revenue earned over the chosen period.",
    dateLabel: "Activity between",
    searchPlaceholder: "Doctor name or specialty",
    filters: ["dateRange", "search", "specialty", "doctorStatus"],
    columns: [
      { key: "name", header: "Doctor", type: "text" },
      { key: "specialty", header: "Specialty", type: "text" },
      { key: "qualifications", header: "Qualifications", type: "text", pdf: false, excelWidth: 24 },
      { key: "experienceYears", header: "Experience (yrs)", type: "int" },
      { key: "fee", header: "Consultation Fee", type: "money" },
      { key: "status", header: "Status", type: "status", pdfWidth: 1 },
      { key: "totalAppointments", header: "Appointments", type: "int" },
      { key: "completedAppointments", header: "Completed", type: "int" },
      { key: "cancelledAppointments", header: "Cancelled", type: "int" },
      { key: "upcomingAppointments", header: "Upcoming", type: "int", pdf: false },
      { key: "uniquePatients", header: "Patients", type: "int" },
      { key: "revenue", header: "Net Revenue", type: "money" },
    ],
    orderBy: `"totalAppointments" DESC, name ASC`,
    sql: ({ dateFrom, dateTo, search, specialty, doctorStatus }, add) => {
      // the window is applied inside each subquery, so it filters the counts rather than the doctors
      const window = (column) =>
        [dateFrom ? `${column} >= ${add(dateFrom)}` : null, dateTo ? `${column} <= ${add(dateTo)}` : null]
          .filter(Boolean)
          .join(" AND ");
      const bookingWindow = window(`a."scheduledAt"`);
      const paymentWindow = window(`COALESCE(pm."capturedAt", pm."createdAt")`);

      const conditions = [];
      if (search) conditions.push(searchClause(search, ["d.name", "d.specialty"], add));
      if (specialty) conditions.push(`d.specialty = ${add(specialty)}`);
      if (doctorStatus === "active") conditions.push(`d."isAvailable" = true`);
      if (doctorStatus === "inactive") conditions.push(`d."isAvailable" = false`);

      return `
        SELECT d.name, d.specialty, d.qualifications, d."experienceYears", d.fee,
          CASE WHEN d."isAvailable" THEN 'active' ELSE 'inactive' END AS status,
          COALESCE(book.total, 0)::int AS "totalAppointments",
          COALESCE(book.completed, 0)::int AS "completedAppointments",
          COALESCE(book.cancelled, 0)::int AS "cancelledAppointments",
          COALESCE(book.upcoming, 0)::int AS "upcomingAppointments",
          COALESCE(book.patients, 0)::int AS "uniquePatients",
          COALESCE(earned.net, 0) AS revenue
        FROM doctors d
        LEFT JOIN (
          SELECT a."doctorId",
            count(*) AS total,
            count(*) FILTER (WHERE a.status = 'completed') AS completed,
            count(*) FILTER (WHERE a.status = 'cancelled') AS cancelled,
            count(*) FILTER (WHERE a.status IN ('pending','confirmed') AND a."scheduledAt" >= now()) AS upcoming,
            count(DISTINCT a."patientId") AS patients
          FROM appointments a
          ${bookingWindow ? `WHERE ${bookingWindow}` : ""}
          GROUP BY a."doctorId"
        ) book ON book."doctorId" = d.id
        LEFT JOIN (
          SELECT a."doctorId", sum(pm.amount - pm."refundedAmount") AS net
          FROM payments pm
          JOIN appointments a ON a.id = pm."appointmentId"
          WHERE pm.status IN ${SUCCESSFUL_PAYMENTS}${paymentWindow ? ` AND ${paymentWindow}` : ""}
          GROUP BY a."doctorId"
        ) earned ON earned."doctorId" = d.id
        ${andAll(conditions)}
      `;
    },
    summary: [
      { label: "Doctors", expr: "count(*)", type: "int" },
      { label: "Active", expr: `count(*) FILTER (WHERE status = 'active')`, type: "int" },
      { label: "Appointments", expr: `COALESCE(sum("totalAppointments"), 0)`, type: "int" },
      { label: "Completed", expr: `COALESCE(sum("completedAppointments"), 0)`, type: "int" },
      { label: "Net Revenue", expr: `COALESCE(sum(revenue), 0)`, type: "money" },
    ],
  },

  // ---- 3. Appointment Report ------------------------------------------------------------------
  appointments: {
    key: "appointments",
    title: "Appointment Report",
    description: "Every booking with its doctor, patient, status and payment state.",
    dateLabel: "Appointment date between",
    searchPlaceholder: "Appointment ID, patient, doctor or phone",
    filters: ["dateRange", "search", "status", "doctor", "paymentStatus"],
    columns: [
      { key: "code", header: "Appointment ID", type: "code" },
      { key: "scheduledAt", header: "Scheduled For", type: "datetime" },
      { key: "patientCode", header: "Patient ID", type: "code" },
      { key: "patientName", header: "Patient", type: "text" },
      { key: "patientPhone", header: "Phone", type: "code", pdf: false },
      { key: "doctorName", header: "Doctor", type: "text" },
      { key: "specialty", header: "Specialty", type: "text" },
      { key: "durationMinutes", header: "Duration (min)", type: "int", pdf: false },
      { key: "status", header: "Status", type: "status", pdfWidth: 1.1 },
      { key: "paymentStatus", header: "Payment", type: "status", pdfWidth: 1.3 },
      { key: "fee", header: "Fee", type: "money" },
      { key: "rescheduleCount", header: "Reschedules", type: "int", pdf: false },
      { key: "bookedAt", header: "Booked On", type: "datetime", pdf: false },
      { key: "notes", header: "Notes", type: "text", pdf: false, excelWidth: 30 },
    ],
    orderBy: `"scheduledAt" DESC`,
    sql: ({ dateFrom, dateTo, search, status, doctorId, paymentStatus }, add) => {
      const conditions = [];
      if (dateFrom) conditions.push(`a."scheduledAt" >= ${add(dateFrom)}`);
      if (dateTo) conditions.push(`a."scheduledAt" <= ${add(dateTo)}`);
      const code = displayCode(search || "");
      if (code) conditions.push(`(a.code = ${add(code)} OR pt.code = ${add(code)})`);
      else if (search) conditions.push(searchClause(search, ["a.code", "pt.name", "pt.code", "pt.phone", "d.name", "d.specialty"], add));
      if (status) conditions.push(`a.status = ${add(status)}`);
      if (doctorId) conditions.push(`a."doctorId" = ${add(doctorId)}`);
      if (paymentStatus) conditions.push(`a."paymentStatus" = ${add(paymentStatus)}`);
      return `
        SELECT a.code, a."scheduledAt", a."createdAt" AS "bookedAt", a."durationMinutes",
          a.status, a."paymentStatus", a.fee, a."rescheduleCount", a.notes,
          pt.code AS "patientCode", pt.name AS "patientName", pt.phone AS "patientPhone",
          d.name AS "doctorName", d.specialty
        FROM appointments a
        JOIN patients pt ON pt.id = a."patientId"
        JOIN doctors d ON d.id = a."doctorId"
        ${andAll(conditions)}
      `;
    },
    summary: [
      { label: "Appointments", expr: "count(*)", type: "int" },
      { label: "Completed", expr: `count(*) FILTER (WHERE status = 'completed')`, type: "int" },
      { label: "Cancelled", expr: `count(*) FILTER (WHERE status = 'cancelled')`, type: "int" },
      { label: "Upcoming", expr: `count(*) FILTER (WHERE status IN ('pending','confirmed'))`, type: "int" },
      { label: "Paid", expr: `count(*) FILTER (WHERE "paymentStatus" = 'paid')`, type: "int" },
      { label: "Completed Fee Value", expr: `COALESCE(sum(fee) FILTER (WHERE status = 'completed'), 0)`, type: "money" },
    ],
  },

  // ---- 4. Payment Report ----------------------------------------------------------------------
  payments: {
    key: "payments",
    title: "Payment Report",
    description: "Razorpay transactions with gross, refunded and net amounts for reconciliation.",
    dateLabel: "Transaction date between",
    searchPlaceholder: "Transaction ID, patient or appointment ID",
    filters: ["dateRange", "search", "paymentTxnStatus", "method", "amountRange"],
    columns: [
      { key: "txnDate", header: "Transaction Date", type: "datetime" },
      { key: "txnId", header: "Transaction ID", type: "code", pdfWidth: 2, excelWidth: 24 },
      { key: "providerOrderId", header: "Order ID", type: "code", pdf: false, excelWidth: 24 },
      { key: "patientCode", header: "Patient ID", type: "code" },
      { key: "patientName", header: "Patient", type: "text" },
      { key: "appointmentCode", header: "Appointment ID", type: "code" },
      { key: "doctorName", header: "Doctor", type: "text" },
      { key: "method", header: "Method", type: "status", pdfWidth: 1 },
      { key: "amount", header: "Gross Amount", type: "money" },
      { key: "refundedAmount", header: "Refunded", type: "money" },
      { key: "netAmount", header: "Net Amount", type: "money" },
      { key: "status", header: "Status", type: "status", pdfWidth: 1.3 },
    ],
    orderBy: `"txnDate" DESC`,
    sql: ({ dateFrom, dateTo, search, paymentTxnStatus, method, minAmount, maxAmount }, add) => {
      const conditions = [];
      const txnDate = `COALESCE(pm."capturedAt", pm."createdAt")`;
      if (dateFrom) conditions.push(`${txnDate} >= ${add(dateFrom)}`);
      if (dateTo) conditions.push(`${txnDate} <= ${add(dateTo)}`);
      const code = displayCode(search || "");
      if (code) conditions.push(`(pt.code = ${add(code)} OR a.code = ${add(code)})`);
      else if (search)
        conditions.push(
          searchClause(search, ["pt.name", "pt.code", "a.code", `pm."providerPaymentId"`, `pm."providerOrderId"`, `pm."receiptId"`], add)
        );
      if (paymentTxnStatus) conditions.push(paymentStatusClause(paymentTxnStatus, "pm.status", add));
      if (method) conditions.push(`pm.method = ${add(method)}`);
      if (minAmount != null) conditions.push(`pm.amount >= ${add(minAmount)}`);
      if (maxAmount != null) conditions.push(`pm.amount <= ${add(maxAmount)}`);
      return `
        SELECT ${txnDate} AS "txnDate",
          COALESCE(pm."providerPaymentId", pm."providerOrderId") AS "txnId",
          pm."providerOrderId", pm.method, pm.amount, pm."refundedAmount",
          (pm.amount - pm."refundedAmount") AS "netAmount", pm.status,
          pt.code AS "patientCode", pt.name AS "patientName",
          a.code AS "appointmentCode", d.name AS "doctorName"
        FROM payments pm
        JOIN appointments a ON a.id = pm."appointmentId"
        JOIN patients pt ON pt.id = pm."patientId"
        JOIN doctors d ON d.id = a."doctorId"
        ${andAll(conditions)}
      `;
    },
    summary: [
      { label: "Transactions", expr: "count(*)", type: "int" },
      { label: "Successful", expr: `count(*) FILTER (WHERE status IN ${SUCCESSFUL_PAYMENTS})`, type: "int" },
      { label: "Failed", expr: `count(*) FILTER (WHERE status = 'failed')`, type: "int" },
      { label: "Gross Collected", expr: `COALESCE(sum(amount) FILTER (WHERE status IN ${SUCCESSFUL_PAYMENTS}), 0)`, type: "money" },
      { label: "Refunded", expr: `COALESCE(sum("refundedAmount"), 0)`, type: "money" },
      { label: "Net Collected", expr: `COALESCE(sum("netAmount") FILTER (WHERE status IN ${SUCCESSFUL_PAYMENTS}), 0)`, type: "money" },
    ],
  },

  // ---- 5. Refund Report -----------------------------------------------------------------------
  // Refunds have no table of their own: each one is derived from the payment_events audit log by
  // refundsBaseCte, imported from refundModel.js so this report and the Refund Management pages can
  // never disagree about what counts as a refund or what its current status is.
  refunds: {
    key: "refunds",
    title: "Refund Report",
    description: "Money returned to patients, with the reason and the payment each refund came from.",
    dateLabel: "Refund date between",
    searchPlaceholder: "Refund ID, patient or appointment ID",
    filters: ["dateRange", "search", "refundStatus", "refundType"],
    cte: refundsBaseCte,
    columns: [
      { key: "refundDate", header: "Refund Date", type: "datetime" },
      { key: "refundId", header: "Refund ID", type: "code", pdfWidth: 1.8, excelWidth: 22 },
      { key: "providerPaymentId", header: "Payment ID", type: "code", pdf: false, excelWidth: 22 },
      { key: "patientCode", header: "Patient ID", type: "code" },
      { key: "patientName", header: "Patient", type: "text" },
      { key: "patientPhone", header: "Phone", type: "code", pdf: false },
      { key: "appointmentCode", header: "Appointment ID", type: "code" },
      { key: "originalAmount", header: "Original Amount", type: "money" },
      { key: "refundAmount", header: "Refund Amount", type: "money" },
      { key: "refundType", header: "Type", type: "status", pdfWidth: 1 },
      { key: "refundStatus", header: "Status", type: "status", pdfWidth: 1.2 },
      { key: "reason", header: "Reason", type: "text", excelWidth: 30 },
    ],
    orderBy: `"refundDate" DESC`,
    sql: ({ dateFrom, dateTo, search, refundStatus, refundType }, add) => {
      const conditions = [];
      if (dateFrom) conditions.push(`"refundDate" >= ${add(dateFrom)}`);
      if (dateTo) conditions.push(`"refundDate" <= ${add(dateTo)}`);
      const code = displayCode(search || "");
      if (code) conditions.push(`("patientCode" = ${add(code)} OR "appointmentCode" = ${add(code)})`);
      else if (search)
        conditions.push(
          searchClause(search, [`"patientName"`, `"patientCode"`, `"appointmentCode"`, `"refundId"`, `"providerPaymentId"`], add)
        );
      if (refundStatus) conditions.push(`"refundStatus" = ${add(refundStatus)}`);
      if (refundType) conditions.push(`"refundType" = ${add(refundType)}`);
      return `
        SELECT "refundDate", "refundId", "providerPaymentId", "patientCode", "patientName", "patientPhone",
          "appointmentCode", "originalAmount", "refundAmount", "refundType", "refundStatus", reason
        FROM refunds_full
        ${andAll(conditions)}
      `;
    },
    summary: [
      { label: "Refunds", expr: "count(*)", type: "int" },
      { label: "Processed", expr: `count(*) FILTER (WHERE "refundStatus" = 'processed')`, type: "int" },
      { label: "Processing", expr: `count(*) FILTER (WHERE "refundStatus" = 'processing')`, type: "int" },
      { label: "Failed", expr: `count(*) FILTER (WHERE "refundStatus" = 'failed')`, type: "int" },
      { label: "Amount Processed", expr: `COALESCE(sum("refundAmount") FILTER (WHERE "refundStatus" = 'processed'), 0)`, type: "money" },
    ],
  },
};

// panel order of the cards
export const REPORT_KEYS = ["users", "doctors", "appointments", "payments", "refunds"];

export const getReport = (key) => REPORT_DEFINITIONS[key];

// ---- running a report -----------------------------------------------------------------------

// Runs one report and returns its rows plus the matching summary. `limit` caps the rows actually
// returned (the Reports page asks for a handful for its preview, a file asks for MAX_REPORT_ROWS);
// `total` is always the true number of matching rows, so a capped file can say what it left out.
export const runReport = async (key, filters, limit = MAX_REPORT_ROWS) => {
  const report = getReport(key);
  if (!report) throw new Error(`Unknown report "${key}"`);

  const { params, add } = makeParams();
  const base = report.sql(filters, add);
  const leadingCte = report.cte ? `${report.cte},` : "";
  const summarySelect = report.summary.map((stat, index) => `${stat.expr} AS "s${index}"`).join(", ");

  // The rows and the summary read from the same `base` CTE with the same parameters, so the totals
  // on a report can never describe a different set of rows than the ones listed below them.
  const [rowsResult, summaryResult] = await Promise.all([
    query(
      `WITH ${leadingCte} base AS (${base})
       SELECT * FROM base ORDER BY ${report.orderBy} LIMIT $${params.length + 1}`,
      [...params, Math.max(1, Math.min(MAX_REPORT_ROWS, Number(limit) || MAX_REPORT_ROWS))]
    ),
    query(`WITH ${leadingCte} base AS (${base}) SELECT count(*)::int AS "rowCount", ${summarySelect} FROM base`, params),
  ]);

  const aggregate = summaryResult.rows[0];
  return {
    report,
    rows: rowsResult.rows,
    total: aggregate.rowCount,
    // NUMERIC comes back from pg as a string to keep its precision; the file writers want numbers
    summary: report.summary.map((stat, index) => ({
      label: stat.label,
      type: stat.type,
      value: Number(aggregate[`s${index}`]),
    })),
  };
};

// ---- filter option lists ---------------------------------------------------------------------

// Everything the Reports page needs to populate its dropdowns, so the panel never hard-codes a
// status the backend would reject.
export const getFilterOptions = async () => {
  const [doctors, specialties, methods] = await Promise.all([
    query(`SELECT id, name, specialty FROM doctors ORDER BY name`),
    query(`SELECT DISTINCT specialty FROM doctors WHERE specialty <> '' ORDER BY specialty`),
    query(`SELECT DISTINCT method FROM payments WHERE method IS NOT NULL AND method <> '' ORDER BY method`),
  ]);
  return {
    doctors: doctors.rows,
    specialties: specialties.rows.map((r) => r.specialty),
    methods: methods.rows.map((r) => r.method),
    appointmentStatuses,
    appointmentPaymentStatuses: ["pending", "paid", "failed", "partially_refunded", "refunded"],
    // the single "Pending" option maps to created+pending in SQL (see paymentStatusClause)
    paymentTxnStatuses: ["captured", "pending", "failed", "partially_refunded", "refunded"],
    refundStatuses,
    refundTypes,
    consentSources,
  };
};
