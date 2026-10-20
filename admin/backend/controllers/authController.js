import bcrypt from "bcryptjs";
import validator from "validator";
import { genToken } from "../config/token.js";
import { findAdminByEmail, findAdminById } from "../model/adminModel.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Enter valid Email" });
    }

    const admin = await findAdminByEmail(email.trim().toLowerCase());
    if (!admin) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = genToken(admin.id);
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ id: admin.id, name: admin.name, email: admin.email });
  } catch (error) {
    return res.status(500).json({ message: `Login error ${error.message}` });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "none" });
    return res.status(200).json({ message: "Logout Successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Logout error ${error.message}` });
  }
};

export const getCurrentAdmin = async (req, res) => {
  try {
    const admin = await findAdminById(req.adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin does not found" });
    }
    return res.status(200).json(admin);
  } catch (error) {
    return res.status(500).json({ message: `GetCurrentAdmin error ${error.message}` });
  }
};
