import express from "express";
import {
  createPatient,
  editPatient,
  getPatients,
  removePatient,
} from "../controllers/patientController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const patientRouter = express.Router();

patientRouter.get("/getpatients", isAuth, requireModule("patients", "appointments", "reports", "dashboard"), getPatients);
patientRouter.post("/create", isAuth, requireModule("patients"), createPatient);
patientRouter.post("/editpatient/:patientId", isAuth, requireModule("patients"), editPatient);
patientRouter.delete("/remove/:patientId", isAuth, requireModule("patients"), removePatient);

export default patientRouter;
