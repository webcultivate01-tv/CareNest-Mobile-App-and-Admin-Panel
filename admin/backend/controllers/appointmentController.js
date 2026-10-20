import {
  appointmentStatuses,
  deleteAppointmentById,
  findAppointmentById,
  findAppointments,
  insertAppointment,
  updateAppointmentById,
} from "../model/appointmentModel.js";

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

    const appointment = await insertAppointment({
      patientId,
      doctorId,
      scheduledAt,
      status: status || "pending",
      notes: notes || null,
    });
    return res.status(201).json({ message: "Appointment created successfully", appointment });
  } catch (error) {
    return res.status(500).json({ message: `CreateAppointment error ${error.message}` });
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

    const appointment = await updateAppointmentById(appointmentId, {
      patientId: patientId || oldAppointment.patientId,
      doctorId: doctorId || oldAppointment.doctorId,
      scheduledAt: scheduledAt || oldAppointment.scheduledAt,
      status: status || oldAppointment.status,
      notes: notes === undefined ? oldAppointment.notes : notes,
    });
    return res.status(200).json({ message: "Appointment updated successfully", appointment });
  } catch (error) {
    return res.status(500).json({ message: `EditAppointment error ${error.message}` });
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
