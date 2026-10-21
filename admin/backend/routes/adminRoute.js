import express from "express";
import {
  changePassword,
  createAdmin,
  deletePhoto,
  editAdmin,
  getAdmins,
  removeAdmin,
  resetAdminPassword,
  setAdminBlocked,
  setAdminPermissions,
  updateProfile,
  uploadPhoto,
} from "../controllers/adminController.js";
import isAuth, { isPrimaryAdmin } from "../middleware/isAuth.js";
import receivePhoto from "../middleware/receivePhoto.js";

const adminRouter = express.Router();

adminRouter.get("/getadmins", isAuth, getAdmins);
adminRouter.post("/updateprofile", isAuth, updateProfile);
adminRouter.post("/changepassword", isAuth, changePassword);
// own photo: admin/uploads/admins/<name>/ or admin/uploads/subadmins/<name>/
adminRouter.post("/photo", isAuth, receivePhoto, uploadPhoto);
adminRouter.delete("/photo", isAuth, deletePhoto);

// only the admin can manage accounts; new accounts are always sub-admins
adminRouter.post("/create", isAuth, isPrimaryAdmin, createAdmin);
adminRouter.post("/edit/:adminId", isAuth, isPrimaryAdmin, editAdmin);
adminRouter.post("/block/:adminId", isAuth, isPrimaryAdmin, setAdminBlocked);
adminRouter.post("/permissions/:adminId", isAuth, isPrimaryAdmin, setAdminPermissions);
adminRouter.post("/resetpassword/:adminId", isAuth, isPrimaryAdmin, resetAdminPassword);
adminRouter.delete("/remove/:adminId", isAuth, isPrimaryAdmin, removeAdmin);

export default adminRouter;
