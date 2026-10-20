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
import isAuth from "../middleware/isAuth.js";
import receivePhoto from "../middleware/receivePhoto.js";

const doctorRouter = express.Router();

doctorRouter.get("/getdoctors", isAuth, getDoctors); // ?search=name or specialization
doctorRouter.get("/getdoctor/:doctorId", isAuth, getDoctor);
doctorRouter.post("/create", isAuth, receivePhoto, createDoctor);
doctorRouter.post("/editdoctor/:doctorId", isAuth, receivePhoto, editDoctor);
doctorRouter.post("/status/:doctorId", isAuth, changeDoctorStatus);
doctorRouter.delete("/remove/:doctorId", isAuth, removeDoctor);

doctorRouter.get("/schedule/:doctorId", isAuth, getSchedule);
doctorRouter.post("/schedule/:doctorId", isAuth, saveSchedule);

doctorRouter.get("/exceptions/:doctorId", isAuth, getExceptions);
doctorRouter.post("/exception/:doctorId", isAuth, createException);
doctorRouter.post("/editexception/:doctorId/:exceptionId", isAuth, editException);
doctorRouter.delete("/removeexception/:doctorId/:exceptionId", isAuth, removeException);

doctorRouter.get("/slots/:doctorId", isAuth, getSlots); // ?date=YYYY-MM-DD

export default doctorRouter;
