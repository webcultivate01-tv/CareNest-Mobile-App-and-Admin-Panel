import express from "express";
import {
  callNext,
  checkIn,
  completeConsultation,
  getBoard,
  startConsultation,
} from "../controllers/queueController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const queueRouter = express.Router();

queueRouter.get("/board", isAuth, requireModule("queue"), getBoard); // ?date=YYYY-MM-DD (default today)
queueRouter.post("/checkin/:appointmentId", isAuth, requireModule("queue"), checkIn);
queueRouter.post("/start/:appointmentId", isAuth, requireModule("queue"), startConsultation);
queueRouter.post("/complete/:appointmentId", isAuth, requireModule("queue"), completeConsultation); // { callNext? }
queueRouter.post("/callnext/:doctorId", isAuth, requireModule("queue"), callNext);

export default queueRouter;
