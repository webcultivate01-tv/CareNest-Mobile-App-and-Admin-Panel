import { query } from "../config/database.js";

// The patient's notification inbox (what the bell in the mobile app shows) and, for each row, how
// the matching email went. One row per notification per patient.
//
// `dedupeKey` is what makes the whole module safe to run repeatedly: every notification that could
// be triggered more than once (a reminder sweep that runs every minute, a Razorpay webhook that is
// delivered twice, a verify call racing that webhook) carries a key built from the event, so the
// second attempt hits the unique index, inserts nothing, and no duplicate email is ever sent.

export const notificationTypes = [
  "welcome",
  "booking_confirmed",
  "payment_failed",
  "reminder_1day",
  "reminder_1hour",
  "reminder_30min",
  "reminder_10min",
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_completed",
  "appointment_cancelled",
  "refund_processed",
  "password_changed",
  "campaign", // a Marketing module message sent to the app inbox (config/campaignSender.js)
];

export const createNotificationTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      "patientId" INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      "dedupeKey" TEXT,
      "emailTo" TEXT,
      "emailStatus" TEXT NOT NULL DEFAULT 'pending'
        CHECK ("emailStatus" IN ('pending','sent','failed','skipped','none')),
      "emailError" TEXT,
      "readAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // One notification per event per patient. This has to be a PLAIN unique index, not a partial
  // one: Postgres can not infer a partial index as the arbiter for the INSERT ... ON CONFLICT
  // ("dedupeKey") below, and the insert fails with "no unique or exclusion constraint matching the
  // ON CONFLICT specification". A plain unique index is also exactly the semantics we want, because
  // Postgres counts NULLs as distinct - so any number of rows may have no dedupeKey at all.
  await query('DROP INDEX IF EXISTS notifications_dedupe_key'); // the earlier partial index
  await query('CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_unique ON notifications ("dedupeKey")');
  // the inbox query the app makes: newest first for one patient
  await query('CREATE INDEX IF NOT EXISTS notifications_patient_idx ON notifications ("patientId", "createdAt" DESC)');
  await query('CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications ("patientId") WHERE "readAt" IS NULL');

  // Password reset by email OTP. The code itself is never stored - only a SHA-256 hash of it, so a
  // leaked database row can not be used to reset anybody's password.
  await query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      "patientId" INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      "otpHash" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      "verifiedAt" TIMESTAMPTZ,
      "resetTokenHash" TEXT,
      "tokenExpiresAt" TIMESTAMPTZ,
      "usedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS password_resets_patient_idx ON password_resets ("patientId", "createdAt" DESC)');
  await query('CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets ("resetTokenHash")');
};

// ---- inbox ----

// Returns the new row, or undefined when `dedupeKey` says this notification already exists.
// Undefined therefore means "already handled - do not send the email again".
export const insertNotification = async ({ patientId, type, title, body, data, dedupeKey, emailTo }) => {
  const { rows } = await query(
    `INSERT INTO notifications ("patientId", type, title, body, data, "dedupeKey", "emailTo", "emailStatus")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ("dedupeKey") DO NOTHING
     RETURNING *`,
    [
      patientId,
      type,
      title,
      body,
      data ? JSON.stringify(data) : null,
      dedupeKey || null,
      emailTo || null,
      emailTo ? "pending" : "none",
    ]
  );
  return rows[0];
};

export const setNotificationEmailResult = async (id, { status, error }) => {
  await query(`UPDATE notifications SET "emailStatus" = $1, "emailError" = $2 WHERE id = $3`, [
    status,
    error ? String(error).slice(0, 500) : null,
    id,
  ]);
};

// newest first, capped so a patient with a long history can not pull down a huge payload
export const findNotificationsByPatient = async (patientId, { limit = 50, offset = 0 } = {}) => {
  const { rows } = await query(
    `SELECT id, type, title, body, data, "readAt", "createdAt" FROM notifications
     WHERE "patientId" = $1 ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`,
    [patientId, Math.min(100, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0)]
  );
  return rows;
};

export const countUnreadNotifications = async (patientId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM notifications WHERE "patientId" = $1 AND "readAt" IS NULL`,
    [patientId]
  );
  return rows[0].count;
};

// patientId is part of the WHERE so one patient can never mark another patient's row as read
export const markNotificationRead = async (patientId, id) => {
  const { rows } = await query(
    `UPDATE notifications SET "readAt" = now() WHERE id = $1 AND "patientId" = $2 AND "readAt" IS NULL
     RETURNING id`,
    [id, patientId]
  );
  return rows[0];
};

// returns the ids that were marked (the Marketing module turns their ticks blue)
export const markAllNotificationsRead = async (patientId) => {
  const { rows } = await query(
    `UPDATE notifications SET "readAt" = now() WHERE "patientId" = $1 AND "readAt" IS NULL RETURNING id`,
    [patientId]
  );
  return rows.map((r) => r.id);
};

export const deleteNotification = async (patientId, id) => {
  const { rows } = await query(`DELETE FROM notifications WHERE id = $1 AND "patientId" = $2 RETURNING id`, [
    id,
    patientId,
  ]);
  return rows[0];
};

// ---- password reset (OTP) ----

export const countRecentResetRequests = async (patientId, minutes) => {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM password_resets
     WHERE "patientId" = $1 AND "createdAt" > now() - ($2 * interval '1 minute')`,
    [patientId, minutes]
  );
  return rows[0].count;
};

// asking for a new code kills every earlier unused code for this patient
export const expirePreviousResets = async (patientId) => {
  await query(`UPDATE password_resets SET "usedAt" = now() WHERE "patientId" = $1 AND "usedAt" IS NULL`, [patientId]);
};

export const insertPasswordReset = async ({ patientId, otpHash, expiresAt }) => {
  const { rows } = await query(
    `INSERT INTO password_resets ("patientId", "otpHash", "expiresAt") VALUES ($1, $2, $3) RETURNING *`,
    [patientId, otpHash, expiresAt]
  );
  return rows[0];
};

// the newest code for this patient that has not been used yet (expiry / attempts are checked by the caller)
export const findActiveReset = async (patientId) => {
  const { rows } = await query(
    `SELECT * FROM password_resets WHERE "patientId" = $1 AND "usedAt" IS NULL
     ORDER BY "createdAt" DESC LIMIT 1`,
    [patientId]
  );
  return rows[0];
};

export const bumpResetAttempts = async (id) => {
  const { rows } = await query(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`, [
    id,
  ]);
  return rows[0]?.attempts;
};

export const markResetVerified = async (id, { resetTokenHash, tokenExpiresAt }) => {
  const { rows } = await query(
    `UPDATE password_resets SET "verifiedAt" = now(), "resetTokenHash" = $1, "tokenExpiresAt" = $2
     WHERE id = $3 RETURNING *`,
    [resetTokenHash, tokenExpiresAt, id]
  );
  return rows[0];
};

// the row for a reset token that is verified, unused and still inside its window
export const findResetByToken = async (resetTokenHash) => {
  const { rows } = await query(
    `SELECT * FROM password_resets
     WHERE "resetTokenHash" = $1 AND "usedAt" IS NULL AND "verifiedAt" IS NOT NULL AND "tokenExpiresAt" > now()
     LIMIT 1`,
    [resetTokenHash]
  );
  return rows[0];
};

export const markResetUsed = async (id) => {
  await query(`UPDATE password_resets SET "usedAt" = now() WHERE id = $1`, [id]);
};
