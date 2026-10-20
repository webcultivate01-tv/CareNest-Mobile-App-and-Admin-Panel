import { query } from "../config/database.js";

export const createAdminTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Admin',
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

export const findAdminByEmail = async (email) => {
  const { rows } = await query("SELECT * FROM admins WHERE email = $1", [email]);
  return rows[0];
};

export const findAdminById = async (id) => {
  const { rows } = await query(
    "SELECT id, name, email FROM admins WHERE id = $1",
    [id]
  );
  return rows[0];
};

export const upsertAdmin = async (name, email, password) => {
  const { rows } = await query(
    `INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()
     RETURNING id, name, email`,
    [name, email, password]
  );
  return rows[0];
};
