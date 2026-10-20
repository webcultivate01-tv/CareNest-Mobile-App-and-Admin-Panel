import {
  deletePatientById,
  findPatientById,
  findPatients,
  insertPatient,
  updatePatientById,
} from "../model/patientModel.js";

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
    const { name, email, phone } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const patient = await insertPatient({ name, email: email || null, phone: phone || null });
    return res.status(201).json({ message: "Patient created successfully", patient });
  } catch (error) {
    return res.status(500).json({ message: `CreatePatient error ${error.message}` });
  }
};

export const editPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { name, email, phone } = req.body;

    const oldPatient = await findPatientById(patientId);
    if (!oldPatient) {
      return res.status(404).json({ message: "Patient is not found" });
    }
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const patient = await updatePatientById(patientId, {
      name,
      email: email || null,
      phone: phone || null,
    });
    return res.status(200).json({ message: "Patient updated successfully", patient });
  } catch (error) {
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
    return res.status(200).json({ message: "Patient removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemovePatient error ${error.message}` });
  }
};
