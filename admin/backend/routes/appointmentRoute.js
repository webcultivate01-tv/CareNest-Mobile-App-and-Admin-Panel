import express from "express";
import {
  createAppointment,
  editAppointment,
  getAppointments,
  removeAppointment,
} from "../controllers/appointmentController.js";
import isAuth from "../middleware/isAuth.js";

const appointmentRouter = express.Router();

appointmentRouter.get("/getappointments", isAuth, getAppointments);
appointmentRouter.post("/create", isAuth, createAppointment);
appointmentRouter.post("/editappointment/:appointmentId", isAuth, editAppointment);
appointmentRouter.delete("/remove/:appointmentId", isAuth, removeAppointment);

export default appointmentRouter;
