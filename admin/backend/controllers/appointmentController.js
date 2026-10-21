import { saveAppointment } from "../config/booking.js";
import {
  appointmentStatuses,
  deleteAppointmentById,
  findAppointmentById,
  findAppointments,
  recordReschedule,
  updateAppointmentById,
} from "../model/appointmentModel.js";
import { findDoctorById } from "../model/doctorModel.js";
import { findPatientById } from "../model/patientModel.js";
import { hasPaymentForAppointment } from "../model/paymentModel.js";

// appointment/patient/doctor ids are Postgres SERIAL integers - rejecting anything else here
// before it reaches the database avoids a raw "invalid input syntax for type integer" DB error
// leaking out as an unhandled 500 (same convention as findBookableDoctor in bookingController.js)
export const isValidId = (value) => /^\d+$/.test(String(value));

// BookingError (config/booking.js) carries its own status code
const sendError = (res, name, error) =>
  error.status
    ? res.status(error.status).json({ message: error.message })
    : res.status(500).json({ message: `${name} error ${error.message}` });

export const getAppointments = async (req, res) => {
  try {
    const appointments = await findAppointments();
    return res.status(200).json(appointments);
  } catch (error) {
    return res.status(500).json({ message: `GetAppointments error ${error.message}` });
  }
};

export const createAppointment = async (req, res) => {
  try {
    const { patientId, doctorId, scheduledAt, status, notes } = req.body;
    if (!patientId || !doctorId || !scheduledAt) {
      return res.status(400).json({ message: "Patient, doctor and date are required" });
    }
    if (!isValidId(patientId) || !isValidId(doctorId)) {
      return res.status(400).json({ message: "Invalid patient or doctor" });
    }
    if (status && !appointmentStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // slot, schedule, leave and double-booking checks + fee snapshot happen inside saveAppointment
    const appointment = await saveAppointment({
      patientId,
      doctorId,
      scheduledAt,
      status: status || "pending",
      notes: notes || null,
    });
    return res.status(201).json({ message: "Appointment created successfully", appointment });
  } catch (error) {
    return sendError(res, "CreateAppointment", error);
  }
};

export const editAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { patientId, doctorId, scheduledAt, status, notes } = req.body;

    if (!isValidId(appointmentId)) {
      return res.status(404).json({ message: "Appointment is not found" });
    }
    if ((patientId && !isValidId(patientId)) || (doctorId && !isValidId(doctorId))) {
      return res.status(400).json({ message: "Invalid patient or doctor" });
    }

    const oldAppointment = await findAppointmentById(appointmentId);
    if (!oldAppointment) {
      return res.status(404).json({ message: "Appointment is not found" });
    }
    if (status && !appointmentStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const next = {
      patientId: patientId || oldAppointment.patientId,
      doctorId: doctorId || oldAppointment.doctorId,
      scheduledAt: scheduledAt || oldAppointment.scheduledAt,
      status: status || oldAppointment.status,
      notes: notes === undefined ? oldAppointment.notes : notes,
    };

    // a new doctor / time, or bringing back a cancelled appointment, must pass the slot checks again
    const movedSlot =
      Number(next.doctorId) !== oldAppointment.doctorId ||
      new Date(next.scheduledAt).getTime() !== new Date(oldAppointment.scheduledAt).getTime();
    const revived = oldAppointment.status === "cancelled" && next.status !== "cancelled";

    let appointment;
    if (next.status !== "cancelled" && (movedSlot || revived)) {
      appointment = await saveAppointment({ id: oldAppointment.id, ...next });
    } else {
      // doctor/time are unchanged here, so updateAppointmentById (unlike saveAppointment) never
      // checks patientId/doctorId exist - only needed when the caller actually changed one of them
      if (Number(next.patientId) !== oldAppointment.patientId && !(await findPatientById(next.patientId))) {
        return res.status(404).json({ message: "Patient is not found" });
      }
      if (Number(next.doctorId) !== oldAppointment.doctorId && !(await findDoctorById(next.doctorId))) {
        return res.status(404).json({ message: "Doctor is not found" });
      }
      appointment = await updateAppointmentById(appointmentId, next);
    }
    return res.status(200).json({ message: "Appointment updated successfully", appointment });
  } catch (error) {
    return sendError(res, "EditAppointment", error);
  }
};

export const removeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    if (!isValidId(appointmentId)) {
      return res.status(404).json({ message: "Appointment is not found" });
    }
    // appointments cascade-delete their payments/refund history at the DB level, so a paid
    // appointment must never be deleted this way - it would silently erase financial records
    if (await hasPaymentForAppointment(appointmentId)) {
      return res.status(409).json({
        message: "This appointment has payment records and can not be deleted. Cancel it instead.",
      });
    }
    const appointment = await deleteAppointmentById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment is not found" });
    }
    return res.status(200).json({ message: "Appointment removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemoveAppointment error ${error.message}` });
  }
};

// move an appointment to a new slot (same doctor), keeping the reason the patient gave
export const rescheduleAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { scheduledAt, reason } = req.body;
    if (!isValidId(appointmentId)) return res.status(404).json({ message: "Appointment is not found" });
    if (!scheduledAt) return res.status(400).json({ message: "New date and time are required" });
    if (!reason || !reason.trim()) return res.status(400).json({ message: "Reason for rescheduling is required" });

    const old = await findAppointmentById(appointmentId);
    if (!old) return res.status(404).json({ message: "Appointment is not found" });
    if (old.status === "cancelled" || old.status === "completed") {
      return res.status(400).json({ message: `A ${old.status} appointment can not be rescheduled` });
    }
    if (new Date(scheduledAt).getTime() === new Date(old.scheduledAt).getTime()) {
      return res.status(400).json({ message: "Choose a different time than the current one" });
    }

    await saveAppointment({
      id: old.id,
      patientId: old.patientId,
      doctorId: old.doctorId,
      scheduledAt,
      status: old.status,
      notes: old.notes,
    });
    const appointment = await recordReschedule(old.id, { reason: reason.trim(), previousScheduledAt: old.scheduledAt });
    return res.status(200).json({ message: "Appointment rescheduled successfully", appointment });
  } catch (error) {
    return sendError(res, "RescheduleAppointment", error);
  }
};
