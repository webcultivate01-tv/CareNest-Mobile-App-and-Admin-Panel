import express from "express";
import { deletePhoto, getCurrentUser, login, signUp, updateProfile, uploadPhoto } from "../controllers/userController.js";
import isUserAuth from "../middleware/isUserAuth.js";
import {
  bookAppointment,
  createPaymentOrder,
  getBookableDoctors,
  getDoctorDays,
  getDoctorSlots,
  getMyAppointments,
  verifyPayment,
} from "../controllers/bookingController.js";
import receivePhoto from "../middleware/receivePhoto.js";
import {
  changePassword,
  forgotPassword,
  resetPassword,
  verifyPasswordOtp,
} from "../controllers/passwordController.js";
import {
  getMyNotifications,
  getUnreadCount,
  readAllNotifications,
  readNotification,
  removeNotification,
} from "../controllers/notificationController.js";

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

// payment for an already-booked appointment (see bookingController.js)
userRouter.post("/payment/order", isUserAuth, createPaymentOrder);
userRouter.post("/payment/verify", isUserAuth, verifyPayment);

// forgot password by email OTP: forgot -> verify-otp -> reset (see passwordController.js).
// These three are public by design - the patient can not sign in at this point.
userRouter.post("/password/forgot", forgotPassword);
userRouter.post("/password/verify-otp", verifyPasswordOtp);
userRouter.post("/password/reset", resetPassword);
userRouter.post("/password/change", isUserAuth, changePassword); // already signed in

// notification inbox (the bell in the app)
userRouter.get("/notifications", isUserAuth, getMyNotifications);
userRouter.get("/notifications/unread", isUserAuth, getUnreadCount);
userRouter.post("/notifications/readall", isUserAuth, readAllNotifications);
userRouter.post("/notifications/:notificationId/read", isUserAuth, readNotification);
userRouter.delete("/notifications/:notificationId", isUserAuth, removeNotification);

export default userRouter;
