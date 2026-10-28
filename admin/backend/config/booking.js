import { pool, query } from "./database.js";
import { findAppointmentById } from "../model/appointmentModel.js";
import { findBookingSettings } from "../model/settingsModel.js";

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

// minutes since midnight -> "09:15"
export const toHHMM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// "13:30" -> "1:30 PM", for messages patients read
const formatClock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Hospital booking rules that close a whole day (admin sets them, see model/settingsModel.js):
//  - cutoffTime: after this clinic time no more appointments are taken for TODAY (other days stay open)
//  - doctorLimit / hospitalLimit: most appointments per day for this doctor / all doctors together
// Returns { code, message } or null. Pure, so it can be unit tested.
export const dayClosedReason = ({ dateStr, today, nowMinutes, cutoffTime, doctorBooked, doctorLimit, hospitalBooked, hospitalLimit }) => {
  if (cutoffTime && dateStr === today && nowMinutes >= toMinutes(cutoffTime)) {
    return { code: "cutoff", message: `Bookings for today closed at ${formatClock(cutoffTime)}. Please choose another day.` };
  }
  if (doctorLimit && doctorBooked >= doctorLimit) {
    return { code: "doctorFull", message: "This doctor is fully booked for this day. Please choose another day." };
  }
  if (hospitalLimit && hospitalBooked >= hospitalLimit) {
    return { code: "hospitalFull", message: "OPD appointments for this day are full. Please choose another day." };
  }
  return null;
};

// Every slot of a doctor's day with its state - the admin slot manager shows all of it, getDaySlots
// keeps only the free ones. excludeId = an appointment being moved (it does not block or count).
//   slots: [{ time: "09:15", startsAt, state: "free" | "booked" | "past" | "blocked" | "break", ... }]
//     booked  -> appointmentId, appointmentCode, patientName
//     blocked -> exceptionId, exceptionReason, singleSlot (the exception covers exactly this slot)
//   closed: why the whole day takes no bookings (inactive, leave, day off, cutoff, daily limit) or null
//   doctorBooked / hospitalBooked: appointments that count towards the daily limits
//     (hospitalBooked is only counted when a hospital limit is set, otherwise null)
export const getDayBoard = async (doctor, dateStr, { db = { query }, excludeId = null } = {}) => {
  const duration = doctor.appointmentDuration;
  const weekday = weekdayOf(dateStr);
  const dayStart = clinicTime(dateStr, 0);
  const dayEnd = clinicTime(addDays(dateStr, 1), 0);

  const [rules, exceptions, booked, settings] = await Promise.all([
    db.query(
      `SELECT kind, to_char("startTime", 'HH24:MI') AS start, to_char("endTime", 'HH24:MI') AS "end"
       FROM doctor_schedule WHERE "doctorId" = $1 AND weekday = $2`,
      [doctor.id, weekday]
    ),
    db.query(
      `SELECT id, "fullDay", to_char("startTime", 'HH24:MI') AS start, to_char("endTime", 'HH24:MI') AS "end", reason
       FROM doctor_exceptions WHERE "doctorId" = $1 AND date = $2`,
      [doctor.id, dateStr]
    ),
    db.query(
      `SELECT a.id, a.code, a."scheduledAt", a."durationMinutes", p.name AS "patientName"
       FROM appointments a JOIN patients p ON p.id = a."patientId"
       WHERE a."doctorId" = $1 AND a.status <> 'cancelled' AND a.id <> $2
         AND a."scheduledAt" < $4 AND a."scheduledAt" + (a."durationMinutes" * interval '1 minute') > $3`,
      [doctor.id, excludeId || 0, dayStart, dayEnd]
    ),
    findBookingSettings(db),
  ]);

  const doctorBooked = booked.rows.filter((a) => new Date(a.scheduledAt) >= dayStart).length;
  let hospitalBooked = null;
  if (settings.dailyLimit) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS count FROM appointments
       WHERE status <> 'cancelled' AND id <> $1 AND "scheduledAt" >= $2 AND "scheduledAt" < $3`,
      [excludeId || 0, dayStart, dayEnd]
    );
    hospitalBooked = rows[0].count;
  }
  const board = { closed: null, slots: [], doctorBooked, hospitalBooked, settings };

  if (exceptions.rows.some((e) => e.fullDay)) {
    return { ...board, closed: { code: "leave", message: "The doctor is not available on this day." } };
  }
  const shifts = rules.rows.filter((r) => r.kind === "shift");
  if (shifts.length === 0) {
    return { ...board, closed: { code: "dayOff", message: "The doctor does not work on this day." } };
  }

  const breaks = rules.rows.filter((r) => r.kind === "break").map((r) => [toMinutes(r.start), toMinutes(r.end)]);
  const blocks = exceptions.rows.map((e) => ({ id: e.id, reason: e.reason, start: toMinutes(e.start), end: toMinutes(e.end) }));
  const bookings = booked.rows.map((a) => {
    const start = new Date(a.scheduledAt).getTime();
    return { a, start, end: start + a.durationMinutes * 60000 };
  });

  const now = Date.now();
  const seen = new Set();
  for (const shift of shifts) {
    const end = toMinutes(shift.end);
    for (let t = toMinutes(shift.start); t + duration <= end; t += duration) {
      if (seen.has(t)) continue;
      seen.add(t);

      const startsAt = clinicTime(dateStr, t);
      const startMs = startsAt.getTime();
      const slot = { time: toHHMM(t), startsAt: startsAt.toISOString(), minutes: t, state: "free" };
      const booking = bookings.find((b) => overlaps(startMs, startMs + duration * 60000, b.start, b.end));
      const block = blocks.find((b) => overlaps(t, t + duration, b.start, b.end));
      if (booking) {
        Object.assign(slot, { state: "booked", appointmentId: booking.a.id, appointmentCode: booking.a.code, patientName: booking.a.patientName });
      } else if (startMs <= now) {
        slot.state = "past";
      } else if (block) {
        Object.assign(slot, {
          state: "blocked",
          exceptionId: block.id,
          exceptionReason: block.reason,
          singleSlot: block.start === t && block.end === t + duration,
        });
      } else if (breaks.some(([bStart, bEnd]) => overlaps(t, t + duration, bStart, bEnd))) {
        slot.state = "break";
      }
      board.slots.push(slot);
    }
  }
  board.slots = board.slots.sort((a, b) => a.minutes - b.minutes).map(({ minutes, ...slot }) => slot);

  const clinicNow = clinicDateOf(new Date());
  board.closed = !doctor.isAvailable
    ? { code: "inactive", message: "This doctor is not accepting appointments right now." }
    : dayClosedReason({
        dateStr,
        today: clinicNow.date,
        nowMinutes: clinicNow.minutes,
        cutoffTime: settings.cutoffTime,
        doctorBooked,
        doctorLimit: doctor.dailyLimit,
        hospitalBooked,
        hospitalLimit: settings.dailyLimit,
      });
  return board;
};

// Free slots for a doctor on one day: [{ time: "09:15", startsAt: ISO string }].
// Applies weekly shifts, breaks, date exceptions (full / partial day), existing appointments,
// the hospital booking rules (cutoff + daily limits) and hides slots that have already started.
export const freeSlotsOf = ({ closed, slots }) =>
  closed ? [] : slots.filter((s) => s.state === "free").map(({ time, startsAt }) => ({ time, startsAt }));

export const getDaySlots = async (doctor, dateStr, options) => freeSlotsOf(await getDayBoard(doctor, dateStr, options));

// Book (no id) or move (id given) an appointment, safely:
//  - one transaction, with one booking lock so two requests can not pass the check together (the
//    hospital-wide daily limit counts every doctor's appointments, so a per-doctor lock is not enough)
//  - slot is re-validated against schedule / leave / bookings / cutoff / daily limits on the server
//  - fee + duration are copied from the doctor at booking time (kept if only the time-slot of the
//    same doctor changes, refreshed if the doctor changes)
export const saveAppointment = async ({ id = null, patientId, doctorId, scheduledAt, status, notes }) => {
  const instant = new Date(scheduledAt);
  if (Number.isNaN(instant.getTime())) throw new BookingError("Choose a valid appointment time");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(7001, 0)");

    const { rows } = await client.query("SELECT * FROM doctors WHERE id = $1", [doctorId]);
    const doctor = rows[0];
    if (!doctor) throw new BookingError("Doctor is not found", 404);
    if (!doctor.isAvailable) throw new BookingError("This doctor is not accepting appointments right now");

    const patient = await client.query("SELECT id FROM patients WHERE id = $1", [patientId]);
    if (!patient.rows[0]) throw new BookingError("Patient is not found", 404);

    const { date } = clinicDateOf(instant);
    const board = await getDayBoard(doctor, date, { db: client, excludeId: id });
    if (board.closed) throw new BookingError(board.closed.message, 409);
    if (!board.slots.some((s) => s.state === "free" && new Date(s.startsAt).getTime() === instant.getTime())) {
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
