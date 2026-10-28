import { addDays, clinicToday, freeSlotsOf, getDayBoard, getDaySlots, isValidDateString, saveAppointment } from "../config/booking.js";
import { photoUrl } from "../config/photos.js";
import { razorpay, verifyCheckoutSignature } from "../config/razorpay.js";
import { findAppointmentById, findAppointmentsByPatient } from "../model/appointmentModel.js";
import { findAllSchedules, findDoctorById, findDoctors } from "../model/doctorModel.js";
import { findPatientById } from "../model/patientModel.js";
import {
  applyPaymentCaptured,
  applyPaymentFailed,
  findPaymentByOrderId,
  findReusableOrderForAppointment,
  insertPaymentOrder,
} from "../model/paymentModel.js";

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
    // closedReason tells the patient why a day has no slots (bookings closed for today, fully booked...)
    const board = await getDayBoard(doctor, date);
    return res.status(200).json({
      doctor: toBookableDoctor(doctor, req),
      date,
      slots: freeSlotsOf(board),
      closedReason: board.closed?.message || null,
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

// body: { appointmentId }. Creates (or reuses, on retry) a Razorpay order for an already-booked
// appointment. The order amount always comes from the appointment's own fee snapshot, never from
// the client, so a tampered client request can not change what gets charged.
export const createPaymentOrder = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) {
      return res.status(400).json({ message: "Appointment is required" });
    }
    const appointment = await findAppointmentById(appointmentId);
    if (!appointment || appointment.patientId !== req.userId) {
      return res.status(404).json({ message: "Appointment is not found" });
    }
    if (!["pending", "failed"].includes(appointment.paymentStatus)) {
      return res.status(400).json({ message: `This appointment's payment is already ${appointment.paymentStatus}` });
    }

    let payment = await findReusableOrderForAppointment(appointmentId);
    if (!payment) {
      const receiptId = `apt_${appointmentId}_${Date.now()}`;
      const order = await razorpay.orders.create({
        amount: Math.round(Number(appointment.fee) * 100), // paise; rupees everywhere else in this app
        currency: "INR",
        receipt: receiptId,
        payment_capture: 1, // auto-capture on success, so a "captured" webhook/fetch is guaranteed
        notes: { appointmentId: String(appointmentId), patientId: String(req.userId) },
      });
      payment = await insertPaymentOrder({
        appointmentId,
        patientId: req.userId,
        providerOrderId: order.id,
        amount: appointment.fee,
        currency: "INR",
        receiptId,
      });
    }

    const patient = await findPatientById(req.userId);
    return res.status(200).json({
      orderId: payment.providerOrderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      name: patient?.name,
      email: patient?.email || undefined,
      contact: patient?.phone || undefined,
    });
  } catch (error) {
    return sendError(res, "CreatePaymentOrder", error);
  }
};

// body: { orderId, paymentId, signature } from the WebView checkout's success handler. The
// signature proves Razorpay issued this triple; we then re-fetch the payment from Razorpay's API
// (rather than trusting the client's claim of success) before marking anything captured.
export const verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: "Missing payment details" });
    }
    const payment = await findPaymentByOrderId(orderId);
    if (!payment || payment.patientId !== req.userId) {
      return res.status(404).json({ message: "Payment is not found" });
    }
    if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const entity = await razorpay.payments.fetch(paymentId);
    if (entity.order_id !== orderId) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    if (entity.status === "captured") {
      const updated = await applyPaymentCaptured(entity);
      const appointment = updated ? await findAppointmentById(updated.appointmentId) : null;
      return res.status(200).json({ message: "Payment verified", appointment, payment: updated });
    }
    if (entity.status === "failed") {
      await applyPaymentFailed(entity);
      return res.status(400).json({ message: entity.error_description || "Payment failed" });
    }
    return res.status(202).json({ message: "Payment is still processing. Please wait a moment and refresh." });
  } catch (error) {
    return sendError(res, "VerifyPayment", error);
  }
};
