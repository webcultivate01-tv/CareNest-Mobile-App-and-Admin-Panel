import jwt from "jsonwebtoken";
import { findAdminById } from "../model/adminModel.js";

const isAuth = async (req, res, next) => {
  try {
    const { token } = req.cookies;
    if (!token) {
      return res.status(400).json({ message: "Admin does not have token" });
    }

    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
    if (!verifyToken.adminId) {
      return res.status(400).json({ message: "Admin does not have a valid token" });
    }

    // checked on every request so removing or blocking an account takes effect immediately
    const admin = await findAdminById(verifyToken.adminId);
    if (!admin) {
      return res.status(401).json({ message: "Admin account no longer exists" });
    }
    if (admin.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked" });
    }

    req.adminId = admin.id;
    req.adminRole = admin.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: `isAuth error ${error.message}` });
  }
};

export const isPrimaryAdmin = (req, res, next) => {
  if (req.adminRole !== "admin") {
    return res.status(403).json({ message: "Only the admin can manage sub-admins" });
  }
  next();
};

export default isAuth;
