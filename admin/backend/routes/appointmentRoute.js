import express from "express";
import {
  createAppointment,
  editAppointment,
  getAppointments,
  removeAppointment,
  rescheduleAppointment,
} from "../controllers/appointmentController.js";
import {
  blockSlot,
  getBookingSettings,
  getSlotBoard,
  saveBookingSettings,
  saveDoctorLimit,
  unblockSlot,
} from "../controllers/slotController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const appointmentRouter = express.Router();

// slots & limits: hospital OPD rules (daily limit, same-day cutoff) and the per-doctor slot board
appointmentRouter.get("/bookingsettings", isAuth, requireModule("appointments"), getBookingSettings);
appointmentRouter.post("/bookingsettings", isAuth, requireModule("appointments"), saveBookingSettings);
appointmentRouter.get("/slotboard/:doctorId", isAuth, requireModule("appointments"), getSlotBoard); // ?date=YYYY-MM-DD
appointmentRouter.post("/doctorlimit/:doctorId", isAuth, requireModule("appointments"), saveDoctorLimit);
appointmentRouter.post("/blockslot/:doctorId", isAuth, requireModule("appointments"), blockSlot);
appointmentRouter.delete("/unblockslot/:doctorId/:exceptionId", isAuth, requireModule("appointments"), unblockSlot);

appointmentRouter.get("/getappointments", isAuth, requireModule("appointments", "reports", "dashboard"), getAppointments);
appointmentRouter.post("/create", isAuth, requireModule("appointments"), createAppointment);
appointmentRouter.post("/editappointment/:appointmentId", isAuth, requireModule("appointments"), editAppointment);
appointmentRouter.post("/reschedule/:appointmentId", isAuth, requireModule("appointments"), rescheduleAppointment);
appointmentRouter.delete("/remove/:appointmentId", isAuth, requireModule("appointments"), removeAppointment);

export default appointmentRouter;
