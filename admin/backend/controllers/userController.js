import bcrypt from "bcryptjs";
import validator from "validator";
import { genUserToken } from "../config/token.js";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "../config/paths.js";
import {
  findPatientByPhoneExcept,
  findPatientByPhoneOrEmail,
  setPatientPhoto,
  updatePatientProfile,
  findPatientById,
  findPatientForLogin,
  insertPatientUser,
} from "../model/patientModel.js";

// same shape the app already uses: name, mobile, dob, email
const PATIENTS_DIR = UPLOADS_DIR;

// photo is stored as a relative path; the app needs a full URL
const toUser = (patient, req) => ({
  id: patient.id,
  name: patient.name,
  mobile: patient.phone,
  dob: patient.dob,
  email: patient.email,
  photo: patient.photo ? `${req.protocol}://${req.get("host")}/${patient.photo}` : null,
});

// checks DD/MM/YYYY is a real date in the past
const isValidDob = (text) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text || "");
  if (!m) return false;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date < new Date() &&
    year > 1900
  );
};

export const signUp = async (req, res) => {
  try {
    const { name, mobile, dob, email, password } = req.body;
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : null;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Enter your full name" });
    }
    if (!/^\d{10}$/.test(mobile || "")) {
      return res.status(400).json({ message: "Enter a 10 digit mobile number" });
    }
    if (!isValidDob(dob)) {
      return res.status(400).json({ message: "Enter a valid date as DD/MM/YYYY" });
    }
    if (cleanEmail && !validator.isEmail(cleanEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const existing = await findPatientByPhoneOrEmail(mobile, cleanEmail);
    if (existing) {
      return res.status(400).json({ message: "User already exists with this mobile or email" });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const patient = await insertPatientUser({
      name: name.trim(),
      email: cleanEmail,
      phone: mobile,
      dob,
      password: hashPassword,
    });

    const token = genUserToken(patient.id);
    return res.status(201).json({ message: "Account created successfully", token, user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `SignUp error ${error.message}` });
  }
};

export const login = async (req, res) => {
  try {
    const { id, password } = req.body; // id = email or mobile number
    if (!id || !password) {
      return res.status(400).json({ message: "Email or mobile and password are required" });
    }

    const patient = await findPatientForLogin(id.trim());
    // patients added by the admin have no password, so they cannot log in yet
    if (!patient || !patient.password) {
      return res.status(400).json({ message: "Invalid email/mobile or password" });
    }

    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email/mobile or password" });
    }

    const token = genUserToken(patient.id);
    const user = await findPatientById(patient.id);
    return res.status(200).json({ message: "Login successfully", token, user: toUser(user, req) });
  } catch (error) {
    return res.status(500).json({ message: `Login error ${error.message}` });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const patient = await findPatientById(req.userId);
    if (!patient) {
      return res.status(404).json({ message: "User does not found" });
    }
    return res.status(200).json(toUser(patient, req));
  } catch (error) {
    return res.status(500).json({ message: `GetCurrentUser error ${error.message}` });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, mobile, dob } = req.body; // email is not editable

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Enter your full name" });
    }
    if (!/^\d{10}$/.test(mobile || "")) {
      return res.status(400).json({ message: "Enter a 10 digit mobile number" });
    }
    if (!isValidDob(dob)) {
      return res.status(400).json({ message: "Enter a valid date as DD/MM/YYYY" });
    }
    if (await findPatientByPhoneExcept(mobile, req.userId)) {
      return res.status(400).json({ message: "This mobile number is already used" });
    }

    const patient = await updatePatientProfile(req.userId, { name: name.trim(), phone: mobile, dob });
    return res.status(200).json({ message: "Profile updated", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `UpdateProfile error ${error.message}` });
  }
};

// uploads/<id>/ holds only that patient's current photo
const clearPatientFolder = (id) => fs.rm(path.join(PATIENTS_DIR, String(id)), { recursive: true, force: true });

const EXTENSIONS = { "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif" };

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose an image (max 5 MB)" });
    }
    // replace: remove the old photo first, then save the new one
    await clearPatientFolder(req.userId);
    const folder = path.join(PATIENTS_DIR, String(req.userId));
    await fs.mkdir(folder, { recursive: true });
    const fileName = `profile-${Date.now()}${EXTENSIONS[req.file.mimetype] || ".jpg"}`;
    await fs.writeFile(path.join(folder, fileName), req.file.buffer);

    const patient = await setPatientPhoto(req.userId, `uploads/${req.userId}/${fileName}`);
    return res.status(200).json({ message: "Photo updated", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `UploadPhoto error ${error.message}` });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    await clearPatientFolder(req.userId);
    const patient = await setPatientPhoto(req.userId, null);
    return res.status(200).json({ message: "Photo removed", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `DeletePhoto error ${error.message}` });
  }
};
