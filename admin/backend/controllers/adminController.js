import bcrypt from "bcryptjs";
import validator from "validator";
import {
  deleteAdminById,
  findAdminByEmail,
  findAdminById,
  findAdminWithPasswordById,
  findAdmins,
  insertAdmin,
  setAdminPhoto,
  updateAdminBlocked,
  updateAdminById,
  updateAdminPassword,
  updateAdminPermissions,
} from "../model/adminModel.js";
import { movePhoto, removePhotoFile, savePhoto } from "../config/photos.js";
import { DEFAULT_MODULES, STAFF_MODULES, cleanModules } from "../config/modules.js";

const isValidPhone = (phone) => !phone || /^\+?[0-9\s-]{7,15}$/.test(phone.trim());

// photos live in admin/uploads/admins/<name>/ or admin/uploads/subadmins/<name>/
const photoGroup = (admin) => (admin.role === "admin" ? "admins" : admin.role === "staff" ? "staff" : "subadmins");

// after a name change, move the photo into the folder for the new name
const keepPhotoWithName = async (admin) => {
  const photo = await movePhoto(admin.photo, photoGroup(admin), admin.name);
  return photo === admin.photo ? admin : setAdminPhoto(admin.id, photo);
};

export const getAdmins = async (req, res) => {
  try {
    const admins = await findAdmins();
    return res.status(200).json(admins);
  } catch (error) {
    return res.status(500).json({ message: `GetAdmins error ${error.message}` });
  }
};

export const createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone, permissions, role } = req.body;
    if (role !== undefined && role !== "subadmin" && role !== "staff") {
      return res.status(400).json({ message: "Role must be subadmin or staff" });
    }
    const isStaff = role === "staff";
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Enter valid Email" });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter valid mobile number" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existAdmin = await findAdminByEmail(cleanEmail);
    if (existAdmin) {
      return res.status(400).json({ message: "Admin with this email already exists" });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const modules =
      permissions === undefined ? (isStaff ? STAFF_MODULES : DEFAULT_MODULES) : cleanModules(permissions);
    const admin = await insertAdmin(
      name.trim(), cleanEmail, hashPassword, phone?.trim(), modules, isStaff ? "staff" : "subadmin"
    );
    return res.status(201).json({ message: `${isStaff ? "Staff" : "Sub-admin"} created successfully`, admin });
  } catch (error) {
    return res.status(500).json({ message: `CreateAdmin error ${error.message}` });
  }
};

export const removeAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (String(adminId) === String(req.adminId)) {
      return res.status(400).json({ message: "You cannot remove your own account" });
    }

    const admin = await deleteAdminById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Sub-admin is not found" });
    }
    await removePhotoFile(admin.photo);
    return res.status(200).json({ message: "Sub-admin removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemoveAdmin error ${error.message}` });
  }
};

export const editAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { name, email, phone } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Enter valid Email" });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Enter valid mobile number" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existAdmin = await findAdminByEmail(cleanEmail);
    if (existAdmin && String(existAdmin.id) !== String(adminId)) {
      return res.status(400).json({ message: "Email is already used by another admin" });
    }

    let admin = await updateAdminById(adminId, name.trim(), cleanEmail, (phone || "").trim());
    if (!admin) {
      return res.status(404).json({ message: "Admin is not found" });
    }
    admin = await keepPhotoWithName(admin);
    return res.status(200).json({ message: "Admin updated successfully", admin });
  } catch (error) {
    return res.status(500).json({ message: `EditAdmin error ${error.message}` });
  }
};

export const setAdminBlocked = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { isBlocked } = req.body;
    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({ message: "isBlocked must be true or false" });
    }
    if (String(adminId) === String(req.adminId)) {
      return res.status(400).json({ message: "You cannot block your own account" });
    }

    const admin = await updateAdminBlocked(adminId, isBlocked);
    if (!admin) {
      return res.status(404).json({ message: "Sub-admin is not found" });
    }
    return res.status(200).json({
      message: isBlocked ? "Sub-admin blocked" : "Sub-admin unblocked",
      admin,
    });
  } catch (error) {
    return res.status(500).json({ message: `SetAdminBlocked error ${error.message}` });
  }
};

export const setAdminPermissions = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: "permissions must be a list of modules" });
    }

    const admin = await updateAdminPermissions(adminId, cleanModules(permissions));
    if (!admin) {
      return res.status(404).json({ message: "Sub-admin is not found" });
    }
    return res.status(200).json({ message: "Module access updated", admin });
  } catch (error) {
    return res.status(500).json({ message: `SetAdminPermissions error ${error.message}` });
  }
};

export const resetAdminPassword = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (String(adminId) === String(req.adminId)) {
      return res.status(400).json({ message: "Change your own password from Profile" });
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);
    const admin = await updateAdminPassword(adminId, hashPassword);
    if (!admin) {
      return res.status(404).json({ message: "Admin is not found" });
    }
    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    return res.status(500).json({ message: `ResetAdminPassword error ${error.message}` });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Enter valid Email" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existAdmin = await findAdminByEmail(cleanEmail);
    if (existAdmin && String(existAdmin.id) !== String(req.adminId)) {
      return res.status(400).json({ message: "Email is already used by another admin" });
    }

    let admin = await updateAdminById(req.adminId, name.trim(), cleanEmail);
    if (!admin) {
      return res.status(404).json({ message: "Admin does not found" });
    }
    admin = await keepPhotoWithName(admin);
    return res.status(200).json({ message: "Profile updated successfully", admin });
  } catch (error) {
    return res.status(500).json({ message: `UpdateProfile error ${error.message}` });
  }
};

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose an image (max 5 MB)" });
    }
    const current = await findAdminById(req.adminId);
    if (!current) {
      return res.status(404).json({ message: "Admin does not found" });
    }

    // replace: save the new photo, then remove the old one
    const photo = await savePhoto(photoGroup(current), current.name, current.id, req.file);
    const admin = await setAdminPhoto(req.adminId, photo);
    await removePhotoFile(current.photo);
    return res.status(200).json({ message: "Photo updated", admin });
  } catch (error) {
    return res.status(500).json({ message: `UploadPhoto error ${error.message}` });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    const current = await findAdminById(req.adminId);
    await removePhotoFile(current?.photo);
    const admin = await setAdminPhoto(req.adminId, null);
    return res.status(200).json({ message: "Photo removed", admin });
  } catch (error) {
    return res.status(500).json({ message: `DeletePhoto error ${error.message}` });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // the admin may set a new password without the current one; sub-admins must confirm theirs
    const needsCurrent = req.adminRole !== "admin";
    if (!newPassword || (needsCurrent && !currentPassword)) {
      return res.status(400).json({
        message: needsCurrent ? "Current and new password are required" : "New password is required",
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const admin = await findAdminWithPasswordById(req.adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin does not found" });
    }

    if (needsCurrent) {
      const isMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);
    await updateAdminPassword(req.adminId, hashPassword);
    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `ChangePassword error ${error.message}` });
  }
};
