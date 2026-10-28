import express from "express";
import { handleRazorpayWebhook } from "../controllers/webhookController.js";
import {
  handleSmsStatus,
  handleWhatsappWebhook,
  showUnsubscribe,
  trackEmailOpen,
  unsubscribe,
  verifyWhatsappWebhook,
} from "../controllers/marketingWebhookController.js";

const webhookRouter = express.Router();

// no isAuth - Razorpay authenticates itself via the x-razorpay-signature header (see
// webhookController.js). The raw body this needs is set up in index.js.
webhookRouter.post("/razorpay", handleRazorpayWebhook);

// Marketing module (see marketingWebhookController.js). Meta signs with x-hub-signature-256 (raw
// body set up in index.js), Twilio with x-twilio-signature (form body set up in index.js), and the
// email links carry a per-email random token.
webhookRouter.get("/whatsapp", verifyWhatsappWebhook);
webhookRouter.post("/whatsapp", handleWhatsappWebhook);
webhookRouter.post("/sms/status", handleSmsStatus);
webhookRouter.get("/email/open/:token", trackEmailOpen);
webhookRouter.get("/unsubscribe/:token", showUnsubscribe);
webhookRouter.post("/unsubscribe/:token", unsubscribe);

export default webhookRouter;
