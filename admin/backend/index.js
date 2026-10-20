import express from "express";
import fs from "fs";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import connectDB from "./config/database.js";
import authRouter from "./routes/authRoute.js";
import doctorRouter from "./routes/doctorRoute.js";
import patientRouter from "./routes/patientRoute.js";
import appointmentRouter from "./routes/appointmentRoute.js";
import dashboardRouter from "./routes/dashboardRoute.js";
import userRouter from "./routes/userRoute.js";
import adminRouter from "./routes/adminRoute.js";
import { UPLOADS_DIR } from "./config/paths.js";

dotenv.config();
fs.mkdirSync(UPLOADS_DIR, { recursive: true }); // profile photos: admin/uploads/<patients|admins|subadmins>/<name>/
const app = express();

app.use(express.json());
app.use(cookieParser());
// CLIENT_URL can list several origins, comma-separated (admin site + Expo web).
app.use(cors({ origin: process.env.CLIENT_URL.split(",").map((s) => s.trim()), credentials: true }));

app.use("/uploads", express.static(UPLOADS_DIR)); // profile photos
app.use("/api/auth", authRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/patient", patientRouter);
app.use("/api/appointment", appointmentRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/admin", adminRouter);
app.use("/api/user", userRouter); // mobile app: signup / login

app.get("/", (req, res) => res.send("CareNest Admin API"));

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`);
  connectDB();
});
