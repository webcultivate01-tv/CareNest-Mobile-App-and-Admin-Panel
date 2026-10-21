import express from "express";
import { getRefundList, getRefundSummary, searchRefundableAppointments } from "../controllers/refundController.js";
import isAuth, { isPrimaryAdmin, requireModule } from "../middleware/isAuth.js";

const refundRouter = express.Router();

refundRouter.get("/list", isAuth, requireModule("refunds"), getRefundList);
refundRouter.get("/summary", isAuth, requireModule("refunds"), getRefundSummary);
// search used by the Issue Refund wizard to find a patient/appointment/payment - same gate as actually issuing one
refundRouter.get("/appointments", isAuth, isPrimaryAdmin, searchRefundableAppointments);

export default refundRouter;
