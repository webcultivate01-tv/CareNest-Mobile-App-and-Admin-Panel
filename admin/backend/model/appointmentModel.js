import { pool, query } from "../config/database.js";

export const appointmentStatuses = ["pending", "confirmed", "completed", "cancelled"];

// fee + durationMinutes are copied from the doctor when the appointment is booked, so later
// fee / duration changes never rewrite old appointments.
export const createAppointmentTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      "patientId" INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      "doctorId" INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      "scheduledAt" TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','completed','cancelled')),
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee NUMERIC(10,2)");
  // reschedule trail: why / when the last move happened, the time it moved from, and how many times
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "rescheduleReason" TEXT');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "rescheduledAt" TIMESTAMPTZ');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "previousScheduledAt" TIMESTAMPTZ');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "rescheduleCount" INT NOT NULL DEFAULT 0');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "durationMinutes" INT NOT NULL DEFAULT 15');
  // online payment state, written only by the payment webhook/verify/refund flow (see paymentModel.js) -
  // never by editAppointment/createAppointment, so admin-managed booking status is unaffected
  await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("paymentStatus" IN ('pending','paid','failed','partially_refunded','refunded'))`);
  await query('CREATE INDEX IF NOT EXISTS appointments_payment_status_idx ON appointments ("paymentStatus")');
  // appointments paid before payment confirmed the booking automatically
  await query(`UPDATE appointments SET status = 'confirmed' WHERE "paymentStatus" = 'paid' AND status = 'pending'`);
  // appointments made before fee snapshots existed: use the doctor's current fee once
  await query('UPDATE appointments a SET fee = d.fee FROM doctors d WHERE d.id = a."doctorId" AND a.fee IS NULL');
  await query('CREATE INDEX IF NOT EXISTS appointments_doctor_time_idx ON appointments ("doctorId", "scheduledAt")');
  // display ID (CNAP-001, CNAP-002...): numbered in the order rows were created, from a sequence so a
  // deleted row's number is never reused. The column default numbers every future insert.
  await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS code TEXT`);
  await query(`CREATE SEQUENCE IF NOT EXISTS appointment_no_seq`);
  const { rows: uncoded } = await query(`SELECT id FROM appointments WHERE code IS NULL ORDER BY "createdAt", id`);
  for (const { id } of uncoded) {
    await query(`UPDATE appointments SET code = 'CNAP-' || lpad(nextval('appointment_no_seq')::text, 3, '0') WHERE id = $1`, [id]);
  }
  await query(`ALTER TABLE appointments ALTER COLUMN code SET DEFAULT 'CNAP-' || lpad(nextval('appointment_no_seq')::text, 3, '0')`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS appointments_code_key ON appointments (code)`);
  // last line of defence against double booking (bookings also take a per-doctor lock, see config/booking.js)
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_key
       ON appointments ("doctorId", "scheduledAt") WHERE status <> 'cancelled'`
    );
  } catch (error) {
    console.log(`Could not create unique slot index (duplicate bookings already exist?): ${error.message}`);
  }
};

// joined with patient + doctor (same idea as .populate())
const selectAppointment = `
  SELECT a.*, p.name AS "patientName", p.code AS "patientCode", p.email AS "patientEmail", p.phone AS "patientPhone", d.name AS "doctorName", d.specialty AS "doctorSpecialty",
    d.photo AS "doctorPhoto"
  FROM appointments a
  JOIN patients p ON p.id = a."patientId"
  JOIN doctors d ON d.id = a."doctorId"
`;

export const findAppointments = async () => {
  const { rows } = await query(`${selectAppointment} ORDER BY a."scheduledAt" DESC`);
  return rows;
};

export const findAppointmentsByPatient = async (patientId) => {
  const { rows } = await query(`${selectAppointment} WHERE a."patientId" = $1 ORDER BY a."scheduledAt" DESC`, [patientId]);
  return rows;
};

// `db` is the pool's query or a transaction client (see config/booking.js)
export const findAppointmentById = async (id, db = { query }) => {
  const { rows } = await db.query(`${selectAppointment} WHERE a.id = $1`, [id]);
  return rows[0];
};

// Appointments whose "`minutesBefore` minutes before the slot" reminder is due now (see
// config/reminders.js). Only paid, still-upcoming, not cancelled/completed appointments qualify.
//
// Two guards keep the wording honest:
//   * windowMinutes bounds how LATE the reminder may still go out, so a sweep catching up after
//     downtime can not send "your appointment is tomorrow" when it is an hour away. A reminder
//     older than its window is simply dropped - the next, shorter one still arrives.
//   * the createdAt / rescheduledAt conditions drop a reminder that never made sense: an
//     appointment booked (or moved) 2 hours before its slot was never 1 day away.
export const findAppointmentsDueForReminder = async (minutesBefore, windowMinutes) => {
  const { rows } = await query(
    `${selectAppointment}
     WHERE a.status IN ('pending','confirmed')
       AND a."paymentStatus" = 'paid'
       AND a."scheduledAt" <= now() + ($1 * interval '1 minute')
       AND a."scheduledAt" > now() + (($1 - $2) * interval '1 minute')
       AND a."createdAt" <= a."scheduledAt" - ($1 * interval '1 minute')
       AND (a."rescheduledAt" IS NULL OR a."rescheduledAt" <= a."scheduledAt" - ($1 * interval '1 minute'))
     ORDER BY a."scheduledAt"`,
    [minutesBefore, windowMinutes]
  );
  return rows;
};

// plain edit (status / notes / patient): fee and duration are never touched
export const updateAppointmentById = async (id, a) => {
  const { rows } = await query(
    `UPDATE appointments SET "patientId" = $1, "doctorId" = $2, "scheduledAt" = $3,
       status = $4, notes = $5, "updatedAt" = now()
     WHERE id = $6 RETURNING id`,
    [a.patientId, a.doctorId, a.scheduledAt, a.status, a.notes, id]
  );
  if (!rows[0]) return undefined;
  return findAppointmentById(id);
};

export const recordReschedule = async (id, { reason, previousScheduledAt }) => {
  await query(
    `UPDATE appointments SET "rescheduleReason" = $1, "rescheduledAt" = now(), "previousScheduledAt" = $2,
       "rescheduleCount" = "rescheduleCount" + 1 WHERE id = $3`,
    [reason, previousScheduledAt, id]
  );
  return findAppointmentById(id);
};

// Keeps display IDs gap-free: CNAP-001... in the order appointments were created, so after a delete
// the later ones move up. Codes go through a temporary value first because the unique index is
// checked row by row. The sequence is reset so the next booking continues from the last number.
export const renumberAppointmentCodes = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE appointments IN SHARE ROW EXCLUSIVE MODE");
    await client.query(`UPDATE appointments SET code = 'TMP-' || id`);
    await client.query(
      `UPDATE appointments a SET code = 'CNAP-' || lpad(n.rn::text, 3, '0')
       FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn FROM appointments) n
       WHERE a.id = n.id`
    );
    await client.query(`SELECT setval('appointment_no_seq', GREATEST((SELECT count(*) FROM appointments), 1), (SELECT count(*) > 0 FROM appointments))`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Only appointments with a successful payment are kept. A booking holds its slot while the patient
// is paying, so unpaid ones are removed only after `graceMinutes`; one with a captured payment row
// is never touched, even if its paymentStatus has not caught up yet. Returns the number removed.
export const deleteUnpaidAppointments = async (graceMinutes = 30) => {
  const { rowCount } = await query(
    `DELETE FROM appointments a
     WHERE a."paymentStatus" IN ('pending','failed')
       AND a."createdAt" < now() - ($1 * interval '1 minute')
       AND NOT EXISTS (
         SELECT 1 FROM payments p
         WHERE p."appointmentId" = a.id AND p.status IN ('captured','partially_refunded','refunded')
       )`,
    [graceMinutes]
  );
  if (rowCount) await renumberAppointmentCodes();
  return rowCount;
};

export const deleteAppointmentById =async (id) => {
  const { rows } = await query("DELETE FROM appointments WHERE id = $1 RETURNING id", [id]);
  if (rows[0]) await renumberAppointmentCodes();
  return rows[0];
};
