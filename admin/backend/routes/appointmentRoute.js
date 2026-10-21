import express from "express";
import {
  createAppointment,
  editAppointment,
  getAppointments,
  removeAppointment,
  rescheduleAppointment,
} from "../controllers/appointmentController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const appointmentRouter = express.Router();

appointmentRouter.get("/getappointments", isAuth, requireModule("appointments", "reports", "dashboard"), getAppointments);
appointmentRouter.post("/create", isAuth, requireModule("appointments"), createAppointment);
appointmentRouter.post("/editappointment/:appointmentId", isAuth, requireModule("appointments"), editAppointment);
appointmentRouter.post("/reschedule/:appointmentId", isAuth, requireModule("appointments"), rescheduleAppointment);
appointmentRouter.delete("/remove/:appointmentId", isAuth, requireModule("appointments"), removeAppointment);

export default appointmentRouter;
