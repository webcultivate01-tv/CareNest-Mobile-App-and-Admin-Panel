import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Razorpay from "razorpay";

// Load backend/.env relative to this file so the keys are found no matter which directory the
// server was launched from.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

// Server-side Razorpay client. Key secret / webhook secret never leave this file.
// Built lazily (not at import time) so the rest of the backend keeps working even before
// RAZORPAY_KEY_ID/SECRET are configured - the SDK throws synchronously on a missing key_id,
// which would otherwise take down doctor/patient/appointment routes too since this module is
// imported alongside them.
let client;
export const razorpay = {
  get orders() {
    return instance().orders;
  },
  get payments() {
    return instance().payments;
  },
};
const instance = () => {
  if (!client) {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keyId || !keySecret) {
      throw Object.assign(new Error("Online payment is not configured on the server. Please contact support."), {
        status: 503,
      });
    }
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return client;
};

const timingSafeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// Checkout success handler gives us orderId + paymentId + signature; this proves the
// triple was actually issued by Razorpay (HMAC with our key secret), it is not "trusting the client".
export const verifyCheckoutSignature = (orderId, paymentId, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
};

// rawBody must be the exact bytes Razorpay sent (a Buffer/string), not a re-serialized JSON object.
export const verifyWebhookSignature = (rawBody, signature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
};
