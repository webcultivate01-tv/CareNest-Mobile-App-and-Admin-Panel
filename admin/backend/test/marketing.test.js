import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

process.env.DEFAULT_COUNTRY_CODE = "91";

const {
  buildWhatsappPayload,
  fillPlaceholders,
  isStopWord,
  mapTwilioStatus,
  normalizePhone,
  parseWhatsappWebhook,
  planRecipient,
  renderCampaignEmailHtml,
  shouldApplyStatus,
  validateCampaign,
} = await import("../config/marketing.js");
const { verifyWhatsappSignature } = await import("../config/whatsapp.js");
const { verifyTwilioSignature } = await import("../config/sms.js");

const validCampaign = (over = {}) => ({
  name: "Diwali health camp",
  channels: ["whatsapp", "email"],
  title: "Free check-up camp",
  message: "Hi {{firstName}}, join our free camp.",
  whatsappMode: "text",
  patientIds: [1, 2],
  ...over,
});

test("ticks only move forward, like WhatsApp", () => {
  assert.equal(shouldApplyStatus("sent", "delivered"), true);
  assert.equal(shouldApplyStatus("delivered", "read"), true);
  assert.equal(shouldApplyStatus("sent", "read"), true); // read can arrive without delivered
  assert.equal(shouldApplyStatus("read", "delivered"), false); // late delivered never un-blues a read
  assert.equal(shouldApplyStatus("delivered", "sent"), false);
  assert.equal(shouldApplyStatus("sent", "failed"), true);
  assert.equal(shouldApplyStatus("delivered", "failed"), false);
  assert.equal(shouldApplyStatus("failed", "delivered"), false);
  assert.equal(shouldApplyStatus("skipped", "sent"), false);
});

test("phone numbers become full international numbers", () => {
  assert.equal(normalizePhone("9876543210"), "919876543210");
  assert.equal(normalizePhone("98765 43210"), "919876543210");
  assert.equal(normalizePhone("09876543210"), "919876543210");
  assert.equal(normalizePhone("919876543210"), "919876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizePhone("+1 415 555 0100"), "14155550100");
  assert.equal(normalizePhone("0091 9876543210"), "919876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("placeholders are filled per patient", () => {
  const r = { name: "Ravi Kumar Sharma", code: "CNP-007" };
  assert.equal(fillPlaceholders("Hi {{firstName}} ({{ patientId }}), {{name}}", r), "Hi Ravi (CNP-007), Ravi Kumar Sharma");
  assert.equal(fillPlaceholders("{{FIRSTNAME}} {{unknown}}", r), "Ravi {{unknown}}");
  assert.equal(fillPlaceholders("Hi {{firstName}}", { name: "" }), "Hi there");
});

test("WhatsApp, SMS and email need consent; the app inbox needs an app account", () => {
  const agreed = { marketingConsent: true, hasApp: true, phone: "9876543210", email: "ravi@example.com" };
  assert.deepEqual(planRecipient(agreed, "whatsapp"), { address: "919876543210" });
  assert.deepEqual(planRecipient(agreed, "sms"), { address: "919876543210" });
  assert.deepEqual(planRecipient(agreed, "email"), { address: "ravi@example.com" });
  assert.deepEqual(planRecipient(agreed, "app"), { address: null });

  const notAgreed = { ...agreed, marketingConsent: false };
  assert.equal(planRecipient(notAgreed, "whatsapp").skip, "No marketing consent");
  assert.equal(planRecipient(notAgreed, "email").skip, "No marketing consent");
  assert.deepEqual(planRecipient(notAgreed, "app"), { address: null });

  assert.equal(planRecipient({ ...agreed, phone: null }, "sms").skip, "No mobile number");
  assert.equal(planRecipient({ ...agreed, phone: "123" }, "sms").skip, "Mobile number is not valid");
  assert.equal(planRecipient({ ...agreed, email: "not-an-email" }, "email").skip, "No email address");
  assert.equal(planRecipient({ ...agreed, hasApp: false }, "app").skip, "Patient has no app account");
});

test("campaign checks", () => {
  assert.equal(validateCampaign(validCampaign()), null);
  assert.match(validateCampaign(validCampaign({ name: " " })), /name/);
  assert.match(validateCampaign(validCampaign({ channels: [] })), /channel/);
  assert.match(validateCampaign(validCampaign({ channels: ["fax"] })), /Unknown channel/);
  assert.match(validateCampaign(validCampaign({ title: "" })), /title/);
  assert.equal(validateCampaign(validCampaign({ channels: ["whatsapp", "sms"], title: "" })), null); // no title needed
  assert.match(validateCampaign(validCampaign({ message: "" })), /message/);
  assert.match(validateCampaign(validCampaign({ channels: ["sms"], message: "x".repeat(1601) })), /SMS/);
  assert.match(validateCampaign(validCampaign({ patientIds: [] })), /patient/);
  assert.match(validateCampaign(validCampaign({ patientIds: [1, "2"] })), /not valid/);
  assert.match(validateCampaign(validCampaign({ scheduledAt: "2000-01-01T00:00:00Z" })), /past/);
  assert.equal(validateCampaign(validCampaign({ scheduledAt: new Date(Date.now() + 3600e3).toISOString() })), null);

  // media
  const png = { mimetype: "image/png", size: 1000 };
  assert.equal(validateCampaign(validCampaign({ media: png })), null);
  assert.match(validateCampaign(validCampaign({ media: { mimetype: "image/gif", size: 10 } })), /JPG or PNG/);
  assert.match(validateCampaign(validCampaign({ media: { mimetype: "image/png", size: 6 * 1024 * 1024 } })), /5 MB/);
  assert.match(validateCampaign(validCampaign({ media: png, message: "x".repeat(1100) })), /caption/);

  // template mode
  const template = { whatsappMode: "template", whatsappTemplate: "health_camp", whatsappLanguage: "en", whatsappParams: ["{{firstName}}"] };
  assert.equal(validateCampaign(validCampaign(template)), null);
  assert.equal(validateCampaign(validCampaign({ ...template, media: png, message: "x".repeat(1100) })), null); // no caption limit
  assert.match(validateCampaign(validCampaign({ ...template, whatsappTemplate: "Health Camp" })), /template name/);
  assert.match(validateCampaign(validCampaign({ ...template, whatsappLanguage: "english" })), /language/);
  assert.match(validateCampaign(validCampaign({ ...template, whatsappParams: [" "] })), /variable/);
});

test("WhatsApp payloads: free text, media caption and approved template", () => {
  const recipient = { name: "Ravi Kumar", code: "CNP-007" };
  const text = buildWhatsappPayload({ to: "919876543210", campaign: { message: "Hi {{firstName}}", whatsappMode: "text" }, recipient });
  assert.deepEqual(text, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "919876543210",
    type: "text",
    text: { body: "Hi Ravi", preview_url: true },
  });

  const image = buildWhatsappPayload({
    to: "919876543210",
    campaign: { message: "Hi {{firstName}}", whatsappMode: "text", mediaType: "image/jpeg" },
    recipient,
    mediaId: "MEDIA1",
  });
  assert.equal(image.type, "image");
  assert.deepEqual(image.image, { id: "MEDIA1", caption: "Hi Ravi" });

  const pdf = buildWhatsappPayload({
    to: "919876543210",
    campaign: { message: "Report", whatsappMode: "text", mediaType: "application/pdf", mediaName: "camp.pdf" },
    recipient,
    mediaId: "MEDIA2",
  });
  assert.deepEqual(pdf.document, { id: "MEDIA2", filename: "camp.pdf", caption: "Report" });

  const template = buildWhatsappPayload({
    to: "919876543210",
    campaign: {
      message: "for records",
      whatsappMode: "template",
      whatsappTemplate: "health_camp",
      whatsappLanguage: "en_US",
      whatsappParams: ["{{firstName}}", "{{patientId}}"],
      mediaType: "image/png",
    },
    recipient,
    mediaId: "MEDIA3",
  });
  assert.deepEqual(template.template, {
    name: "health_camp",
    language: { code: "en_US" },
    components: [
      { type: "header", parameters: [{ type: "image", image: { id: "MEDIA3" } }] },
      { type: "body", parameters: [{ type: "text", text: "Ravi" }, { type: "text", text: "CNP-007" }] },
    ],
  });
});

test("Meta webhook: receipts and replies are read out", () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.1", status: "delivered", timestamp: "1767225600" },
                { id: "wamid.2", status: "failed", timestamp: "1767225600", errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Not on WhatsApp" } }] },
                { id: "wamid.3", status: "deleted" },
              ],
              messages: [{ from: "919876543210", type: "text", text: { body: "STOP" } }],
            },
          },
        ],
      },
    ],
  };
  const { statuses, messages } = parseWhatsappWebhook(body);
  assert.equal(statuses.length, 2);
  assert.deepEqual(statuses[0], { providerId: "wamid.1", status: "delivered", at: new Date(1767225600 * 1000), error: null });
  assert.equal(statuses[1].error, "Message undeliverable: Not on WhatsApp");
  assert.deepEqual(messages, [{ from: "919876543210", text: "STOP" }]);
  assert.deepEqual(parseWhatsappWebhook({}), { statuses: [], messages: [] });
});

test("STOP replies and Twilio statuses", () => {
  for (const word of ["STOP", " stop ", "Unsubscribe", "opt out", "STOP!"]) assert.equal(isStopWord(word), true, word);
  for (const word of ["please stop calling me later", "cancel", "", "stopped"]) assert.equal(isStopWord(word), false, word);
  assert.equal(mapTwilioStatus("delivered"), "delivered");
  assert.equal(mapTwilioStatus("undelivered"), "failed");
  assert.equal(mapTwilioStatus("queued"), null);
});

test("webhook signatures", () => {
  process.env.WHATSAPP_APP_SECRET = "app-secret";
  const raw = Buffer.from('{"entry":[]}');
  const good = `sha256=${crypto.createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  assert.equal(verifyWhatsappSignature(raw, good), true);
  assert.equal(verifyWhatsappSignature(Buffer.from('{"entry":[1]}'), good), false);
  assert.equal(verifyWhatsappSignature(raw, "sha256=short"), false);
  assert.equal(verifyWhatsappSignature(raw, undefined), false);

  process.env.TWILIO_AUTH_TOKEN = "twilio-token";
  process.env.TWILIO_STATUS_CALLBACK_URL = "https://example.com/api/webhook/sms/status";
  const params = { MessageStatus: "delivered", MessageSid: "SM1" };
  const signature = crypto
    .createHmac("sha1", "twilio-token")
    .update("https://example.com/api/webhook/sms/statusMessageSidSM1MessageStatusdelivered")
    .digest("base64");
  assert.equal(verifyTwilioSignature(params, signature), true);
  assert.equal(verifyTwilioSignature({ ...params, MessageStatus: "read" }, signature), false);
});

test("marketing email escapes the message and carries tracking + unsubscribe", () => {
  const html = renderCampaignEmailHtml({
    title: "Camp <b>",
    message: "Line 1\nLine 2\n\n<script>x</script>",
    image: true,
    openUrl: "https://api.example.com/api/webhook/email/open/abc",
    unsubscribeUrl: "https://api.example.com/api/webhook/unsubscribe/abc",
  });
  assert.ok(html.includes("Camp &lt;b&gt;"));
  assert.ok(html.includes("Line 1<br>Line 2"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('src="cid:campaign-media"'));
  assert.ok(html.includes("/api/webhook/email/open/abc"));
  assert.ok(html.includes("/api/webhook/unsubscribe/abc"));
});
