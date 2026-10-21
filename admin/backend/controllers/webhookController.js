import { verifyWebhookSignature } from "../config/razorpay.js";
import { applyPaymentCaptured, applyPaymentFailed, applyRefund } from "../model/paymentModel.js";

// Public endpoint (no isAuth) - Razorpay calls this directly. req.body here is the RAW request
// buffer (see index.js, which mounts express.raw() for this one path before the global
// express.json()), because the signature must be verified against the exact bytes sent.
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature || !verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = JSON.parse(req.body.toString("utf8"));
    const payment = event.payload?.payment?.entity;
    const refund = event.payload?.refund?.entity;

    if (event.event === "payment.captured" && payment) {
      await applyPaymentCaptured(payment);
    } else if (event.event === "payment.failed" && payment) {
      await applyPaymentFailed(payment);
    } else if (refund) {
      // covers refund.created / refund.processed / refund.failed / refund.speed_changed - applyRefund
      // itself decides what to do based on refund.status, so every refund-related event is safe to pass through
      await applyRefund(refund);
    }
    // any other event type is acknowledged but ignored - Razorpay only needs a 200 to stop retrying
    return res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    return res.status(500).json({ message: `RazorpayWebhook error ${error.message}` });
  }
};
