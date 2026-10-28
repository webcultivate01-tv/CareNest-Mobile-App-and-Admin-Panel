import { verifyWhatsappSignature } from "../config/whatsapp.js";
import { verifyTwilioSignature } from "../config/sms.js";
import { escapeHtml } from "../config/notifications.js";
import { isStopWord, mapTwilioStatus, parseWhatsappWebhook } from "../config/marketing.js";
import { applyReceipt, findMessageByToken, markEmailOpened } from "../model/campaignModel.js";
import { revokeConsentByPhone, setMarketingConsent } from "../model/patientModel.js";

// Public endpoints (no isAuth) for the Marketing module - called by Meta, Twilio, or the patient's
// mail client. Each one proves where it came from: Meta and Twilio sign their requests, and the
// email links carry a random 32-character token that only that one email contains.

const isToken = (value) => /^[a-f0-9]{32}$/.test(String(value || ""));

// ---- WhatsApp (Meta) ----

// Meta's one-time check when the webhook URL is saved in the Meta dashboard
export const verifyWhatsappWebhook = (req, res) => {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === expected) {
    return res.status(200).type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  }
  return res.status(403).send("Forbidden");
};

// Delivery receipts (sent / delivered / read / failed) and patients' replies. req.body is the RAW
// buffer (see index.js) because the signature is over the exact bytes Meta sent.
export const handleWhatsappWebhook = async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !verifyWhatsappSignature(req.body, req.headers["x-hub-signature-256"])) {
      return res.status(401).json({ message: "Invalid webhook signature" });
    }
    const { statuses, messages } = parseWhatsappWebhook(JSON.parse(req.body.toString("utf8")));
    for (const receipt of statuses) await applyReceipt({ channel: "whatsapp", ...receipt });
    for (const reply of messages) {
      if (isStopWord(reply.text)) {
        const ids = await revokeConsentByPhone(reply.from, "whatsapp_stop");
        if (ids.length) console.log(`WhatsApp STOP from ${reply.from}: marketing consent withdrawn for patient(s) ${ids.join(", ")}`);
      }
    }
    return res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    // a 500 makes Meta deliver the same webhook again later, which is safe: receipts only move forward
    return res.status(500).json({ message: `WhatsappWebhook error ${error.message}` });
  }
};

// ---- SMS (Twilio status callback, form-encoded - see index.js) ----

export const handleSmsStatus = async (req, res) => {
  try {
    if (!verifyTwilioSignature(req.body || {}, req.headers["x-twilio-signature"])) {
      return res.status(403).send("Invalid signature");
    }
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
    const status = mapTwilioStatus(MessageStatus);
    if (MessageSid && status) {
      await applyReceipt({
        channel: "sms",
        providerId: MessageSid,
        status,
        error: status === "failed" ? ErrorMessage || (ErrorCode ? `SMS was not delivered (error ${ErrorCode})` : "SMS was not delivered") : null,
        at: new Date(),
      });
    }
    return res.status(200).type("text/xml").send("<Response></Response>");
  } catch (error) {
    return res.status(500).send(`SmsStatus error ${error.message}`);
  }
};

// ---- email ----

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// The tracking image in each marketing email: loading it means the email was opened (blue ticks).
// Always answers with the image, whatever happens, so the email never shows a broken picture.
export const trackEmailOpen = async (req, res) => {
  try {
    if (isToken(req.params.token)) await markEmailOpened(req.params.token);
  } catch (error) {
    console.log(`Email open tracking error ${error.message}`);
  }
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private", Pragma: "no-cache" });
  return res.status(200).send(PIXEL);
};

const page = (title, body, form = "") => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f7f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:460px;margin:48px auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:center;">
<p style="margin:0 0 6px;color:#1E7F4F;font-weight:700;font-size:20px;">CareNest</p>
<h1 style="margin:12px 0 10px;font-size:19px;color:#111827;">${escapeHtml(title)}</h1>
<p style="margin:0;color:#4b5563;font-size:14px;line-height:22px;">${escapeHtml(body)}</p>${form}
</div></body></html>`;

// Opening the link only ASKS. Mail security scanners open every link in an email, so a GET that
// unsubscribed straight away would unsubscribe patients who never clicked anything.
export const showUnsubscribe = async (req, res) => {
  if (!isToken(req.params.token) || !(await findMessageByToken(req.params.token).catch(() => null))) {
    return res.status(404).type("html").send(page("Link not valid", "This unsubscribe link is not valid or has expired."));
  }
  const form = `<form method="post" style="margin-top:22px;">
<button type="submit" style="background:#1E7F4F;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600;cursor:pointer;">Unsubscribe</button></form>`;
  return res
    .status(200)
    .type("html")
    .send(page("Stop marketing messages?", "You will no longer receive offers and health updates from CareNest on WhatsApp, SMS or email. Appointment and payment messages are not affected.", form));
};

// the button above, and mail clients' one-click unsubscribe (RFC 8058), both POST here
export const unsubscribe = async (req, res) => {
  try {
    const message = isToken(req.params.token) ? await findMessageByToken(req.params.token) : null;
    if (!message) return res.status(404).type("html").send(page("Link not valid", "This unsubscribe link is not valid or has expired."));
    if (message.patientId) await setMarketingConsent([message.patientId], false, "unsubscribe_link");
    return res
      .status(200)
      .type("html")
      .send(page("You are unsubscribed", "You will not receive marketing messages from CareNest any more. You can turn them back on in the CareNest app under Profile."));
  } catch (error) {
    return res.status(500).type("html").send(page("Something went wrong", "Please try again in a moment."));
  }
};
