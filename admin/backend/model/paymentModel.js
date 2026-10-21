import { pool, query } from "../config/database.js";

// One row per Razorpay order (= one checkout attempt for one appointment). A single order can
// receive several payment attempts (retries) before one succeeds, which is why status transitions
// are guarded in the apply* functions below instead of just being overwritten.
export const paymentStatuses = ["created", "pending", "failed", "captured", "partially_refunded", "refunded"];
const terminalSuccessStatuses = ["captured", "partially_refunded", "refunded"];

export const createPaymentTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      "appointmentId" INT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      "patientId" INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'razorpay',
      "providerOrderId" TEXT NOT NULL,
      "providerPaymentId" TEXT,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created','pending','failed','captured','partially_refunded','refunded')),
      method TEXT,
      "failureReason" TEXT,
      "refundedAmount" NUMERIC(10,2) NOT NULL DEFAULT 0,
      "receiptId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "capturedAt" TIMESTAMPTZ,
      "refundedAt" TIMESTAMPTZ,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_key ON payments ("providerOrderId")');
  await query('CREATE INDEX IF NOT EXISTS payments_appointment_idx ON payments ("appointmentId")');
  await query('CREATE INDEX IF NOT EXISTS payments_patient_idx ON payments ("patientId")');
  await query("CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status)");
  await query('CREATE INDEX IF NOT EXISTS payments_provider_payment_idx ON payments ("providerPaymentId")');
  // newest-first listing sort: captured time if we have it, otherwise creation time
  await query(
    `CREATE INDEX IF NOT EXISTS payments_sort_idx ON payments (COALESCE("capturedAt", "createdAt") DESC)`
  );

  // append-only audit trail + idempotency guard: the SAME dedupeKey is used whether a state
  // transition arrives via the Razorpay webhook or via the synchronous verify/refund call, so
  // whichever one gets there first "wins" and the other becomes a safe no-op.
  await query(`
    CREATE TABLE IF NOT EXISTS payment_events (
      id SERIAL PRIMARY KEY,
      "paymentId" INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      "dedupeKey" TEXT NOT NULL,
      payload JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS payment_events_dedupe_key ON payment_events ("dedupeKey")');
  await query('CREATE INDEX IF NOT EXISTS payment_events_payment_idx ON payment_events ("paymentId")');
};

// joined with appointment + doctor + patient, for the admin list/detail views
const selectPayment = `
  SELECT p.*, a."scheduledAt" AS "appointmentScheduledAt", a.status AS "appointmentStatus",
    pt.name AS "patientName", pt.code AS "patientCode", a.code AS "appointmentCode", pt.email AS "patientEmail", pt.phone AS "patientPhone",
    d.id AS "doctorId", d.name AS "doctorName", d.specialty AS "doctorSpecialty"
  FROM payments p
  JOIN appointments a ON a.id = p."appointmentId"
  JOIN patients pt ON pt.id = p."patientId"
  JOIN doctors d ON d.id = a."doctorId"
`;

// builds a parameterized WHERE clause shared by the list and the CSV export, so both use the
// exact same filtering logic
const buildFilterWhere = ({ search, status, method, dateFrom, dateTo, minAmount, maxAmount }) => {
  const conditions = [];
  const params = [];
  const push = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  };

  if (search && search.trim()) {
    // CNP-001 / CNA-001 style codes: strip the prefix and zeros so they match the numeric ids
    const code = search.trim().match(/^(CNP|CNAP)-?0*(\d+)$/i);
    if (code) {
      params.push(`${code[1].toUpperCase()}-${code[2].padStart(3, "0")}`);
      const col = code[1].toUpperCase() === "CNP" ? "pt.code" : "a.code";
      conditions.push(`${col} = $${params.length}`);
    } else {
      params.push(`%${search.trim()}%`);
      const n = params.length;
      conditions.push(
        `(pt.name ILIKE $${n} OR CAST(a.id AS TEXT) ILIKE $${n} OR a.code ILIKE $${n} OR pt.code ILIKE $${n} OR COALESCE(p."providerPaymentId",'') ILIKE $${n}
          OR p."providerOrderId" ILIKE $${n} OR COALESCE(p."receiptId",'') ILIKE $${n})`
      );
    }
  }
  // the UI only shows one "Pending" option but Razorpay/our own schema has two pre-success
  // states ('created' = order made, checkout not opened yet; 'pending' = attempt in flight)
  if (status === "pending") {
    conditions.push(`p.status IN ('created','pending')`);
  } else if (status) {
    push("p.status = ?", status);
  }
  if (method) push("p.method = ?", method);
  if (dateFrom) push(`COALESCE(p."capturedAt", p."createdAt") >= ?`, dateFrom);
  if (dateTo) push(`COALESCE(p."capturedAt", p."createdAt") <= ?`, dateTo);
  if (minAmount != null) push("p.amount >= ?", minAmount);
  if (maxAmount != null) push("p.amount <= ?", maxAmount);

  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

export const findPaymentsFiltered = async (filters) => {
  const { where, params } = buildFilterWhere(filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));

  const [countResult, rowsResult] = await Promise.all([
    query(
      `SELECT count(*)::int AS total FROM payments p
       JOIN appointments a ON a.id = p."appointmentId" JOIN patients pt ON pt.id = p."patientId" ${where}`,
      params
    ),
    query(
      `${selectPayment} ${where} ORDER BY COALESCE(p."capturedAt", p."createdAt") DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
  ]);
  return { rows: rowsResult.rows, total: countResult.rows[0].total, page, pageSize };
};

// same filters, no pagination, for CSV export (capped so a huge range can't take down the DB)
export const findExportRows = async (filters) => {
  const { where, params } = buildFilterWhere(filters);
  const { rows } = await query(
    `${selectPayment} ${where} ORDER BY COALESCE(p."capturedAt", p."createdAt") DESC LIMIT 20000`,
    params
  );
  return rows;
};

export const findPaymentById = async (id) => {
  const { rows } = await query(`${selectPayment} WHERE p.id = $1`, [id]);
  return rows[0];
};

export const findPaymentByOrderId = async (providerOrderId) => {
  const { rows } = await query('SELECT * FROM payments WHERE "providerOrderId" = $1', [providerOrderId]);
  return rows[0];
};

// an order already created for this appointment that hasn't succeeded yet -> reuse it (Razorpay
// orders can take several payment attempts before one captures)
export const findReusableOrderForAppointment = async (appointmentId) => {
  const { rows } = await query(
    `SELECT * FROM payments WHERE "appointmentId" = $1 AND status NOT IN ('captured','partially_refunded','refunded')
     ORDER BY "createdAt" DESC LIMIT 1`,
    [appointmentId]
  );
  return rows[0];
};

export const insertPaymentOrder = async ({ appointmentId, patientId, providerOrderId, amount, currency, receiptId }) => {
  const { rows } = await query(
    `INSERT INTO payments ("appointmentId", "patientId", provider, "providerOrderId", amount, currency, "receiptId", status)
     VALUES ($1, $2, 'razorpay', $3, $4, $5, $6, 'created') RETURNING *`,
    [appointmentId, patientId, providerOrderId, amount, currency, receiptId]
  );
  return rows[0];
};

export const findPaymentEvents = async (paymentId) => {
  const { rows } = await query(
    `SELECT id, type, payload, "createdAt" FROM payment_events WHERE "paymentId" = $1 ORDER BY "createdAt" ASC`,
    [paymentId]
  );
  return rows;
};

export const getDistinctMethods = async () => {
  const { rows } = await query(
    `SELECT DISTINCT method FROM payments WHERE method IS NOT NULL AND method <> '' ORDER BY method`
  );
  return rows.map((r) => r.method);
};

// % change vs. the previous equivalent period; null when there is no previous-period baseline
// to compare against (can't compute a meaningful percentage from a zero base)
export const computeChangePct = (current, previous) => {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? null : 0;
};

export const getSummaryStats = async ({ dateFrom, dateTo }) => {
  const spanMs = new Date(dateTo).getTime() - new Date(dateFrom).getTime();
  const prevTo = new Date(new Date(dateFrom).getTime() - 1).toISOString();
  const prevFrom = new Date(new Date(dateFrom).getTime() - spanMs - 1).toISOString();

  const [revenue, prevRevenue, successful, pending, refunds, methods] = await Promise.all([
    query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE "capturedAt" BETWEEN $1 AND $2`, [dateFrom, dateTo]),
    query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE "capturedAt" BETWEEN $1 AND $2`, [prevFrom, prevTo]),
    query(`SELECT count(*)::int AS count FROM payments WHERE "capturedAt" BETWEEN $1 AND $2`, [dateFrom, dateTo]),
    query(
      `SELECT count(*)::int AS count, COALESCE(SUM(amount), 0) AS amount FROM payments
       WHERE status IN ('created','pending') AND "createdAt" BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    ),
    query(
      `SELECT count(*)::int AS count, COALESCE(SUM("refundedAmount"), 0) AS amount FROM payments
       WHERE "refundedAmount" > 0 AND "refundedAt" BETWEEN $1 AND $2`,
      [dateFrom, dateTo]
    ),
    getDistinctMethods(),
  ]);

  const current = Number(revenue.rows[0].total);
  const previous = Number(prevRevenue.rows[0].total);
  return {
    revenue: { amount: current, previousAmount: previous, changePct: computeChangePct(current, previous), dateFrom, dateTo },
    successful: { count: successful.rows[0].count },
    pending: { count: pending.rows[0].count, amount: Number(pending.rows[0].amount) },
    refunds: { count: refunds.rows[0].count, amount: Number(refunds.rows[0].amount) },
    distinctMethods: methods,
  };
};

const allowedGranularity = ["day", "week", "month"];

export const getRevenueChart = async ({ dateFrom, dateTo, granularity }) => {
  const unit = allowedGranularity.includes(granularity) ? granularity : "day";
  const { rows } = await query(
    `SELECT date_trunc($1, "capturedAt") AS bucket, COALESCE(SUM(amount), 0)::float AS revenue
     FROM payments WHERE "capturedAt" BETWEEN $2 AND $3
     GROUP BY bucket ORDER BY bucket`,
    [unit, dateFrom, dateTo]
  );
  return rows.map((r) => ({ bucket: r.bucket, revenue: r.revenue }));
};

// ---- idempotent state-transition helpers. These are the ONLY place payments.status / the
// linked appointment's paymentStatus are ever changed, and both the webhook handler and the
// synchronous verify/refund-API code paths call the same functions, keyed by the same dedupeKey,
// so duplicate or out-of-order delivery is always safe. ----

const recordEventOrSkip = async (client, paymentId, type, dedupeKey, payload) => {
  const { rows } = await client.query(
    `INSERT INTO payment_events ("paymentId", type, "dedupeKey", payload) VALUES ($1, $2, $3, $4)
     ON CONFLICT ("dedupeKey") DO NOTHING RETURNING id`,
    [paymentId, type, dedupeKey, payload]
  );
  return rows.length > 0; // true = this is a new event, caller should apply it
};

// entity = the Razorpay payment entity (has .id, .method, .order_id, ...)
export const applyPaymentCaptured = async (entity) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query('SELECT * FROM payments WHERE "providerOrderId" = $1 FOR UPDATE', [entity.order_id]);
    const payment = rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return null; // order we don't know about (shouldn't happen for our own orders)
    }
    const isNew = await recordEventOrSkip(client, payment.id, "payment.captured", `captured:${entity.id}`, entity);
    if (isNew && !terminalSuccessStatuses.includes(payment.status)) {
      await client.query(
        `UPDATE payments SET status = 'captured', "providerPaymentId" = $1, method = $2, "capturedAt" = now(), "updatedAt" = now()
         WHERE id = $3`,
        [entity.id, entity.method || null, payment.id]
      );
      await client.query(`UPDATE appointments SET "paymentStatus" = 'paid', "updatedAt" = now() WHERE id = $1`, [
        payment.appointmentId,
      ]);
    }
    await client.query("COMMIT");
    return findPaymentById(payment.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const applyPaymentFailed = async (entity) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query('SELECT * FROM payments WHERE "providerOrderId" = $1 FOR UPDATE', [entity.order_id]);
    const payment = rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return null;
    }
    const isNew = await recordEventOrSkip(client, payment.id, "payment.failed", `failed:${entity.id}`, entity);
    // a failed retry must never erase an already-successful payment on the same order
    if (isNew && !terminalSuccessStatuses.includes(payment.status)) {
      await client.query(
        `UPDATE payments SET status = 'failed', "providerPaymentId" = $1, "failureReason" = $2, "updatedAt" = now() WHERE id = $3`,
        [entity.id, entity.error_description || entity.failureReason || "Payment failed", payment.id]
      );
      await client.query(
        `UPDATE appointments SET "paymentStatus" = 'failed', "updatedAt" = now() WHERE id = $1 AND "paymentStatus" = 'pending'`,
        [payment.appointmentId]
      );
    }
    await client.query("COMMIT");
    return findPaymentById(payment.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// refundEntity = the Razorpay refund entity (has .id, .amount in paise, .payment_id, .status).
// Razorpay's refund.status is one of 'pending' (queued, e.g. slower bank-transfer refunds),
// 'processed' (money actually moved) or 'failed' - a refund being CREATED is not the same as it
// being PROCESSED, so only 'processed' is allowed to touch payments.refundedAmount / status below.
// The dedupeKey includes the status (not just the refund id) so a later webhook that moves the
// SAME refund from pending -> processed (or -> failed) is recorded as a new event instead of
// being skipped as a duplicate of the earlier pending one.
export const applyRefund = async (refundEntity) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query('SELECT * FROM payments WHERE "providerPaymentId" = $1 FOR UPDATE', [
      refundEntity.payment_id,
    ]);
    const payment = rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return null;
    }
    const status = refundEntity.status || "pending";
    const isNew = await recordEventOrSkip(
      client,
      payment.id,
      `refund.${status}`,
      `refund:${refundEntity.id}:${status}`,
      refundEntity
    );
    if (isNew && status === "processed" && ["captured", "partially_refunded"].includes(payment.status)) {
      const refundRupees = Number(refundEntity.amount) / 100;
      const newRefunded = Number(payment.refundedAmount) + refundRupees;
      const newStatus = newRefunded >= Number(payment.amount) ? "refunded" : "partially_refunded";
      await client.query(
        `UPDATE payments SET "refundedAmount" = $1, status = $2, "refundedAt" = now(), "updatedAt" = now() WHERE id = $3`,
        [newRefunded, newStatus, payment.id]
      );
      await client.query(`UPDATE appointments SET "paymentStatus" = $1, "updatedAt" = now() WHERE id = $2`, [
        newStatus,
        payment.appointmentId,
      ]);
    }
    await client.query("COMMIT");
    return findPaymentById(payment.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
