import {
  deleteDoctorById,
  findDoctorById,
  findDoctors,
  insertDoctor,
  updateDoctorById,
} from "../model/doctorModel.js";

export const getDoctors = async (req, res) => {
  try {
    const doctors = await findDoctors();
    return res.status(200).json(doctors);
  } catch (error) {
    return res.status(500).json({ message: `GetDoctors error ${error.message}` });
  }
};

export const createDoctor = async (req, res) => {
  try {
    const { name, specialty, email, phone, experienceYears, fee, isAvailable } = req.body;
    if (!name || !specialty) {
      return res.status(400).json({ message: "Name and specialty are required" });
    }

    const doctor = await insertDoctor({
      name,
      specialty,
      email: email || null,
      phone: phone || null,
      experienceYears: Number(experienceYears) || 0,
      fee: Number(fee) || 0,
      isAvailable: isAvailable !== false,
    });
    return res.status(201).json({ message: "Doctor created successfully", doctor });
  } catch (error) {
    return res.status(500).json({ message: `CreateDoctor error ${error.message}` });
  }
};

export const editDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { name, specialty, email, phone, experienceYears, fee, isAvailable } = req.body;

    const oldDoctor = await findDoctorById(doctorId);
    if (!oldDoctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    if (!name || !specialty) {
      return res.status(400).json({ message: "Name and specialty are required" });
    }

    const doctor = await updateDoctorById(doctorId, {
      name,
      specialty,
      email: email || null,
      phone: phone || null,
      experienceYears: Number(experienceYears) || 0,
      fee: Number(fee) || 0,
      isAvailable: isAvailable !== false,
    });
    return res.status(200).json({ message: "Doctor updated successfully", doctor });
  } catch (error) {
    return res.status(500).json({ message: `EditDoctor error ${error.message}` });
  }
};

export const removeDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await deleteDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    return res.status(200).json({ message: "Doctor removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemoveDoctor error ${error.message}` });
  }
};
