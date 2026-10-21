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
import isAuth, { isPrimaryAdmin, requireModule } from "../middleware/isAuth.js";

const paymentRouter = express.Router();

paymentRouter.get("/list", isAuth, requireModule("payments"), getPayments);
paymentRouter.get("/summary", isAuth, requireModule("payments", "dashboard"), getPaymentSummary);
paymentRouter.get("/chart", isAuth, requireModule("payments", "dashboard"), getPaymentChart);
paymentRouter.get("/export", isAuth, requireModule("payments"), exportPayments);
paymentRouter.get("/:paymentId/receipt", isAuth, requireModule("payments"), getPaymentReceipt);
paymentRouter.get("/:paymentId", isAuth, requireModule("payments"), getPaymentById);
// refunds move real money - only the primary admin can issue one (same gate as admin-account management)
paymentRouter.post("/refund/:paymentId", isAuth, isPrimaryAdmin, refundPayment);
paymentRouter.post("/reconcile/:paymentId", isAuth, requireModule("payments"), reconcilePayment);

export default paymentRouter;
