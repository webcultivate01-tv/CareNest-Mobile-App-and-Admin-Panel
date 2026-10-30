import { query } from "../config/database.js";
import { DEFAULT_MODULES } from "../config/modules.js";

// role: "admin" (exactly one, the owner of the panel), "subadmin" or "staff"
// photo: path like "uploads/subadmins/Subadmin 1/profile-4-1792510081361.jpg" (see config/photos.js)
// permissions: module keys a sub-admin may open (config/modules.js); ignored for the admin
const PUBLIC_FIELDS = `id, name, email, phone, role, code, "isBlocked", photo, permissions, "createdAt", "updatedAt"`;

export const createAdminTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Admin',
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'subadmin',
      "isBlocked" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // older databases were created before phone / roles / blocking existed
  await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone TEXT`);
  await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'subadmin'`);
  await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS photo TEXT`); // path under uploads/
  // display ID: owner is CNA-001, sub-admins are CNSA-001, CNSA-002... (from a sequence, so a
  // deleted sub-admin's number is never handed to someone else)
  await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS code TEXT`);
  // existing sub-admins keep the sections they already had
  await query(
    `ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{${DEFAULT_MODULES.join(",")}}'`
  );
  await query(`CREATE SEQUENCE IF NOT EXISTS admin_subadmin_no_seq`);
  await query(`CREATE SEQUENCE IF NOT EXISTS admin_staff_no_seq`); // staff are CNST-001, CNST-002...
  await ensurePrimaryAdmin();
  await backfillAdminCodes();
};

const backfillAdminCodes = async () => {
  await query(`UPDATE admins SET code = 'CNA-001' WHERE role = 'admin'`);
  const { rows } = await query(`SELECT id FROM admins WHERE role = 'subadmin' AND code IS NULL ORDER BY id`);
  for (const { id } of rows) {
    await query(
      `UPDATE admins SET code = 'CNSA-' || lpad(nextval('admin_subadmin_no_seq')::text, 3, '0') WHERE id = $1`,
      [id]
    );
  }
  const staff = await query(`SELECT id FROM admins WHERE role = 'staff' AND code IS NULL ORDER BY id`);
  for (const { id } of staff.rows) {
    await query(`UPDATE admins SET code = 'CNST-' || lpad(nextval('admin_staff_no_seq')::text, 3, '0') WHERE id = $1`, [id]);
  }
};

// the oldest account becomes the admin when no admin exists yet
export const ensurePrimaryAdmin = async () => {
  await query(`
    UPDATE admins SET role = 'admin', "isBlocked" = false
    WHERE id = (SELECT id FROM admins ORDER BY "createdAt", id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM admins WHERE role = 'admin')
  `);
};

export const findAdminByEmail = async (email) => {
  const { rows } = await query("SELECT * FROM admins WHERE email = $1", [email]);
  return rows[0];
};

export const findAdminById = async (id) => {
  const { rows } = await query(`SELECT ${PUBLIC_FIELDS} FROM admins WHERE id = $1`, [id]);
  return rows[0];
};

export const findAdminWithPasswordById = async (id) => {
  const { rows } = await query("SELECT * FROM admins WHERE id = $1", [id]);
  return rows[0];
};

export const findAdmins = async () => {
  const { rows } = await query(
    `SELECT ${PUBLIC_FIELDS} FROM admins ORDER BY (role = 'admin') DESC, "createdAt" ASC`
  );
  return rows;
};

export const insertAdmin = async (name, email, password, phone, permissions, role = "subadmin") => {
  const { rows } = await query(
    `INSERT INTO admins (name, email, password, phone, role, code, permissions)
     VALUES ($1, $2, $3, $4, $6,
       CASE WHEN $6 = 'staff' THEN 'CNST-' || lpad(nextval('admin_staff_no_seq')::text, 3, '0')
            ELSE 'CNSA-' || lpad(nextval('admin_subadmin_no_seq')::text, 3, '0') END, $5)
     RETURNING ${PUBLIC_FIELDS}`,
    [name, email, password, phone || null, permissions, role]
  );
  return rows[0];
};

export const updateAdminPermissions = async (id, permissions) => {
  const { rows } = await query(
    `UPDATE admins SET permissions = $1, "updatedAt" = now()
     WHERE id = $2 AND role <> 'admin' RETURNING ${PUBLIC_FIELDS}`,
    [permissions, id]
  );
  return rows[0];
};

// phone undefined keeps the current number, "" clears it
export const updateAdminById = async (id, name, email, phone) => {
  const { rows } = await query(
    `UPDATE admins SET name = $1, email = $2,
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END, "updatedAt" = now()
     WHERE id = $5 RETURNING ${PUBLIC_FIELDS}`,
    [name, email, phone !== undefined, phone || null, id]
  );
  return rows[0];
};

export const updateAdminBlocked = async (id, isBlocked) => {
  const { rows } = await query(
    `UPDATE admins SET "isBlocked" = $1, "updatedAt" = now()
     WHERE id = $2 AND role <> 'admin' RETURNING ${PUBLIC_FIELDS}`,
    [isBlocked, id]
  );
  return rows[0];
};

export const updateAdminPassword = async (id, password) => {
  const { rows } = await query(
    `UPDATE admins SET password = $1, "updatedAt" = now() WHERE id = $2 RETURNING id`,
    [password, id]
  );
  return rows[0];
};

export const deleteAdminById = async (id) => {
  const { rows } = await query(
    "DELETE FROM admins WHERE id = $1 AND role <> 'admin' RETURNING id, photo",
    [id]
  );
  return rows[0];
};

// photo = relative path under uploads/, or null to remove
export const setAdminPhoto = async (id, photo) => {
  const { rows } = await query(
    `UPDATE admins SET photo = $1, "updatedAt" = now() WHERE id = $2 RETURNING ${PUBLIC_FIELDS}`,
    [photo, id]
  );
  return rows[0];
};

// phone omitted keeps the current number on an existing account
export const upsertAdmin = async (name, email, password, phone) => {
  const { rows } = await query(
    `INSERT INTO admins (name, email, password, phone) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password,
       phone = COALESCE(EXCLUDED.phone, admins.phone), "updatedAt" = now()
     RETURNING id, name, email`,
    [name, email, password, phone || null]
  );
  return rows[0];
};

// a staff account is created once; re-seeding only resets its password
export const upsertStaff = async (name, email, password, phone, permissions) => {
  const existing = await findAdminByEmail(email);
  if (existing) {
    await updateAdminPassword(existing.id, password);
    return existing;
  }
  return insertAdmin(name, email, password, phone, permissions, "staff");
};
