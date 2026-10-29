import bcrypt from "bcryptjs";
import validator from "validator";
import { genUserToken } from "../config/token.js";
import { notifyInBackground, notifyWelcome } from "../config/notifications.js";
import { movePhoto, photoUrl, removePhotoFile, savePhoto } from "../config/photos.js";
import {
  findPatientByPhoneExcept,
  findPatientByPhoneOrEmail,
  setPatientPhoto,
  updatePatientProfile,
  findPatientById,
  findPatientForLogin,
  insertPatientUser,
  setMarketingConsent,
} from "../model/patientModel.js";

// same shape the app already uses: name, mobile, dob, email
// photo is stored as a relative path; the app needs a full URL
const toUser = (patient, req) => ({
  id: patient.id,
  name: patient.name,
  mobile: patient.phone,
  dob: patient.dob,
  email: patient.email,
  photo: photoUrl(req, patient.photo),
  marketingConsent: Boolean(patient.marketingConsent), // offers & health updates (Marketing module)
});

// photos live in admin/uploads/patients/<patient name>/; after a name change move it to the new folder
export const keepPatientPhotoWithName = async (patient) => {
  const photo = await movePhoto(patient.photo, "patients", patient.name);
  return photo === patient.photo ? patient : setPatientPhoto(patient.id, photo);
};

// checks DD/MM/YYYY is a real date in the past
export const isValidDob = (text) => {
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

    // welcome message in the inbox + by email; backgrounded so signup is not slowed by the mail server
    notifyInBackground(() => notifyWelcome(patient));

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

    let patient = await updatePatientProfile(req.userId, { name: name.trim(), phone: mobile, dob });
    patient = await keepPatientPhotoWithName(patient);
    return res.status(200).json({ message: "Profile updated", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `UpdateProfile error ${error.message}` });
  }
};

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose an image (max 5 MB)" });
    }
    const current = await findPatientById(req.userId);
    if (!current) {
      return res.status(404).json({ message: "User does not found" });
    }

    // replace: save the new photo, then remove the old one
    const photo = await savePhoto("patients", current.name, current.id, req.file);
    const patient = await setPatientPhoto(req.userId, photo);
    await removePhotoFile(current.photo);
    return res.status(200).json({ message: "Photo updated", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `UploadPhoto error ${error.message}` });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    const current = await findPatientById(req.userId);
    await removePhotoFile(current?.photo);
    const patient = await setPatientPhoto(req.userId, null);
    return res.status(200).json({ message: "Photo removed", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `DeletePhoto error ${error.message}` });
  }
};

// Profile > "Offers & health updates": the patient's own yes / no to marketing on WhatsApp, SMS and
// email (the Marketing module only messages patients who said yes)
export const updateMarketingConsent = async (req, res) => {
  try {
    const { consent } = req.body;
    if (typeof consent !== "boolean") {
      return res.status(400).json({ message: "Consent must be true or false" });
    }
    await setMarketingConsent([req.userId], consent, "app");
    const patient = await findPatientById(req.userId);
    if (!patient) {
      return res.status(404).json({ message: "User does not found" });
    }
    return res.status(200).json({ message: "Preference saved", user: toUser(patient, req) });
  } catch (error) {
    return res.status(500).json({ message: `UpdateMarketingConsent error ${error.message}` });
  }
};
