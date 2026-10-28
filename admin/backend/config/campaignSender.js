import crypto from "crypto";
import path from "path";
import { UPLOADS_DIR } from "./paths.js";
import { isMailConfigured, sendMail } from "./mailer.js";
import { isWhatsappConfigured, sendWhatsapp, uploadWhatsappMedia } from "./whatsapp.js";
import { isSmsConfigured, sendSms } from "./sms.js";
import {
  MEDIA_RULES,
  buildWhatsappPayload,
  fillPlaceholders,
  renderCampaignEmailHtml,
  renderCampaignEmailText,
} from "./marketing.js";
import { insertNotification } from "../model/notificationModel.js";
import {
  activateDueCampaigns,
  applyEarlyReceipts,
  applyMatchedReceipts,
  applyReceipt,
  claimQueuedMessages,
  completeFinishedCampaigns,
  failInterruptedMessages,
  findCampaignForSending,
  pruneOldReceipts,
  saveSendResult,
  setCampaignWhatsappMediaId,
} from "../model/campaignModel.js";

// The queue behind the Marketing module. Creating a campaign only writes rows; this sender, run
// every few seconds from index.js (and nudged right after a campaign is created), sends them.
//
// Each message is taken from the queue exactly once (see claimQueuedMessages) and is never
// retried automatically - a message that might already have gone out is marked failed instead of
// risking a second copy on the patient's phone. Like the notification module, nothing in here ever
// throws at its caller.

const BATCH = 5; // small, so a server restart can only ever interrupt a handful of messages
const TICK_BUDGET_MS = 50 * 1000;

// links inside emails (open tracking + unsubscribe) must point at a server the patient can reach
export const publicServerUrl = () =>
  (process.env.PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");

export const trackingUrls = (token) => ({
  openUrl: `${publicServerUrl()}/api/webhook/email/open/${token}`,
  unsubscribeUrl: `${publicServerUrl()}/api/webhook/unsubscribe/${token}`,
});

// "uploads/marketing/x.jpg" -> full path on disk
const mediaFile = (campaign) => path.join(UPLOADS_DIR, ...campaign.mediaPath.split("/").slice(1));

// TEST MODE (provider not configured): the message is not sent anywhere; the ticks are moved
// along on a timer so the panel can be tried out. These rows are flagged `simulated`.
const simulateReceipts = (channel, providerId, steps) => {
  for (const [status, delay] of steps) {
    const timer = setTimeout(
      () => applyReceipt({ channel, providerId, status, at: new Date() }).catch((e) => console.log(`Simulated receipt error ${e.message}`)),
      delay
    );
    timer.unref?.();
  }
};
const SIMULATED_STEPS = {
  whatsapp: [["delivered", 2000], ["read", 7000]],
  sms: [["delivered", 3000]],
};

const testResult = (channel, to) => {
  console.log(`[${channel} test mode - not sent] to=${to}`);
  return { status: "sent", providerId: `test-${crypto.randomUUID()}`, simulated: true };
};

const sendWhatsappMessage = async (message, campaign, recipient) => {
  if (!isWhatsappConfigured()) return testResult("whatsapp", message.address);
  if (campaign.mediaPath && !campaign.whatsappMediaId) {
    // one upload per campaign; a failed upload is remembered for this run so it is not retried per patient
    if (campaign.mediaUploadError) return { status: "failed", error: campaign.mediaUploadError };
    try {
      campaign.whatsappMediaId = await uploadWhatsappMedia({
        filePath: mediaFile(campaign),
        mimeType: campaign.mediaType,
        fileName: campaign.mediaName || path.basename(campaign.mediaPath),
      });
      await setCampaignWhatsappMediaId(campaign.id, campaign.whatsappMediaId);
    } catch (error) {
      campaign.mediaUploadError = error.message;
      return { status: "failed", error: error.message };
    }
  }
  return sendWhatsapp(buildWhatsappPayload({ to: message.address, campaign, recipient, mediaId: campaign.whatsappMediaId }));
};

const sendSmsMessage = async (message, campaign, recipient) => {
  if (!isSmsConfigured()) return testResult("sms", message.address);
  return sendSms({ to: message.address, body: fillPlaceholders(campaign.message, recipient) });
};

const sendEmailMessage = async (message, campaign, recipient) => {
  if (!isMailConfigured()) return { status: "skipped", error: "Email is not set up on the server (SMTP) - nothing was sent" };
  const { openUrl, unsubscribeUrl } = trackingUrls(message.token);
  const kind = campaign.mediaType ? MEDIA_RULES[campaign.mediaType]?.kind : null;
  const fileName = campaign.mediaName || (campaign.mediaPath ? path.basename(campaign.mediaPath) : null);
  const title = fillPlaceholders(campaign.title, recipient);
  const text = fillPlaceholders(campaign.message, recipient);
  const result = await sendMail({
    to: message.address,
    subject: title,
    html: renderCampaignEmailHtml({
      title,
      message: text,
      image: kind === "image",
      attachmentName: kind && kind !== "image" ? fileName : null,
      openUrl,
      unsubscribeUrl,
    }),
    text: renderCampaignEmailText({ title, message: text, unsubscribeUrl }),
    attachments: campaign.mediaPath
      ? [{ filename: fileName, path: mediaFile(campaign), ...(kind === "image" ? { cid: "campaign-media" } : {}) }]
      : undefined,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  if (result.status === "sent") return { status: "sent" };
  if (result.status === "skipped") return { status: "skipped", error: "Email is not set up on the server (SMTP) - nothing was sent" };
  return { status: "failed", error: result.error || "Email could not be sent" };
};

// The patient's own inbox in the CareNest app: it is there the moment the row exists (delivered),
// and turns read when the patient opens it (notificationController -> markAppMessagesRead).
const sendAppMessage = async (message, campaign, recipient) => {
  const notification = await insertNotification({
    patientId: message.patientId,
    type: "campaign",
    title: fillPlaceholders(campaign.title, recipient),
    body: fillPlaceholders(campaign.message, recipient),
    data: { campaignId: campaign.id, mediaPath: campaign.mediaPath || undefined, mediaType: campaign.mediaType || undefined },
    dedupeKey: `campaign:${message.id}`,
  });
  if (!notification) return { status: "failed", error: "This message is already in the patient's inbox" };
  return { status: "delivered", providerId: String(notification.id) };
};

const SENDERS = { whatsapp: sendWhatsappMessage, sms: sendSmsMessage, email: sendEmailMessage, app: sendAppMessage };

const sendOne = async (message, campaign) => {
  // checked again at send time: the patient may have been removed or unsubscribed since
  if (!message.patientExists) return { status: "skipped", error: "Patient was removed" };
  if (message.channel !== "app" && !message.currentConsent) return { status: "skipped", error: "Patient withdrew marketing consent" };
  const recipient = { name: message.recipientName, code: message.recipientCode };
  try {
    return await SENDERS[message.channel](message, campaign, recipient);
  } catch (error) {
    return { status: "failed", error: error.message };
  }
};

let running = false; // one run at a time, even if a slow one overruns the next tick
let runAgain = false; // a campaign was created during a run: go round once more straight away

export const runCampaignSender = async () => {
  if (running) {
    runAgain = true;
    return 0;
  }
  running = true;
  runAgain = false;
  let processed = 0;
  try {
    await activateDueCampaigns();
    await failInterruptedMessages();
    await applyMatchedReceipts();
    const campaigns = new Map(); // one read per campaign per run (also holds the uploaded media id)
    const deadline = Date.now() + TICK_BUDGET_MS;
    while (Date.now() < deadline) {
      const batch = await claimQueuedMessages(BATCH);
      if (!batch.length) break;
      for (const message of batch) {
        if (!campaigns.has(message.campaignId)) campaigns.set(message.campaignId, await findCampaignForSending(message.campaignId));
        const result = await sendOne(message, campaigns.get(message.campaignId));
        const saved = await saveSendResult(message.id, result);
        processed++;
        if (saved && result.providerId) {
          await applyEarlyReceipts(message.channel, result.providerId);
          if (result.simulated) simulateReceipts(message.channel, result.providerId, SIMULATED_STEPS[message.channel] || []);
        }
      }
    }
    await completeFinishedCampaigns();
    await pruneOldReceipts();
  } catch (error) {
    console.log(`Campaign sender error ${error.message}`);
  } finally {
    running = false;
    if (runAgain) kickCampaignSender();
  }
  return processed;
};

// called right after a campaign is created, so "Send now" does not wait for the next tick
export const kickCampaignSender = () => {
  setImmediate(() => runCampaignSender().catch((error) => console.log(`Campaign sender error ${error.message}`)));
};

// Called once from index.js after the database is connected.
export const startCampaignSender = (everySeconds = 5) => {
  const tick = () =>
    runCampaignSender()
      .then((count) => count && console.log(`Campaign sender processed ${count} message(s)`))
      .catch((error) => console.log(`Campaign sender error ${error.message}`));
  tick();
  const timer = setInterval(tick, everySeconds * 1000);
  timer.unref?.();
  return timer;
};
