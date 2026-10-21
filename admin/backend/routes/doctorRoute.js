import express from "express";
import {
  changeDoctorStatus,
  createDoctor,
  createException,
  editDoctor,
  editException,
  getDoctor,
  getDoctors,
  getExceptions,
  getSchedule,
  getSlots,
  removeDoctor,
  removeException,
  saveSchedule,
} from "../controllers/doctorController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";
import receivePhoto from "../middleware/receivePhoto.js";

const doctorRouter = express.Router();

doctorRouter.get("/getdoctors", isAuth, requireModule("doctors", "appointments", "reports", "dashboard"), getDoctors); // ?search=name or specialization
doctorRouter.get("/getdoctor/:doctorId", isAuth, requireModule("doctors", "appointments", "reports", "dashboard"), getDoctor);
doctorRouter.post("/create", isAuth, requireModule("doctors"), receivePhoto, createDoctor);
doctorRouter.post("/editdoctor/:doctorId", isAuth, requireModule("doctors"), receivePhoto, editDoctor);
doctorRouter.post("/status/:doctorId", isAuth, requireModule("doctors"), changeDoctorStatus);
doctorRouter.delete("/remove/:doctorId", isAuth, requireModule("doctors"), removeDoctor);

doctorRouter.get("/schedule/:doctorId", isAuth, requireModule("doctors", "appointments", "reports", "dashboard"), getSchedule);
doctorRouter.post("/schedule/:doctorId", isAuth, requireModule("doctors"), saveSchedule);

doctorRouter.get("/exceptions/:doctorId", isAuth, requireModule("doctors", "appointments", "reports", "dashboard"), getExceptions);
doctorRouter.post("/exception/:doctorId", isAuth, requireModule("doctors"), createException);
doctorRouter.post("/editexception/:doctorId/:exceptionId", isAuth, requireModule("doctors"), editException);
doctorRouter.delete("/removeexception/:doctorId/:exceptionId", isAuth, requireModule("doctors"), removeException);

doctorRouter.get("/slots/:doctorId", isAuth, requireModule("appointments", "doctors"), getSlots); // ?date=YYYY-MM-DD

export default doctorRouter;
