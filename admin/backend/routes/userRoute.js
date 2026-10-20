import express from "express";
import { deletePhoto, getCurrentUser, login, signUp, updateProfile, uploadPhoto } from "../controllers/userController.js";
import isUserAuth from "../middleware/isUserAuth.js";
import {
  bookAppointment,
  getBookableDoctors,
  getDoctorDays,
  getDoctorSlots,
  getMyAppointments,
} from "../controllers/bookingController.js";
import receivePhoto from "../middleware/receivePhoto.js";

const userRouter = express.Router();

userRouter.post("/signup", signUp);
userRouter.post("/login", login);
userRouter.get("/getcurrentuser", isUserAuth, getCurrentUser);
userRouter.put("/profile", isUserAuth, updateProfile);
// photo is saved in admin/uploads/patients/<patient name>/
userRouter.post("/photo", isUserAuth, receivePhoto, uploadPhoto);
userRouter.delete("/photo", isUserAuth, deletePhoto);

// booking: active doctors only; slots come from schedule + leave + existing bookings
userRouter.get("/doctors", isUserAuth, getBookableDoctors);
userRouter.get("/doctordays/:doctorId", isUserAuth, getDoctorDays);
userRouter.get("/doctorslots/:doctorId", isUserAuth, getDoctorSlots); // ?date=YYYY-MM-DD
userRouter.post("/bookappointment", isUserAuth, bookAppointment);
userRouter.get("/myappointments", isUserAuth, getMyAppointments);

export default userRouter;
