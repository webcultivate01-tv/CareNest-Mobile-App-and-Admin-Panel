import { query } from "../config/database.js";

// Hospital-wide OPD booking rules, one row (id = 1). See config/booking.js for how they apply.
//   "dailyLimit" = most OPD appointments the hospital takes per day, all doctors together (NULL = no limit)
//   "cutoffTime" = clinic time after which no more appointments are taken for TODAY (NULL = no cutoff)
export const createBookingSettingsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS booking_settings (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      "dailyLimit" INT CHECK ("dailyLimit" > 0),
      "cutoffTime" TIME,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query("INSERT INTO booking_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
};

// `db` is the pool's query or a transaction client (see config/booking.js)
export const findBookingSettings = async (db = { query }) => {
  const { rows } = await db.query(
    `SELECT "dailyLimit", to_char("cutoffTime", 'HH24:MI') AS "cutoffTime", "updatedAt" FROM booking_settings WHERE id = 1`
  );
  return rows[0] || { dailyLimit: null, cutoffTime: null };
};

export const updateBookingSettings = async ({ dailyLimit, cutoffTime }) => {
  await query(`UPDATE booking_settings SET "dailyLimit" = $1, "cutoffTime" = $2, "updatedAt" = now() WHERE id = 1`, [
    dailyLimit,
    cutoffTime,
  ]);
  return findBookingSettings();
};
