import { saveAppointment } from "../config/booking.js";
import {
  appointmentStatuses,
  deleteAppointmentById,
  findAppointmentById,
  findAppointments,
  recordReschedule,
  updateAppointmentById,
} from "../model/appointmentModel.js";

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

    const appointment =
      next.status !== "cancelled" && (movedSlot || revived)
        ? await saveAppointment({ id: oldAppointment.id, ...next })
        : await updateAppointmentById(appointmentId, next);
    return res.status(200).json({ message: "Appointment updated successfully", appointment });
  } catch (error) {
    return sendError(res, "EditAppointment", error);
  }
};

export const removeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
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
