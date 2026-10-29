import { addDays, clinicToday, clinicTime, isValidDateString } from "../config/booking.js";
import { notifyInBackground, notifyStatusChange } from "../config/notifications.js";
import { findAppointmentById } from "../model/appointmentModel.js";
import {
  findQueueAppointments,
  markCheckedIn,
  markCompleted,
  markStarted,
  queueStateOf,
} from "../model/queueModel.js";
import { isValidId } from "./appointmentController.js";

const dayRange = (dateStr) => [clinicTime(dateStr, 0), clinicTime(addDays(dateStr, 1), 0)];

// Adds queue fields to one doctor's appointments (already ordered by slot):
//   token        1-based place in that doctor's day, so "token 7" means the 7th booking
//   ahead        patients still to be seen before this one (in consultation + waiting + booked earlier)
//   waitMinutes  rough wait: patients ahead x this doctor's slot length
const decorate = (list) => {
  let ahead = 0;
  return list.map((a, i) => {
    const queueState = queueStateOf(a);
    const row = { ...a, queueState, token: i + 1, ahead: queueState === "done" ? 0 : ahead };
    row.waitMinutes = queueState === "booked" || queueState === "waiting" ? row.ahead * (a.durationMinutes || 15) : 0;
    if (queueState !== "done") ahead += 1;
    return row;
  });
};

// Order the doctor sees patients in: the one inside first, then arrived patients by slot, then the
// not-yet-arrived by slot. "Next patient" is taken from this order.
const callOrder = (rows) => {
  const rank = { in_consultation: 0, waiting: 1, booked: 2, done: 3 };
  return [...rows].sort(
    (a, b) => rank[a.queueState] - rank[b.queueState] || new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );
};

// Per doctor: { doctorId, doctorName, doctorSpecialty, nowServing, next, counts, patients[] }
export const buildBoard = (rows) => {
  const byDoctor = new Map();
  for (const a of rows) {
    if (!byDoctor.has(a.doctorId)) byDoctor.set(a.doctorId, []);
    byDoctor.get(a.doctorId).push(a);
  }
  return [...byDoctor.values()].map((list) => {
    const patients = decorate(list);
    const ordered = callOrder(patients);
    const count = (state) => patients.filter((p) => p.queueState === state).length;
    return {
      doctorId: list[0].doctorId,
      doctorName: list[0].doctorName,
      doctorSpecialty: list[0].doctorSpecialty,
      nowServing: ordered.find((p) => p.queueState === "in_consultation") || null,
      next: ordered.find((p) => p.queueState === "waiting") || ordered.find((p) => p.queueState === "booked") || null,
      counts: {
        booked: count("booked"),
        waiting: count("waiting"),
        in_consultation: count("in_consultation"),
        done: count("done"),
      },
      patients: ordered,
    };
  });
};

// ---- admin / doctor panel ----

export const getBoard = async (req, res) => {
  try {
    const date = req.query.date || clinicToday();
    if (!isValidDateString(date)) return res.status(400).json({ message: "Invalid date" });
    const [from, to] = dayRange(date);
    const rows = await findQueueAppointments(from, to);
    return res.status(200).json({ date, doctors: buildBoard(rows) });
  } catch (error) {
    return res.status(500).json({ message: `GetBoard error ${error.message}` });
  }
};

const loadAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  const appointment = isValidId(appointmentId) ? await findAppointmentById(appointmentId) : null;
  if (!appointment) {
    res.status(404).json({ message: "Appointment is not found" });
    return null;
  }
  return appointment;
};

const fail = (res, name, error) =>
  // 23505 = the one-patient-at-a-time index: the doctor already has someone inside
  error.code === "23505"
    ? res.status(409).json({ message: "This doctor already has a patient in consultation. Complete that one first." })
    : res.status(500).json({ message: `${name} error ${error.message}` });

export const checkIn = async (req, res) => {
  try {
    const appointment = await loadAppointment(req, res);
    if (!appointment) return;
    if (!(await markCheckedIn(appointment.id))) {
      return res.status(409).json({ message: "Only an upcoming appointment that has not started can be checked in" });
    }
    return res.status(200).json({ message: "Patient checked in" });
  } catch (error) {
    return fail(res, "CheckIn", error);
  }
};

export const startConsultation = async (req, res) => {
  try {
    const appointment = await loadAppointment(req, res);
    if (!appointment) return;
    if (!(await markStarted(appointment.id))) {
      return res.status(409).json({ message: "This appointment can not be started" });
    }
    return res.status(200).json({ message: "Consultation started" });
  } catch (error) {
    return fail(res, "StartConsultation", error);
  }
};

// next = earliest arrived patient; if nobody has checked in, the earliest booked one
const callNextFor = async (doctorId) => {
  const [from, to] = dayRange(clinicToday());
  const doctor = buildBoard(await findQueueAppointments(from, to, doctorId))[0];
  if (!doctor || doctor.nowServing || !doctor.next) return null;
  return (await markStarted(doctor.next.id)) ? doctor.next : null;
};

// body: { callNext: true } also calls the doctor's next patient straight away
export const completeConsultation = async (req, res) => {
  try {
    const appointment = await loadAppointment(req, res);
    if (!appointment) return;
    if (!(await markCompleted(appointment.id))) {
      return res.status(409).json({ message: "Only a patient currently in consultation can be completed" });
    }
    const completed = await findAppointmentById(appointment.id);
    notifyInBackground(() => notifyStatusChange({ appointment: completed, status: "completed" }));

    const called = req.body?.callNext ? await callNextFor(appointment.doctorId) : null;
    return res.status(200).json({ message: called ? "Completed. Next patient called" : "Consultation completed", called });
  } catch (error) {
    return fail(res, "CompleteConsultation", error);
  }
};

export const callNext = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!isValidId(doctorId)) return res.status(404).json({ message: "Doctor is not found" });
    const [from, to] = dayRange(clinicToday());
    const doctor = buildBoard(await findQueueAppointments(from, to, doctorId))[0];
    if (!doctor?.next && !doctor?.nowServing) return res.status(404).json({ message: "No patients left in the queue" });
    if (doctor.nowServing) return res.status(409).json({ message: "Complete the current patient first" });
    const called = await callNextFor(Number(doctorId));
    if (!called) return res.status(409).json({ message: "Could not call the next patient. Refresh and try again" });
    return res.status(200).json({ message: "Next patient called", called });
  } catch (error) {
    return fail(res, "CallNext", error);
  }
};

// ---- patient app ----

// The signed-in patient's own places in today's queues: where they stand and which token is being
// seen. Only their own rows plus the doctor's current token are returned - never other patients' names.
export const getMyQueue = async (req, res) => {
  try {
    const [from, to] = dayRange(clinicToday());
    const rows = await findQueueAppointments(from, to);
    const mine = new Set(rows.filter((a) => a.patientId === req.userId).map((a) => a.doctorId));
    const entries = buildBoard(rows.filter((a) => mine.has(a.doctorId))).flatMap((doctor) =>
      doctor.patients
        .filter((p) => p.patientId === req.userId)
        .map((p) => ({
          appointmentId: p.id,
          code: p.code,
          doctorName: doctor.doctorName,
          doctorSpecialty: doctor.doctorSpecialty,
          scheduledAt: p.scheduledAt,
          queueState: p.queueState,
          token: p.token,
          ahead: p.ahead,
          waitMinutes: p.waitMinutes,
          nowServingToken: doctor.nowServing?.token ?? null,
          patientName: p.patientName,
          // the doctor's whole day by token; other patients are anonymous (token + state only)
          queue: [...doctor.patients]
            .sort((a, b) => a.token - b.token)
            .map((q) => ({
              token: q.token,
              queueState: q.queueState,
              scheduledAt: q.scheduledAt,
              isMe: q.patientId === req.userId,
              ...(q.patientId === req.userId ? { patientName: q.patientName } : {}),
            })),
        }))
    );
    return res.status(200).json(entries.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)));
  } catch (error) {
    return res.status(500).json({ message: `GetMyQueue error ${error.message}` });
  }
};
