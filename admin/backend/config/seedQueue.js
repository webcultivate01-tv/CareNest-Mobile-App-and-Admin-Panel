import dotenv from "dotenv";
import { pool, query } from "./database.js";
import { clinicToday, clinicTime } from "./booking.js";

dotenv.config();

// sample patients; the phone numbers are fake and used to skip patients that already exist
const patients = [
  { name: "Rohan Mehta", phone: "9000000001", email: "rohan.mehta@example.com" },
  { name: "Anita Verma", phone: "9000000002", email: "anita.verma@example.com" },
  { name: "Suresh Patel", phone: "9000000003", email: "suresh.patel@example.com" },
  { name: "Kavya Nair", phone: "9000000004", email: "kavya.nair@example.com" },
  { name: "Imran Shaikh", phone: "9000000005", email: "imran.shaikh@example.com" },
  { name: "Meera Iyer", phone: "9000000006", email: "meera.iyer@example.com" },
  { name: "Arjun Singh", phone: "9000000007", email: "arjun.singh@example.com" },
  { name: "Pooja Desai", phone: "9000000008", email: "pooja.desai@example.com" },
];

// today's appointments: [patient index, doctor index, minutes since midnight, state]
// state: booked = not arrived, waiting = checked in, in = in consultation, done = completed
// (one "in" per doctor - the queue allows only one patient inside at a time)
const plan = [
  [0, 0, 9 * 60, "done"],
  [1, 0, 9 * 60 + 15, "in"],
  [2, 0, 9 * 60 + 30, "waiting"],
  [3, 0, 9 * 60 + 45, "booked"],
  [4, 1, 10 * 60, "in"],
  [5, 1, 10 * 60 + 30, "waiting"],
  [6, 2, 14 * 60, "waiting"],
  [7, 2, 14 * 60 + 15, "booked"],
];

// run with: npm run seed:queue  (adds today's sample appointments to the first doctors; needs doctors
// from npm run seed:doctors. Re-running adds a fresh set, so run it once.)
const seedQueue = async () => {
  try {
    const { rows: doctors } = await query("SELECT id, fee, \"appointmentDuration\" FROM doctors ORDER BY id LIMIT 3");
    if (doctors.length === 0) throw new Error("No doctors found - run npm run seed:doctors first");

    const ids = [];
    for (const p of patients) {
      const found = await query("SELECT id FROM patients WHERE phone = $1", [p.phone]);
      if (found.rows[0]) {
        ids.push(found.rows[0].id);
        continue;
      }
      const { rows } = await query(
        "INSERT INTO patients (name, email, phone) VALUES ($1, $2, $3) RETURNING id",
        [p.name, p.email, p.phone]
      );
      ids.push(rows[0].id);
    }

    const today = clinicToday();
    for (const [pi, di, minutes, state] of plan) {
      const doctor = doctors[di % doctors.length];
      const at = clinicTime(today, minutes);
      const started = state === "in" || state === "done";
      await query(
        `INSERT INTO appointments ("patientId", "doctorId", "scheduledAt", status, fee, "durationMinutes",
           "checkedInAt", "startedAt", "completedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ids[pi], doctor.id, at,
          state === "done" ? "completed" : "confirmed",
          doctor.fee, doctor.appointmentDuration || 15,
          state === "booked" ? null : at,
          started ? at : null,
          state === "done" ? new Date(at.getTime() + 10 * 60000) : null,
        ]
      );
    }
    console.log(`Queue seeded: ${plan.length} appointments for ${today}`);
  } catch (error) {
    console.log(`Seed queue error ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seedQueue();
