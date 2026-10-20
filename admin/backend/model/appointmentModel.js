import { query } from "../config/database.js";

export const appointmentStatuses = ["pending", "confirmed", "completed", "cancelled"];

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
};

// joined with patient + doctor (same idea as .populate())
const selectAppointment = `
  SELECT a.*, p.name AS "patientName", d.name AS "doctorName", d.specialty AS "doctorSpecialty"
  FROM appointments a
  JOIN patients p ON p.id = a."patientId"
  JOIN doctors d ON d.id = a."doctorId"
`;

export const findAppointments = async () => {
  const { rows } = await query(`${selectAppointment} ORDER BY a."scheduledAt" DESC`);
  return rows;
};

export const findAppointmentById = async (id) => {
  const { rows } = await query(`${selectAppointment} WHERE a.id = $1`, [id]);
  return rows[0];
};

export const insertAppointment = async (a) => {
  const { rows } = await query(
    `INSERT INTO appointments ("patientId", "doctorId", "scheduledAt", status, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [a.patientId, a.doctorId, a.scheduledAt, a.status, a.notes]
  );
  return findAppointmentById(rows[0].id);
};

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
