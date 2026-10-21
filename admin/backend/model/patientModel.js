import { query } from "../config/database.js";

// never send the password hash to the admin panel / app (phone = mobile number)
const publicColumns = `id, name, email, phone, code, to_char(dob, 'DD/MM/YYYY') AS dob, photo, "createdAt", "updatedAt"`;

export const createPatientTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // columns used by the mobile app sign up
  await query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob DATE");
  await query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS password TEXT");
  await query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS photo TEXT"); // path under uploads/
  await query(
    "CREATE UNIQUE INDEX IF NOT EXISTS patients_phone_key ON patients (phone) WHERE phone IS NOT NULL"
  );
  await query(
    "CREATE UNIQUE INDEX IF NOT EXISTS patients_email_key ON patients (lower(email)) WHERE email IS NOT NULL"
  );
  // display ID (CNP-001, CNP-002...): numbered in the order rows were created, from a sequence so a
  // deleted row's number is never reused. The column default numbers every future insert.
  await query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS code TEXT`);
  await query(`CREATE SEQUENCE IF NOT EXISTS patient_no_seq`);
  const { rows: uncoded } = await query(`SELECT id FROM patients WHERE code IS NULL ORDER BY "createdAt", id`);
  for (const { id } of uncoded) {
    await query(`UPDATE patients SET code = 'CNP-' || lpad(nextval('patient_no_seq')::text, 3, '0') WHERE id = $1`, [id]);
  }
  await query(`ALTER TABLE patients ALTER COLUMN code SET DEFAULT 'CNP-' || lpad(nextval('patient_no_seq')::text, 3, '0')`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS patients_code_key ON patients (code)`);
};

export const findPatients = async () => {
  const { rows } = await query(`SELECT ${publicColumns} FROM patients ORDER BY "createdAt" DESC`);
  return rows;
};

export const findPatientById = async (id) => {
  const { rows } = await query(`SELECT ${publicColumns} FROM patients WHERE id = $1`, [id]);
  return rows[0];
};

export const insertPatient = async (p) => {
  const { rows } = await query(
    `INSERT INTO patients (name, email, phone) VALUES ($1, $2, $3) RETURNING ${publicColumns}`,
    [p.name, p.email, p.phone]
  );
  return rows[0];
};

export const updatePatientById = async (id, p) => {
  const { rows } = await query(
    `UPDATE patients SET name = $1, email = $2, phone = $3, "updatedAt" = now()
     WHERE id = $4 RETURNING ${publicColumns}`,
    [p.name, p.email, p.phone, id]
  );
  return rows[0];
};

export const deletePatientById = async (id) => {
  const { rows } = await query("DELETE FROM patients WHERE id = $1 RETURNING id, photo", [id]);
  return rows[0];
};

// ---- mobile app (sign up / login) ----

// identifier = mobile number or email; returns the row WITH password hash
export const findPatientForLogin = async (identifier) => {
  const { rows } = await query(
    "SELECT * FROM patients WHERE phone = $1 OR lower(email) = lower($1) LIMIT 1",
    [identifier]
  );
  return rows[0];
};

export const findPatientByPhoneOrEmail = async (phone, email) => {
  const { rows } = await query(
    "SELECT id FROM patients WHERE phone = $1 OR ($2::text IS NOT NULL AND lower(email) = lower($2)) LIMIT 1",
    [phone, email]
  );
  return rows[0];
};

// dob comes in as DD/MM/YYYY (same format the app shows)
export const insertPatientUser = async (u) => {
  const { rows } = await query(
    `INSERT INTO patients (name, email, phone, dob, password)
     VALUES ($1, $2, $3, to_date($4, 'DD/MM/YYYY'), $5) RETURNING ${publicColumns}`,
    [u.name, u.email, u.phone, u.dob, u.password]
  );
  return rows[0];
};

// mobile app profile edit (email can not be changed here)
export const updatePatientProfile = async (id, u) => {
  const { rows } = await query(
    `UPDATE patients SET name = $1, phone = $2, dob = to_date($3, 'DD/MM/YYYY'), "updatedAt" = now()
     WHERE id = $4 RETURNING ${publicColumns}`,
    [u.name, u.phone, u.dob, id]
  );
  return rows[0];
};

export const findPatientByPhoneExcept = async (phone, id) => {
  const { rows } = await query("SELECT id FROM patients WHERE phone = $1 AND id <> $2 LIMIT 1", [phone, id]);
  return rows[0];
};

// photo = path like "uploads/patients/Tejas Mehar/profile-3-1792510081361.jpg", or null to remove
export const setPatientPhoto = async (id, photo) => {
  const { rows } = await query(
    `UPDATE patients SET photo = $1, "updatedAt" = now() WHERE id = $2 RETURNING ${publicColumns}`,
    [photo, id]
  );
  return rows[0];
};
