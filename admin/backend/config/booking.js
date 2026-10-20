import { pool, query } from "./database.js";
import { findAppointmentById } from "../model/appointmentModel.js";

// Slot generation + booking rules. Used by the admin panel AND the patient app, so the
// same checks run no matter who books. Everything is computed live from the database,
// so schedule / leave / status changes show up on the very next request.
//
// Schedule times ("09:00") are the clinic's wall-clock time in CLINIC_TIMEZONE.

const clinicZone = () => process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const zoneParts = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: clinicZone(),
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    asUtc: Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  };
};

// today's date at the clinic, YYYY-MM-DD
export const clinicToday = () => zoneParts(new Date()).date;

// the clinic's date (YYYY-MM-DD) and minutes-since-midnight for a moment in time
export const clinicDateOf = (instant) => zoneParts(instant);

// "2026-10-24" + minutes since midnight at the clinic -> a real Date (UTC instant)
export const clinicTime = (dateStr, minutes) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = zoneParts(new Date(guess)).asUtc - guess;
  return new Date(guess - offset);
};

export const isValidDateString = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || "");
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCFullYear() === Number(m[1]) && date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
};

export const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart;

// Free slots for a doctor on one day: [{ time: "09:15", startsAt: ISO string }].
// Applies weekly shifts, breaks, date exceptions (full / partial day), existing appointments
// and hides slots that have already started. excludeId = an appointment being moved.
export const getDaySlots = async (doctor, dateStr, { db = { query }, excludeId = null } = {}) => {
  if (!doctor.isAvailable) return [];

  const duration = doctor.appointmentDuration;
  const weekday = weekdayOf(dateStr);

  const [rules, exceptions] = await Promise.all([
    db.query(
      `SELECT kind, to_char("startTime", 'HH24:MI') AS start, to_char("endTime", 'HH24:MI') AS "end"
       FROM doctor_schedule WHERE "doctorId" = $1 AND weekday = $2`,
      [doctor.id, weekday]
    ),
    db.query(
      `SELECT "fullDay", to_char("startTime", 'HH24:MI') AS start, to_char("endTime", 'HH24:MI') AS "end"
       FROM doctor_exceptions WHERE "doctorId" = $1 AND date = $2`,
      [doctor.id, dateStr]
    ),
  ]);

  if (exceptions.rows.some((e) => e.fullDay)) return [];

  const shifts = rules.rows.filter((r) => r.kind === "shift");
  if (shifts.length === 0) return [];

  // everything that blocks a slot, as minute ranges
  const blocked = [
    ...rules.rows.filter((r) => r.kind === "break"),
    ...exceptions.rows.filter((e) => !e.fullDay),
  ].map((r) => [toMinutes(r.start), toMinutes(r.end)]);

  const dayStart = clinicTime(dateStr, 0);
  const dayEnd = clinicTime(addDays(dateStr, 1), 0);
  const booked = await db.query(
    `SELECT "scheduledAt", "durationMinutes" FROM appointments
     WHERE "doctorId" = $1 AND status <> 'cancelled' AND id <> $2
       AND "scheduledAt" < $4 AND "scheduledAt" + ("durationMinutes" * interval '1 minute') > $3`,
    [doctor.id, excludeId || 0, dayStart, dayEnd]
  );
  const bookedRanges = booked.rows.map((a) => {
    const start = new Date(a.scheduledAt).getTime();
    return [start, start + a.durationMinutes * 60000];
  });

  const now = Date.now();
  const seen = new Set();
  const slots = [];
  for (const shift of shifts) {
    const end = toMinutes(shift.end);
    for (let t = toMinutes(shift.start); t + duration <= end; t += duration) {
      if (seen.has(t)) continue;
      if (blocked.some(([bStart, bEnd]) => overlaps(t, t + duration, bStart, bEnd))) continue;

      const startsAt = clinicTime(dateStr, t);
      const startMs = startsAt.getTime();
      if (startMs <= now) continue;
      if (bookedRanges.some(([bStart, bEnd]) => overlaps(startMs, startMs + duration * 60000, bStart, bEnd))) continue;

      seen.add(t);
      slots.push({ time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, startsAt: startsAt.toISOString(), minutes: t });
    }
  }
  return slots.sort((a, b) => a.minutes - b.minutes).map(({ time, startsAt }) => ({ time, startsAt }));
};

// Book (no id) or move (id given) an appointment, safely:
//  - one transaction, with a lock per doctor so two requests can not pass the check together
//  - slot is re-validated against schedule / leave / bookings on the server
//  - fee + duration are copied from the doctor at booking time (kept if only the time-slot of the
//    same doctor changes, refreshed if the doctor changes)
export const saveAppointment = async ({ id = null, patientId, doctorId, scheduledAt, status, notes }) => {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) throw new BookingError("Choose a valid appointment time");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [Number(doctorId)]);

    const { rows } = await client.query("SELECT * FROM doctors WHERE id = $1", [doctorId]);
    const doctor = rows[0];
    if (!doctor) throw new BookingError("Doctor is not found", 404);
    if (!doctor.isAvailable) throw new BookingError("This doctor is not accepting appointments right now");

    const patient = await client.query("SELECT id FROM patients WHERE id = $1", [patientId]);
    if (!patient.rows[0]) throw new BookingError("Patient is not found", 404);

    const { date } = clinicDateOf(instant);
    const slots = await getDaySlots(doctor, date, { db: client, excludeId: id });
    if (!slots.some((s) => new Date(s.startsAt).getTime() === instant.getTime())) {
      throw new BookingError("This time slot is not available. Please choose another slot.", 409);
    }

    let savedId;
    if (id) {
      const old = await client.query('SELECT "doctorId", fee, "durationMinutes" FROM appointments WHERE id = $1', [id]);
      const sameDoctor = old.rows[0] && old.rows[0].doctorId === doctor.id;
      const result = await client.query(
        `UPDATE appointments SET "patientId" = $1, "doctorId" = $2, "scheduledAt" = $3, status = $4, notes = $5,
           fee = $6, "durationMinutes" = $7, "updatedAt" = now()
         WHERE id = $8 RETURNING id`,
        [
          patientId,
          doctor.id,
          instant,
          status,
          notes,
          sameDoctor ? old.rows[0].fee : doctor.fee,
          doctor.appointmentDuration,
          id,
        ]
      );
      savedId = result.rows[0]?.id;
    } else {
      const result = await client.query(
        `INSERT INTO appointments ("patientId", "doctorId", "scheduledAt", status, notes, fee, "durationMinutes")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [patientId, doctor.id, instant, status, notes, doctor.fee, doctor.appointmentDuration]
      );
      savedId = result.rows[0].id;
    }

    const appointment = savedId ? await findAppointmentById(savedId, client) : undefined;
    await client.query("COMMIT");
    return appointment;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw new BookingError("This time slot was just booked. Please choose another slot.", 409);
    throw error;
  } finally {
    client.release();
  }
};
