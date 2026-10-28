import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// SMS for the Marketing module, sent through Twilio.
//
// .env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_FROM                    sender number / DLT sender ID, or instead
//   TWILIO_MESSAGING_SERVICE_SID   a Messaging Service (recommended for India DLT)
//   TWILIO_STATUS_CALLBACK_URL     the public URL of /api/webhook/sms/status - Twilio posts the
//                                  delivered / failed receipts there (the ticks)
//
// India: promotional SMS must use a DLT-registered sender and a DLT-registered template, so the
// text typed in the campaign has to match a template registered for your sender.
//
// Until the account SID, token and a sender are set, SMS runs in TEST MODE (simulated ticks).
// Only this file knows about Twilio: another provider means replacing these three functions.

export const isSmsConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

// to = international digits without "+" (normalizePhone). Never throws.
// -> { status: "sent", providerId: "SM..." } or { status: "failed", error }
export const sendSms = async ({ to, body }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const form = new URLSearchParams({ To: `+${to}`, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM);
  if (process.env.TWILIO_STATUS_CALLBACK_URL) form.set("StatusCallback", process.env.TWILIO_STATUS_CALLBACK_URL);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sid) {
      return { status: "failed", error: `${data.message || `SMS API error (HTTP ${res.status})`}${data.code ? ` (code ${data.code})` : ""}` };
    }
    return { status: "sent", providerId: data.sid };
  } catch (error) {
    return { status: "failed", error: `Could not reach the SMS provider: ${error.message}` };
  }
};

// Twilio signs each callback: base64 HMAC-SHA1 of the exact callback URL followed by every POST
// field (sorted by name) as name+value, keyed with the auth token.
export const verifyTwilioSignature = (params, signature) => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const url = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!token || !url || typeof signature !== "string") return false;
  const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
  const expected = Buffer.from(crypto.createHmac("sha1", token).update(data, "utf8").digest("base64"));
  const given = Buffer.from(signature);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};
