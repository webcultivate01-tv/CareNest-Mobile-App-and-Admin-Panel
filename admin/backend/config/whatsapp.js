import crypto from "crypto";
import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

// WhatsApp Business Cloud API (Meta) - used by the Marketing module.
//
// .env:
//   WHATSAPP_TOKEN            permanent access token (System User token from Meta Business Settings)
//   WHATSAPP_PHONE_NUMBER_ID  the "Phone number ID" shown in WhatsApp > API Setup (not the number itself)
//   WHATSAPP_APP_SECRET       App Settings > Basic > App secret - proves a webhook really came from Meta
//   WHATSAPP_VERIFY_TOKEN     any random text; type the same text in the Meta webhook setup
//   WHATSAPP_API_VERSION      optional, default below
//
// Until WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set, the module runs in TEST MODE: nothing
// leaves the server and the ticks are simulated so the panel can be tried end to end.

const API_VERSION = () => process.env.WHATSAPP_API_VERSION || "v23.0";
const graphUrl = (path) => `https://graph.facebook.com/${API_VERSION()}/${path}`;

export const isWhatsappConfigured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// "(#131030) Recipient phone number not in allowed list - details (code 131030)"
const metaError = (data, httpStatus) => {
  const e = data?.error;
  if (!e) return `WhatsApp API error (HTTP ${httpStatus})`;
  return `${[e.message, e.error_data?.details].filter(Boolean).join(" - ")}${e.code ? ` (code ${e.code})` : ""}`;
};

// Uploads the campaign media once; the returned id is used in every message of the campaign.
export const uploadWhatsappMedia = async ({ filePath, mimeType, fileName }) => {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([await fs.readFile(filePath)], { type: mimeType }), fileName);
  const res = await fetch(graphUrl(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`), {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Media upload failed: ${metaError(data, res.status)}`);
  return data.id;
};

// payload = buildWhatsappPayload() from config/marketing.js. Never throws.
// -> { status: "sent", providerId: "wamid..." } or { status: "failed", error }
export const sendWhatsapp = async (payload) => {
  try {
    const res = await fetch(graphUrl(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    const providerId = data.messages?.[0]?.id;
    if (!res.ok || !providerId) return { status: "failed", error: metaError(data, res.status) };
    return { status: "sent", providerId };
  } catch (error) {
    return { status: "failed", error: `Could not reach WhatsApp: ${error.message}` };
  }
};

// Meta signs every webhook with the app secret: X-Hub-Signature-256: sha256=<hex HMAC of raw body>
export const verifyWhatsappSignature = (rawBody, header) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || typeof header !== "string") return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};
