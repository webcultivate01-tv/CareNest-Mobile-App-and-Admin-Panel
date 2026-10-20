import { query } from "../config/database.js";

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
};

export const findDoctors = async () => {
  const { rows } = await query('SELECT * FROM doctors ORDER BY "createdAt" DESC');
  return rows;
};

export const findDoctorById = async (id) => {
  const { rows } = await query("SELECT * FROM doctors WHERE id = $1", [id]);
  return rows[0];
};

export const insertDoctor = async (d) => {
  const { rows } = await query(
    `INSERT INTO doctors (name, specialty, email, phone, "experienceYears", fee, "isAvailable")
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [d.name, d.specialty, d.email, d.phone, d.experienceYears, d.fee, d.isAvailable]
  );
  return rows[0];
};

export const updateDoctorById = async (id, d) => {
  const { rows } = await query(
    `UPDATE doctors SET name = $1, specialty = $2, email = $3, phone = $4,
       "experienceYears" = $5, fee = $6, "isAvailable" = $7, "updatedAt" = now()
     WHERE id = $8 RETURNING *`,
    [d.name, d.specialty, d.email, d.phone, d.experienceYears, d.fee, d.isAvailable, id]
  );
  return rows[0];
};

export const deleteDoctorById = async (id) => {
  const { rows } = await query("DELETE FROM doctors WHERE id = $1 RETURNING id", [id]);
  return rows[0];
};
