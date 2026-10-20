import { addDays, clinicToday, getDaySlots, isValidDateString, saveAppointment } from "../config/booking.js";
import { photoUrl } from "../config/photos.js";
import { findAppointmentsByPatient } from "../model/appointmentModel.js";
import { findAllSchedules, findDoctorById, findDoctors } from "../model/doctorModel.js";

// Patient (mobile app) side of booking. Patients can only read doctors and book / list
// their own appointments; nothing here changes a doctor, schedule or fee.

const BOOKING_DAYS = 14; // how many days ahead a patient can book

// only what the app needs; fee is the doctor's current fee (the appointment keeps its own copy)
const toBookableDoctor = (doctor, req, extra = {}) => ({
  ...extra,
  id: doctor.id,
  name: doctor.name,
  specialty: doctor.specialty,
  qualifications: doctor.qualifications,
  experienceYears: doctor.experienceYears,
  fee: Number(doctor.fee),
  appointmentDuration: doctor.appointmentDuration,
  photo: photoUrl(req, doctor.photo),
});

const sendError = (res, name, error) =>
  error.status
    ? res.status(error.status).json({ message: error.message })
    : res.status(500).json({ message: `${name} error ${error.message}` });

const findBookableDoctor = async (doctorId) => {
  const doctor = /^\d+$/.test(doctorId) ? await findDoctorById(doctorId) : null;
  return doctor && doctor.isAvailable ? doctor : null;
};

export const getBookableDoctors = async (req, res) => {
  try {
    const doctors = (await findDoctors(req.query.search)).filter((d) => d.isAvailable);
    const schedules = await findAllSchedules();
    const today = clinicToday();
    // live: free slots left today + the weekly shifts (the app shows today's hours).
    // nextFreeDate = first day in the booking window with a free slot (null = none at all),
    // so the app can say "Next available ..." instead of "No slots" once today is over.
    const list = await Promise.all(
      doctors.map(async (d) => {
        const freeToday = (await getDaySlots(d, today)).length;
        let nextFreeDate = freeToday > 0 ? today : null;
        for (let i = 1; !nextFreeDate && i < BOOKING_DAYS; i++) {
          const date = addDays(today, i);
          if ((await getDaySlots(d, date)).length > 0) nextFreeDate = date;
        }
        return toBookableDoctor(d, req, {
          freeToday,
          nextFreeDate,
          schedule: (schedules[d.id] || []).filter((r) => r.kind === "shift"),
        });
      })
    );
    return res.status(200).json(list);
  } catch (error) {
    return res.status(500).json({ message: `GetBookableDoctors error ${error.message}` });
  }
};

// next days with how many free slots each has; days with 0 are fully unavailable
export const getDoctorDays = async (req, res) => {
  try {
    const doctor = await findBookableDoctor(req.params.doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not available for booking" });
    }
    const today = clinicToday();
    const days = [];
    for (let i = 0; i < BOOKING_DAYS; i++) {
      const date = addDays(today, i);
      days.push({ date, freeSlots: (await getDaySlots(doctor, date)).length });
    }
    return res.status(200).json({ doctor: toBookableDoctor(doctor, req), days });
  } catch (error) {
    return res.status(500).json({ message: `GetDoctorDays error ${error.message}` });
  }
};

export const getDoctorSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const doctor = await findBookableDoctor(req.params.doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not available for booking" });
    }
    if (!isValidDateString(date)) {
      return res.status(400).json({ message: "Choose a valid date" });
    }
    return res.status(200).json({
      doctor: toBookableDoctor(doctor, req),
      date,
      slots: await getDaySlots(doctor, date),
    });
  } catch (error) {
    return res.status(500).json({ message: `GetDoctorSlots error ${error.message}` });
  }
};

// body: { doctorId, scheduledAt (a startsAt from the slots list), notes }
export const bookAppointment = async (req, res) => {
  try {
    const { doctorId, scheduledAt, notes } = req.body;
    if (!doctorId || !scheduledAt) {
      return res.status(400).json({ message: "Doctor and time slot are required" });
    }
    const appointment = await saveAppointment({
      patientId: req.userId,
      doctorId,
      scheduledAt,
      status: "pending",
      notes: notes ? String(notes).slice(0, 500) : null,
    });
    return res.status(201).json({ message: "Appointment booked", appointment });
  } catch (error) {
    return sendError(res, "BookAppointment", error);
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const appointments = await findAppointmentsByPatient(req.userId);
    return res.status(200).json(appointments.map((a) => ({ ...a, doctorPhoto: photoUrl(req, a.doctorPhoto) })));
  } catch (error) {
    return res.status(500).json({ message: `GetMyAppointments error ${error.message}` });
  }
};
