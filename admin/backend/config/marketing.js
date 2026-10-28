import { escapeHtml } from "./notifications.js";

// The marketing module: the hospital picks patients in the admin panel and sends them one message
// on WhatsApp, SMS, email and/or the app inbox. Everything in this file is pure (no database, no
// network), so the rules that decide who gets what - and how a delivery receipt moves the ticks -
// are unit-tested on their own (see test/marketing.test.js).
//
// The ticks shown in the admin panel follow WhatsApp:
//   queued / sending  -> clock          (waiting in our queue)
//   sent              -> one grey tick  (the provider accepted it)
//   delivered         -> two grey ticks (it reached the patient's phone / inbox)
//   read              -> two blue ticks (the patient opened it)
//   failed            -> red cross      (with the provider's reason)
//   skipped           -> dash           (never sent: no consent, no number, cancelled...)

export const CHANNELS = ["whatsapp", "sms", "email", "app"];

export const CHANNEL_LABELS = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", app: "App notification" };

export const MESSAGE_STATUSES = ["queued", "sending", "sent", "delivered", "read", "failed", "skipped"];

// how far along a message is; a receipt may only ever move it forward (providers deliver receipts
// out of order - a "read" can arrive before its "delivered")
export const PROGRESS = ["queued", "sending", "sent", "delivered", "read"];

// Should a receipt with status `next` replace the stored `current` status?
//  - progress only moves forward
//  - "failed" only lands on a message that has not been delivered yet (a late failure for a
//    delivered message is noise), and nothing moves a failed or skipped message again
export const shouldApplyStatus = (current, next) => {
  if (current === "failed" || current === "skipped") return false;
  if (next === "failed") return ["sending", "sent"].includes(current);
  const from = PROGRESS.indexOf(current);
  const to = PROGRESS.indexOf(next);
  return to !== -1 && to > from;
};

// patients' numbers are saved as typed (usually 10 digits). Providers want the full international
// number, digits only for WhatsApp ("919876543210") and with a + for SMS ("+919876543210").
// Returns the digits, or null when it can not be a real mobile number.
export const normalizePhone = (raw, countryCode = process.env.DEFAULT_COUNTRY_CODE || "91") => {
  if (!raw) return null;
  const text = String(raw).trim();
  let digits = text.replace(/\D/g, "");
  const cc = String(countryCode).replace(/\D/g, "");
  const international = text.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1); // 09876543210
  if (digits.length === 10) return cc + digits;
  if (digits.length === cc.length + 10 && digits.startsWith(cc)) return digits;
  return null;
};

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

// {{name}}, {{firstName}} and {{patientId}} are filled per patient; anything else is left as typed
export const PLACEHOLDERS = ["name", "firstName", "patientId"];

export const fillPlaceholders = (text, recipient) =>
  String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const k = key.toLowerCase();
    if (k === "name") return String(recipient.name || "").trim() || "there";
    if (k === "firstname") return firstName(recipient.name);
    if (k === "patientid") return recipient.code || "";
    return match;
  });

// What happens to one patient on one channel when the campaign is created:
// either an address to send to, or the reason it is skipped. App notifications go to the patient's
// own inbox in our app, so they need an app account but no marketing consent; WhatsApp, SMS and
// email reach the patient outside our app and are only ever sent with consent.
export const planRecipient = (patient, channel) => {
  if (channel === "app") {
    return patient.hasApp ? { address: null } : { skip: "Patient has no app account" };
  }
  if (!patient.marketingConsent) return { skip: "No marketing consent" };
  if (channel === "email") {
    return isValidEmail(patient.email) ? { address: patient.email.trim() } : { skip: "No email address" };
  }
  const phone = normalizePhone(patient.phone);
  if (!phone) return { skip: patient.phone ? "Mobile number is not valid" : "No mobile number" };
  return { address: phone };
};

// ---- campaign input checks (shared by the controller and the tests) ----

export const MEDIA_RULES = {
  "image/jpeg": { kind: "image", max: 5 * 1024 * 1024, ext: ".jpg" },
  "image/png": { kind: "image", max: 5 * 1024 * 1024, ext: ".png" },
  "video/mp4": { kind: "video", max: 16 * 1024 * 1024, ext: ".mp4" },
  "application/pdf": { kind: "document", max: 16 * 1024 * 1024, ext: ".pdf" },
};

export const LIMITS = {
  name: 120,
  title: 150,
  message: 4096, // WhatsApp text limit
  caption: 1024, // WhatsApp media caption limit
  sms: 1600, // Twilio's limit for one (multi-part) SMS
  recipients: 10000,
};

// returns a message for the first problem, or null when the campaign can be created
export const validateCampaign = (c) => {
  if (!c.name?.trim()) return "Give the campaign a name";
  if (c.name.trim().length > LIMITS.name) return `Campaign name must be under ${LIMITS.name} characters`;
  if (!Array.isArray(c.channels) || !c.channels.length) return "Choose at least one channel";
  if (c.channels.some((ch) => !CHANNELS.includes(ch))) return "Unknown channel";
  const needsTitle = c.channels.includes("email") || c.channels.includes("app");
  if (needsTitle && !c.title?.trim()) return "Add a title (it is the email subject and the app notification title)";
  if (c.title && c.title.trim().length > LIMITS.title) return `Title must be under ${LIMITS.title} characters`;
  if (!c.message?.trim()) return "Type the message";
  if (c.message.length > LIMITS.message) return `Message must be under ${LIMITS.message} characters`;
  if (c.channels.includes("sms") && c.message.length > LIMITS.sms) {
    return `SMS can carry at most ${LIMITS.sms} characters - shorten the message or untick SMS`;
  }
  if (c.channels.includes("whatsapp")) {
    if (!["text", "template"].includes(c.whatsappMode)) return "Choose how WhatsApp sends the message";
    if (c.whatsappMode === "template") {
      if (!/^[a-z0-9_]{1,512}$/.test(c.whatsappTemplate || "")) {
        return "WhatsApp template name: lowercase letters, numbers and _ only (as approved in Meta)";
      }
      if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(c.whatsappLanguage || "")) return "WhatsApp template language looks wrong (e.g. en, en_US, hi)";
      if (!Array.isArray(c.whatsappParams) || c.whatsappParams.some((p) => typeof p !== "string" || !p.trim())) {
        return "Fill every WhatsApp template variable";
      }
    } else if (c.media && c.message.length > LIMITS.caption) {
      return `With media, the WhatsApp caption can be at most ${LIMITS.caption} characters`;
    }
  }
  if (c.media) {
    const rule = MEDIA_RULES[c.media.mimetype];
    if (!rule) return "Media must be a JPG or PNG image, an MP4 video or a PDF";
    if (c.media.size > rule.max) return `This ${rule.kind} must be under ${rule.max / 1024 / 1024} MB`;
  }
  if (!Array.isArray(c.patientIds) || !c.patientIds.length) return "Select at least one patient";
  if (c.patientIds.length > LIMITS.recipients) return `At most ${LIMITS.recipients} patients per campaign`;
  if (c.patientIds.some((id) => !Number.isInteger(id) || id <= 0)) return "Patient list is not valid";
  if (c.scheduledAt) {
    const at = new Date(c.scheduledAt);
    if (Number.isNaN(at.getTime())) return "Schedule time is not valid";
    if (at.getTime() < Date.now() - 60 * 1000) return "Schedule time is in the past";
    if (at.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) return "Schedule at most 90 days ahead";
  }
  return null;
};

// ---- WhatsApp Cloud API payloads ----

// The request body for POST /{phone-number-id}/messages.
//   mode "template": a Meta-approved template (the only way to message a patient who has not
//                    written to you in the last 24 hours - which is what marketing needs)
//   mode "text":     free text / media with a caption (reaches only patients inside that 24h window)
export const buildWhatsappPayload = ({ to, campaign, recipient, mediaId }) => {
  const kind = campaign.mediaType ? MEDIA_RULES[campaign.mediaType]?.kind : null;
  const media = mediaId && kind ? { id: mediaId } : null;
  if (media && kind === "document") media.filename = campaign.mediaName || "document.pdf";

  if (campaign.whatsappMode === "template") {
    const components = [];
    if (media) components.push({ type: "header", parameters: [{ type: kind, [kind]: media }] });
    const params = campaign.whatsappParams || [];
    if (params.length) {
      components.push({
        type: "body",
        parameters: params.map((p) => ({ type: "text", text: fillPlaceholders(p, recipient) })),
      });
    }
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: { name: campaign.whatsappTemplate, language: { code: campaign.whatsappLanguage }, components },
    };
  }

  const text = fillPlaceholders(campaign.message, recipient);
  if (media) {
    return { messaging_product: "whatsapp", recipient_type: "individual", to, type: kind, [kind]: { ...media, caption: text } };
  }
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: true } };
};

// Meta's webhook body -> { statuses: [{ providerId, status, at, error }], messages: [{ from, text }] }
// Meta statuses are exactly ours: sent / delivered / read / failed.
export const parseWhatsappWebhook = (body) => {
  const statuses = [];
  const messages = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const s of value.statuses || []) {
        if (!s?.id || !["sent", "delivered", "read", "failed"].includes(s.status)) continue;
        const err = s.errors?.[0];
        statuses.push({
          providerId: s.id,
          status: s.status,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
          error: err ? [err.title || err.message, err.error_data?.details].filter(Boolean).join(": ") || `Error ${err.code}` : null,
        });
      }
      for (const m of value.messages || []) {
        if (m?.from) messages.push({ from: m.from, text: m.type === "text" ? m.text?.body || "" : m.button?.text || "" });
      }
    }
  }
  return { statuses, messages };
};

// "STOP", "unsubscribe" etc. as the patient's whole reply means: no more marketing
export const isStopWord = (text) => /^\s*(stop|unsubscribe|stop all|opt ?out)\s*[.!]*\s*$/i.test(String(text || ""));

// Twilio's MessageStatus -> ours (null = an in-between state we do not show)
export const mapTwilioStatus = (status) =>
  ({ sent: "sent", delivered: "delivered", read: "read", undelivered: "failed", failed: "failed" })[status] || null;

// ---- the marketing email ----

const BRAND = "#1E7F4F";

// message: the patient's personalised text; image: true to show the inline image (cid:campaign-media)
export const renderCampaignEmailHtml = ({ title, message, image, attachmentName, openUrl, unsubscribeUrl }) => {
  const paragraphs = escapeHtml(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:#374151;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${BRAND};padding:20px 24px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">CareNest</span>
          <span style="color:#cdebd9;font-size:12px;display:block;margin-top:2px;">Your health, our priority</span>
        </td></tr>
        ${image ? `<tr><td><img src="cid:campaign-media" alt="" width="560" style="display:block;width:100%;height:auto;border:0;"></td></tr>` : ""}
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 14px;font-size:20px;color:#111827;">${escapeHtml(title)}</h1>
          ${paragraphs}
          ${attachmentName ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Attached: ${escapeHtml(attachmentName)}</p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#fafbfa;border-top:1px solid #eef1ef;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:18px;">You are receiving this because you agreed to hear from CareNest.
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;">Unsubscribe</a></p>
        </td></tr>
      </table>
      <img src="${escapeHtml(openUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">
    </td></tr>
  </table>
  </body></html>`;
};

export const renderCampaignEmailText = ({ title, message, unsubscribeUrl }) =>
  ["CareNest", "", title, "", message, "", `Unsubscribe: ${unsubscribeUrl}`].join("\n");
