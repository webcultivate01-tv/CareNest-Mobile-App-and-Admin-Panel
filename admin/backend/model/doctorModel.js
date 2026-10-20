import { pool, query } from "../config/database.js";

// doctors.specialty  = specialization shown in the app
// doctors.isAvailable = Active (true) / Inactive (false); only active doctors can be booked
// doctors.fee         = this doctor's own consultation fee (appointments keep a copy, see appointmentModel.js)
// doctors.photo       = path like "uploads/doctors/Dr Amit/profile-3-123.jpg" (see config/photos.js)
export const createDoctorTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS doctors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      "experienceYears" INT NOT NULL DEFAULT 0,
      fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      "isAvailable" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query("ALTER TABLE doctors ADD COLUMN IF NOT EXISTS photo TEXT");
  await query("ALTER TABLE doctors ADD COLUMN IF NOT EXISTS qualifications TEXT");
  await query('ALTER TABLE doctors ADD COLUMN IF NOT EXISTS "appointmentDuration" INT NOT NULL DEFAULT 15');

  // weekly schedule: one row per shift or break. weekday 0 = Sunday ... 6 = Saturday.
  // A day with no "shift" rows is a day off. Several shifts on one day = several rows.
  await query(`
    CREATE TABLE IF NOT EXISTS doctor_schedule (
      id SERIAL PRIMARY KEY,
      "doctorId" INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      kind TEXT NOT NULL CHECK (kind IN ('shift','break')),
      "startTime" TIME NOT NULL,
      "endTime" TIME NOT NULL,
      CHECK ("endTime" > "startTime")
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS doctor_schedule_doctor_idx ON doctor_schedule ("doctorId", weekday)');

  // date-specific leave. fullDay = whole day off, otherwise only startTime-endTime is blocked.
  await query(`
    CREATE TABLE IF NOT EXISTS doctor_exceptions (
      id SERIAL PRIMARY KEY,
      "doctorId" INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      "fullDay" BOOLEAN NOT NULL DEFAULT true,
      "startTime" TIME,
      "endTime" TIME,
      reason TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ("fullDay" OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "endTime" > "startTime"))
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS doctor_exceptions_doctor_date_idx ON doctor_exceptions ("doctorId", date)');
};

const timeText = (column) => `to_char(${column}, 'HH24:MI')`;

export const findDoctors = async (search) => {
  const text = search && search.trim() ? `%${search.trim()}%` : null;
  const { rows } = await query(
    `SELECT * FROM doctors
     WHERE $1::text IS NULL OR name ILIKE $1 OR specialty ILIKE $1
     ORDER BY "createdAt" DESC`,
    [text]
  );
  return rows;
};

export const findDoctorById = async (id) => {
  const { rows } = await query("SELECT * FROM doctors WHERE id = $1", [id]);
  return rows[0];
};

export const insertDoctor = async (d) => {
  const { rows } = await query(
    `INSERT INTO doctors (name, specialty, qualifications, "experienceYears", fee, "appointmentDuration", "isAvailable")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.name, d.specialty, d.qualifications, d.experienceYears, d.fee, d.appointmentDuration, d.isAvailable]
  );
  return rows[0];
};

// email / phone columns are left untouched
export const updateDoctorById = async (id, d) => {
  const { rows } = await query(
    `UPDATE doctors SET name = $1, specialty = $2, qualifications = $3, "experienceYears" = $4,
       fee = $5, "appointmentDuration" = $6, "isAvailable" = $7, "updatedAt" = now()
     WHERE id = $8 RETURNING *`,
    [d.name, d.specialty, d.qualifications, d.experienceYears, d.fee, d.appointmentDuration, d.isAvailable, id]
  );
  return rows[0];
};

export const setDoctorPhoto = async (id, photo) => {
  const { rows } = await query('UPDATE doctors SET photo = $1, "updatedAt" = now() WHERE id = $2 RETURNING *', [photo, id]);
  return rows[0];
};

export const setDoctorStatus = async (id, isAvailable) => {
  const { rows } = await query('UPDATE doctors SET "isAvailable" = $1, "updatedAt" = now() WHERE id = $2 RETURNING *', [
    isAvailable,
    id,
  ]);
  return rows[0];
};

export const deleteDoctorById = async (id) => {
  const { rows } = await query("DELETE FROM doctors WHERE id = $1 RETURNING id, photo", [id]);
  return rows[0];
};

// ---- weekly schedule ----

// [{ weekday, kind, start: "09:00", end: "13:00" }]
export const findSchedule = async (doctorId) => {
  const { rows } = await query(
    `SELECT weekday, kind, ${timeText('"startTime"')} AS start, ${timeText('"endTime"')} AS "end"
     FROM doctor_schedule WHERE "doctorId" = $1 ORDER BY weekday, kind DESC, "startTime"`,
    [doctorId]
  );
  return rows;
};

// schedule rows for every doctor at once (for the list page), grouped by doctor id
export const findAllSchedules = async () => {
  const { rows } = await query(
    `SELECT "doctorId", weekday, kind, ${timeText('"startTime"')} AS start, ${timeText('"endTime"')} AS "end"
     FROM doctor_schedule ORDER BY weekday, kind DESC, "startTime"`
  );
  const byDoctor = {};
  for (const row of rows) (byDoctor[row.doctorId] ||= []).push(row);
  return byDoctor;
};

// replaces the whole weekly schedule in one transaction
export const replaceSchedule = async (doctorId, rows) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query('DELETE FROM doctor_schedule WHERE "doctorId" = $1', [doctorId]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO doctor_schedule ("doctorId", weekday, kind, "startTime", "endTime") VALUES ($1, $2, $3, $4, $5)`,
        [doctorId, r.weekday, r.kind, r.start, r.end]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ---- date-specific exceptions ----

const exceptionColumns = `id, "doctorId", to_char(date, 'YYYY-MM-DD') AS date, "fullDay",
  ${timeText('"startTime"')} AS "startTime", ${timeText('"endTime"')} AS "endTime", reason`;

// upcoming only (today onwards); `today` is the clinic's date as YYYY-MM-DD
export const findExceptions = async (doctorId, today) => {
  const { rows } = await query(
    `SELECT ${exceptionColumns} FROM doctor_exceptions
     WHERE "doctorId" = $1 AND date >= $2 ORDER BY date, "startTime" NULLS FIRST`,
    [doctorId, today]
  );
  return rows;
};

export const findExceptionById = async (doctorId, exceptionId) => {
  const { rows } = await query(`SELECT ${exceptionColumns} FROM doctor_exceptions WHERE "doctorId" = $1 AND id = $2`, [
    doctorId,
    exceptionId,
  ]);
  return rows[0];
};

export const insertException = async (doctorId, e) => {
  const { rows } = await query(
    `INSERT INTO doctor_exceptions ("doctorId", date, "fullDay", "startTime", "endTime", reason)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [doctorId, e.date, e.fullDay, e.startTime, e.endTime, e.reason]
  );
  return findExceptionById(doctorId, rows[0].id);
};

export const updateExceptionById = async (doctorId, exceptionId, e) => {
  const { rows } = await query(
    `UPDATE doctor_exceptions SET date = $1, "fullDay" = $2, "startTime" = $3, "endTime" = $4,
       reason = $5, "updatedAt" = now()
     WHERE "doctorId" = $6 AND id = $7 RETURNING id`,
    [e.date, e.fullDay, e.startTime, e.endTime, e.reason, doctorId, exceptionId]
  );
  if (!rows[0]) return undefined;
  return findExceptionById(doctorId, exceptionId);
};

export const deleteExceptionById = async (doctorId, exceptionId) => {
  const { rows } = await query('DELETE FROM doctor_exceptions WHERE "doctorId" = $1 AND id = $2 RETURNING id', [
    doctorId,
    exceptionId,
  ]);
  return rows[0];
};
