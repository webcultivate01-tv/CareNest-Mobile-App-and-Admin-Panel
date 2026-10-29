import { query } from "../config/database.js";

// never send the password hash to the admin panel / app (phone = mobile number)
const publicColumns = `id, name, email, phone, address, code, to_char(dob, 'DD/MM/YYYY') AS dob, photo, "marketingConsent", "createdAt", "updatedAt"`;

// where a marketing consent change came from (shown in the admin panel)
export const consentSources = ["app", "staff", "unsubscribe_link", "whatsapp_stop"];

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
  await query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT");
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
  // marketing consent (Marketing module): WhatsApp / SMS / email campaigns only go to patients who
  // agreed. Everyone starts as NOT agreed - consent is given in the app or recorded by staff.
  await query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMPTZ`);
  await query(`ALTER TABLE patients ADD COLUMN IF NOT EXISTS "marketingConsentSource" TEXT`);
};

export const findPatients = async () => {
  const { rows } = await query(`SELECT ${publicColumns} FROM patients ORDER BY "createdAt" ASC, id ASC`);
  return rows;
};

export const findPatientById = async (id) => {
  const { rows } = await query(`SELECT ${publicColumns} FROM patients WHERE id = $1`, [id]);
  return rows[0];
};

export const insertPatient = async (p) => {
  const { rows } = await query(
    `INSERT INTO patients (name, email, phone, dob, address)
     VALUES ($1, $2, $3, to_date($4, 'DD/MM/YYYY'), $5) RETURNING ${publicColumns}`,
    [p.name, p.email, p.phone, p.dob, p.address]
  );
  return rows[0];
};

export const updatePatientById = async (id, p) => {
  const { rows } = await query(
    `UPDATE patients SET name = $1, email = $2, phone = $3, dob = to_date($4, 'DD/MM/YYYY'), address = $5,
       "updatedAt" = now()
     WHERE id = $6 RETURNING ${publicColumns}`,
    [p.name, p.email, p.phone, p.dob, p.address, id]
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

// forgot password: the reset code is sent to the registered email only, never to a phone number.
// Returns the row WITH the password hash (the caller checks the account can actually sign in).
export const findPatientByEmail = async (email) => {
  const { rows } = await query("SELECT * FROM patients WHERE lower(email) = lower($1) LIMIT 1", [email]);
  return rows[0];
};

// the row WITH the password hash (findPatientById deliberately hides it) - used when a signed-in
// patient changes their password and the current one has to be checked
export const findPatientWithPasswordById = async (id) => {
  const { rows } = await query("SELECT * FROM patients WHERE id = $1", [id]);
  return rows[0];
};

export const setPatientPassword = async (id, passwordHash) => {
  const { rows } = await query(
    `UPDATE patients SET password = $1, "updatedAt" = now() WHERE id = $2 RETURNING ${publicColumns}`,
    [passwordHash, id]
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

// ---- marketing (see controllers/marketingController.js) ----

const clinicZone = () => process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

// the most patients one audience search returns; the panel says so when a filter matches more
export const AUDIENCE_LIMIT = 5000;

// f = filters already checked by the controller (numbers are numbers, dates are YYYY-MM-DD,
// enums are from the allowed list). A "visit" is a confirmed or completed appointment whose time
// has come - future bookings and cancellations do not count.
export const findAudience = async (f) => {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const visitedBy = (doctorSql) =>
    `EXISTS (SELECT 1 FROM appointments a ${doctorSql.join} WHERE a."patientId" = p.id AND a.status <> 'cancelled' AND ${doctorSql.where})`;

  if (f.search) {
    const like = add(`%${f.search.replace(/[\%_]/g, (c) => `\${c}`)}%`);
    where.push(`(p.name ILIKE ${like} OR p.code ILIKE ${like} OR p.phone ILIKE ${like} OR p.email ILIKE ${like})`);
  }
  if (f.ageMin !== null) where.push(`date_part('year', age(p.dob)) >= ${add(f.ageMin)}`);
  if (f.ageMax !== null) where.push(`date_part('year', age(p.dob)) <= ${add(f.ageMax)}`);
  if (f.joinedFrom) where.push(`(p."createdAt" AT TIME ZONE ${add(clinicZone())})::date >= ${add(f.joinedFrom)}::date`);
  if (f.joinedTo) where.push(`(p."createdAt" AT TIME ZONE ${add(clinicZone())})::date <= ${add(f.joinedTo)}::date`);
  if (f.visit) {
    if (f.visit.type === "never") where.push(`v."lastVisit" IS NULL`);
    if (f.visit.type === "within") where.push(`v."lastVisit" >= now() - make_interval(days => ${add(f.visit.days)}::int)`);
    if (f.visit.type === "over") where.push(`v."lastVisit" < now() - make_interval(days => ${add(f.visit.days)}::int)`);
  }
  if (f.doctorId) where.push(visitedBy({ join: "", where: `a."doctorId" = ${add(f.doctorId)}` }));
  if (f.specialty) {
    where.push(visitedBy({ join: `JOIN doctors d ON d.id = a."doctorId"`, where: `d.specialty = ${add(f.specialty)}` }));
  }
  if (f.appointmentStatus) {
    where.push(`EXISTS (SELECT 1 FROM appointments a WHERE a."patientId" = p.id AND a.status = ${add(f.appointmentStatus)})`);
  }
  if (f.reach === "phone") where.push(`NULLIF(trim(p.phone), '') IS NOT NULL`);
  if (f.reach === "email") where.push(`NULLIF(trim(p.email), '') IS NOT NULL`);
  if (f.reach === "app") where.push(`p.password IS NOT NULL`);
  if (f.consent === "yes") where.push(`p."marketingConsent"`);
  if (f.consent === "no") where.push(`NOT p."marketingConsent"`);

  const { rows } = await query(
    `WITH visits AS (
       SELECT a."patientId",
              max(a."scheduledAt") AS "lastVisit",
              count(*)::int AS visits
       FROM appointments a
       WHERE a.status IN ('confirmed', 'completed') AND a."scheduledAt" <= now()
       GROUP BY a."patientId"
     )
     SELECT p.id, p.code, p.name, p.phone, p.email, date_part('year', age(p.dob))::int AS age, p."createdAt",
            v."lastVisit", COALESCE(v.visits, 0) AS visits, (p.password IS NOT NULL) AS "hasApp",
            p."marketingConsent", p."marketingConsentAt", p."marketingConsentSource"
     FROM patients p
     LEFT JOIN visits v ON v."patientId" = p.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY p."createdAt" DESC, p.id DESC
     LIMIT ${AUDIENCE_LIMIT + 1}`,
    params
  );
  return { patients: rows.slice(0, AUDIENCE_LIMIT), truncated: rows.length > AUDIENCE_LIMIT };
};

// what a campaign needs to know about each selected patient
export const findPatientsForCampaign = async (ids) => {
  const { rows } = await query(
    `SELECT id, name, code, phone, email, "marketingConsent", (password IS NOT NULL) AS "hasApp"
     FROM patients WHERE id = ANY($1::int[])`,
    [ids]
  );
  return rows;
};

// returns the ids that actually changed
export const setMarketingConsent = async (ids, consent, source) => {
  const { rows } = await query(
    `UPDATE patients SET "marketingConsent" = $2, "marketingConsentAt" = now(), "marketingConsentSource" = $3
     WHERE id = ANY($1::int[]) AND "marketingConsent" <> $2 RETURNING id`,
    [ids, consent, source]
  );
  return rows.map((r) => r.id);
};

// a "STOP" reply on WhatsApp: numbers are stored as typed, so match on the last 10 digits
export const revokeConsentByPhone = async (digits, source) => {
  const { rows } = await query(
    `UPDATE patients SET "marketingConsent" = false, "marketingConsentAt" = now(), "marketingConsentSource" = $2
     WHERE "marketingConsent" AND length(regexp_replace(phone, '\D', '', 'g')) >= 10
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = right($1, 10)
     RETURNING id`,
    [String(digits).replace(/\D/g, ""), source]
  );
  return rows.map((r) => r.id);
};

// ---- admin patient profile page ----

// every payment attempt of one patient, newest first, with the appointment it was for
export const findPaymentsByPatient = async (patientId) => {
  const { rows } = await query(
    `SELECT p.id, p.amount, p.status, p.method, p."refundedAmount", p."failureReason", p."providerPaymentId",
       p."createdAt", p."capturedAt", a.id AS "appointmentId", a.code AS "appointmentCode", d.name AS "doctorName"
     FROM payments p
     JOIN appointments a ON a.id = p."appointmentId"
     JOIN doctors d ON d.id = a."doctorId"
     WHERE p."patientId" = $1
     ORDER BY COALESCE(p."capturedAt", p."createdAt") DESC`,
    [patientId]
  );
  return rows;
};
