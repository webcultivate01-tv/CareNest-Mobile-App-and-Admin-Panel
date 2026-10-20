import { query } from "../config/database.js";

export const getStats = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        (SELECT count(*) FROM doctors)::int AS doctors,
        (SELECT count(*) FROM patients)::int AS patients,
        (SELECT count(*) FROM appointments)::int AS appointments,
        (SELECT count(*) FROM appointments WHERE status = 'pending')::int AS pending,
        (SELECT count(*) FROM appointments WHERE "scheduledAt"::date = current_date)::int AS today
    `);
    return res.status(200).json(rows[0]);
  } catch (error) {
    return res.status(500).json({ message: `GetStats error ${error.message}` });
  }
};
