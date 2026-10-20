import express from "express";
import {
  createPatient,
  editPatient,
  getPatients,
  removePatient,
} from "../controllers/patientController.js";
import isAuth from "../middleware/isAuth.js";

const patientRouter = express.Router();

patientRouter.get("/getpatients", isAuth, getPatients);
patientRouter.post("/create", isAuth, createPatient);
patientRouter.post("/editpatient/:patientId", isAuth, editPatient);
patientRouter.delete("/remove/:patientId", isAuth, removePatient);

export default patientRouter;
