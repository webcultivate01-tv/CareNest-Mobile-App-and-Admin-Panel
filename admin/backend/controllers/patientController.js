import {
  deletePatientById,
  findPatientById,
  findPatients,
  findPaymentsByPatient,
  insertPatient,
  updatePatientById,
} from "../model/patientModel.js";
import { removePhotoFile } from "../config/photos.js";
import { findAppointmentsByPatient } from "../model/appointmentModel.js";
import { queueStateOf } from "../model/queueModel.js";
import validator from "validator";
import { isValidDob, keepPatientPhotoWithName } from "./userController.js";

// checks and cleans the form; returns { error } or { data }
const readPatientForm = (body) => {
  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const phone = (body.phone || "").trim();
  const dob = (body.dob || "").trim();
  const address = (body.address || "").trim();

  if (name.length < 2) return { error: "Enter the patient's full name" };
  if (!/^\d{10}$/.test(phone)) return { error: "Enter a 10 digit mobile number" };
  if (!email) return { error: "Email is required" };
  if (!validator.isEmail(email)) return { error: "Enter a valid email address" };
  if (!isValidDob(dob)) return { error: "Enter a valid date of birth" };
  if (!address) return { error: "Address is required" };
  return { data: { name, email, phone, dob, address } };
};

const duplicateMessage = (error) =>
  error.code === "23505"
    ? error.constraint === "patients_email_key"
      ? "A patient with this email already exists"
      : "A patient with this mobile number already exists"
    : null;

export const getPatients = async (req, res) => {
  try {
    const patients = await findPatients();
    return res.status(200).json(patients);
  } catch (error) {
    return res.status(500).json({ message: `GetPatients error ${error.message}` });
  }
};

export const createPatient = async (req, res) => {
  try {
    const { error, data } = readPatientForm(req.body);
    if (error) return res.status(400).json({ message: error });

    const patient = await insertPatient(data);
    return res.status(201).json({ message: "Patient created successfully", patient });
  } catch (error) {
    const duplicate = duplicateMessage(error);
    if (duplicate) return res.status(409).json({ message: duplicate });
    return res.status(500).json({ message: `CreatePatient error ${error.message}` });
  }
};

export const editPatient = async (req, res) => {
  try {
    const { patientId } = req.params;

    const oldPatient = await findPatientById(patientId);
    if (!oldPatient) {
      return res.status(404).json({ message: "Patient is not found" });
    }
    const { error, data } = readPatientForm(req.body);
    if (error) return res.status(400).json({ message: error });

    let patient = await updatePatientById(patientId, data);
    patient = await keepPatientPhotoWithName(patient);
    return res.status(200).json({ message: "Patient updated successfully", patient });
  } catch (error) {
    const duplicate = duplicateMessage(error);
    if (duplicate) return res.status(409).json({ message: duplicate });
    return res.status(500).json({ message: `EditPatient error ${error.message}` });
  }
};

export const removePatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await deletePatientById(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient is not found" });
    }
    await removePhotoFile(patient.photo);
    return res.status(200).json({ message: "Patient removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemovePatient error ${error.message}` });
  }
};

// everything about one patient for the admin profile page: details, bookings, payments and what
// they are doing right now (today's visit in the live queue, next upcoming booking)
export const getPatientProfile = async (req, res) => {
  try {
    const patient = await findPatientById(req.params.patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient is not found" });
    }
    const [appointments, payments] = await Promise.all([
      findAppointmentsByPatient(patient.id),
      findPaymentsByPatient(patient.id),
    ]);

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayVisit = appointments.find(
      (a) => a.status !== "cancelled" && new Date(a.scheduledAt) >= dayStart && new Date(a.scheduledAt) < dayEnd
    );
    const upcoming = appointments
      .filter((a) => ["pending", "confirmed"].includes(a.status) && new Date(a.scheduledAt) >= now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];

    const paid = payments.filter((p) => ["captured", "partially_refunded", "refunded"].includes(p.status));
    const stats = {
      totalBookings: appointments.length,
      completed: appointments.filter((a) => a.status === "completed").length,
      cancelled: appointments.filter((a) => a.status === "cancelled").length,
      upcoming: appointments.filter(
        (a) => ["pending", "confirmed"].includes(a.status) && new Date(a.scheduledAt) >= now
      ).length,
      totalPaid: paid.reduce((sum, p) => sum + Number(p.amount), 0),
      totalRefunded: payments.reduce((sum, p) => sum + Number(p.refundedAmount), 0),
      lastVisit: appointments.find((a) => a.status === "completed")?.scheduledAt || null,
    };

    return res.status(200).json({
      patient,
      stats,
      current: {
        todayVisit: todayVisit
          ? { ...todayVisit, queueState: queueStateOf(todayVisit) }
          : null,
        nextAppointment: upcoming || null,
      },
      appointments,
      payments,
    });
  } catch (error) {
    return res.status(500).json({ message: `GetPatientProfile error ${error.message}` });
  }
};
