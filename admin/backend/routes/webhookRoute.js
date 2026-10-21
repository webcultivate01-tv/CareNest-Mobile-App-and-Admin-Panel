import express from "express";
import { handleRazorpayWebhook } from "../controllers/webhookController.js";

const webhookRouter = express.Router();

// no isAuth - Razorpay authenticates itself via the x-razorpay-signature header (see
// webhookController.js). The raw body this needs is set up in index.js.
webhookRouter.post("/razorpay", handleRazorpayWebhook);

export default webhookRouter;
