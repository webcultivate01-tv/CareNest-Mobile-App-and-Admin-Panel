import { query } from "../config/database.js";

// Live queue = today's appointments walked through three timestamps, so the booking `status`
// column and its CHECK constraint stay untouched:
//   checkedInAt  patient arrived at the hospital   -> "waiting"
//   startedAt    doctor called the patient in      -> "in_consultation"
//   completedAt  consultation finished (status also becomes 'completed') -> "done"
// A booked appointment with none of them is "booked" (not arrived yet).
export const createQueueColumns = async () => {
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMPTZ');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ');
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ');
};

export const queueStateOf = (a) => {
  if (a.status === "completed") return "done";
  if (a.startedAt) return "in_consultation";
  if (a.checkedInAt) return "waiting";
  return "booked";
};

// every non-cancelled appointment in [from, to), oldest slot first
export const findQueueAppointments = async (from, to, doctorId = null) => {
  const { rows } = await query(
    `SELECT a.id, a.code, a."patientId", a."doctorId", a."scheduledAt", a.status, a."durationMinutes",
       a."checkedInAt", a."startedAt", a."completedAt",
       p.name AS "patientName", p.code AS "patientCode", p.phone AS "patientPhone",
       d.name AS "doctorName", d.specialty AS "doctorSpecialty"
     FROM appointments a
     JOIN patients p ON p.id = a."patientId"
     JOIN doctors d ON d.id = a."doctorId"
     WHERE a.status <> 'cancelled' AND a."scheduledAt" >= $1 AND a."scheduledAt" < $2
       AND ($3::int IS NULL OR a."doctorId" = $3)
     ORDER BY a."doctorId", a."scheduledAt", a.id`,
    [from, to, doctorId]
  );
  return rows;
};

export const markCheckedIn = async (id) => {
  const { rows } = await query(
    `UPDATE appointments SET "checkedInAt" = COALESCE("checkedInAt", now()), "updatedAt" = now()
     WHERE id = $1 AND status IN ('pending','confirmed') AND "startedAt" IS NULL RETURNING id`,
    [id]
  );
  return rows[0];
};

// call the patient in. The one-patient-at-a-time rule is enforced by the unique index below, so two
// staff members pressing "call next" together can not both succeed.
export const markStarted = async (id) => {
  const { rows } = await query(
    `UPDATE appointments SET "startedAt" = now(), "checkedInAt" = COALESCE("checkedInAt", now()),
       status = 'confirmed', "updatedAt" = now()
     WHERE id = $1 AND status IN ('pending','confirmed') AND "startedAt" IS NULL RETURNING id`,
    [id]
  );
  return rows[0];
};

export const markCompleted = async (id) => {
  const { rows } = await query(
    `UPDATE appointments SET status = 'completed', "completedAt" = now(), "updatedAt" = now()
     WHERE id = $1 AND "startedAt" IS NOT NULL AND status <> 'completed' RETURNING id`,
    [id]
  );
  return rows[0];
};

export const createQueueIndex = async () => {
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_in_consultation_key
       ON appointments ("doctorId") WHERE "startedAt" IS NOT NULL AND status NOT IN ('completed','cancelled')`
    );
  } catch (error) {
    console.log(`Could not create one-in-consultation index: ${error.message}`);
  }
};
