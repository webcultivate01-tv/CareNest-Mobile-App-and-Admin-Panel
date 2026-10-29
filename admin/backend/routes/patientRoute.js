import express from "express";
import {
  createPatient,
  editPatient,
  getPatientProfile,
  getPatients,
  removePatient,
} from "../controllers/patientController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const patientRouter = express.Router();

patientRouter.get("/getpatients", isAuth, requireModule("patients", "appointments", "reports", "dashboard"), getPatients);
patientRouter.get("/profile/:patientId", isAuth, requireModule("patients"), getPatientProfile);
patientRouter.post("/create", isAuth, requireModule("patients"), createPatient);
patientRouter.post("/editpatient/:patientId", isAuth, requireModule("patients"), editPatient);
patientRouter.delete("/remove/:patientId", isAuth, requireModule("patients"), removePatient);

export default patientRouter;
