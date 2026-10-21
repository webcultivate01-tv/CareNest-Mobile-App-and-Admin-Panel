import { query } from "../config/database.js";

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
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "durationMinutes" INT NOT NULL DEFAULT 15');
  // online payment state, written only by the payment webhook/verify/refund flow (see paymentModel.js) -
  // never by editAppointment/createAppointment, so admin-managed booking status is unaffected
  await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("paymentStatus" IN ('pending','paid','failed','partially_refunded','refunded'))`);
  await query('CREATE INDEX IF NOT EXISTS appointments_payment_status_idx ON appointments ("paymentStatus")');
  // appointments made before fee snapshots existed: use the doctor's current fee once
  await query('UPDATE appointments a SET fee = d.fee FROM doctors d WHERE d.id = a."doctorId" AND a.fee IS NULL');
  await query('CREATE INDEX IF NOT EXISTS appointments_doctor_time_idx ON appointments ("doctorId", "scheduledAt")');
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
  SELECT a.*, p.name AS "patientName", d.name AS "doctorName", d.specialty AS "doctorSpecialty",
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

export const deleteAppointmentById = async (id) => {
  const { rows } = await query("DELETE FROM appointments WHERE id = $1 RETURNING id", [id]);
  return rows[0];
};
