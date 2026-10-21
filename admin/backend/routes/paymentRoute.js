import express from "express";
import {
  exportPayments,
  getPaymentById,
  getPaymentChart,
  getPaymentReceipt,
  getPaymentSummary,
  getPayments,
  reconcilePayment,
  refundPayment,
} from "../controllers/paymentController.js";
import isAuth, { isPrimaryAdmin } from "../middleware/isAuth.js";

const paymentRouter = express.Router();

paymentRouter.get("/list", isAuth, getPayments);
paymentRouter.get("/summary", isAuth, getPaymentSummary);
paymentRouter.get("/chart", isAuth, getPaymentChart);
paymentRouter.get("/export", isAuth, exportPayments);
paymentRouter.get("/:paymentId/receipt", isAuth, getPaymentReceipt);
paymentRouter.get("/:paymentId", isAuth, getPaymentById);
// refunds move real money - only the primary admin can issue one (same gate as admin-account management)
paymentRouter.post("/refund/:paymentId", isAuth, isPrimaryAdmin, refundPayment);
paymentRouter.post("/reconcile/:paymentId", isAuth, reconcilePayment);

export default paymentRouter;
