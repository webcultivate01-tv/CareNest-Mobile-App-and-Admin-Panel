import express from "express";
import {
  createDoctor,
  editDoctor,
  getDoctors,
  removeDoctor,
} from "../controllers/doctorController.js";
import isAuth from "../middleware/isAuth.js";

const doctorRouter = express.Router();

doctorRouter.get("/getdoctors", isAuth, getDoctors);
doctorRouter.post("/create", isAuth, createDoctor);
doctorRouter.post("/editdoctor/:doctorId", isAuth, editDoctor);
doctorRouter.delete("/remove/:doctorId", isAuth, removeDoctor);

export default doctorRouter;
