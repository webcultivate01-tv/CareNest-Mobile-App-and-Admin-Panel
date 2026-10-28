import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "../config/paths.js";
import { isMailConfigured } from "../config/mailer.js";
import { isWhatsappConfigured } from "../config/whatsapp.js";
import { isSmsConfigured } from "../config/sms.js";
import { kickCampaignSender, publicServerUrl } from "../config/campaignSender.js";
import { CHANNELS, MEDIA_RULES, MESSAGE_STATUSES, planRecipient, validateCampaign } from "../config/marketing.js";
import { appointmentStatuses } from "../model/appointmentModel.js";
import { AUDIENCE_LIMIT, findAudience, findPatientsForCampaign, setMarketingConsent } from "../model/patientModel.js";
import {
  cancelCampaign,
  findAudienceDoctors,
  findCampaignById,
  findCampaignMessages,
  findCampaigns,
  insertCampaign,
} from "../model/campaignModel.js";

// Marketing module (admin panel). Every route is behind isAuth + requireModule("marketing").

const sendError = (res, name, error) => res.status(500).json({ message: `${name} error ${error.message}` });

const isValidId = (value) => /^\d+$/.test(String(value));

// ---- small input readers: return undefined when the value is present but wrong ----

const readInt = (value, min, max) => {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

const readDate = (value) => {
  if (value === undefined || value === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? value : undefined;
};

const readEnum = (value, allowed) => {
  if (value === undefined || value === "") return null;
  return allowed.includes(value) ? value : undefined;
};

const readText = (value, max) => {
  if (value === undefined || value === "") return null;
  return typeof value === "string" && value.length <= max ? value.trim() || null : undefined;
};

// "within:30" (visited in the last 30 days), "over:90" (visited before, but not in 90 days), "never"
const readVisit = (value) => {
  if (value === undefined || value === "") return null;
  if (value === "never") return { type: "never" };
  const m = /^(within|over):(\d{1,4})$/.exec(value);
  return m && Number(m[2]) >= 1 ? { type: m[1], days: Number(m[2]) } : undefined;
};

const parseJson = (value) => {
  if (value === undefined || value === "") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

// which providers are connected - the panel shows "test mode" for the others
export const getChannelStatus = async (req, res) => {
  return res.status(200).json({
    whatsapp: { configured: isWhatsappConfigured() },
    sms: { configured: isSmsConfigured() },
    email: { configured: isMailConfigured() },
    app: { configured: true },
    publicUrlSet: Boolean(process.env.PUBLIC_SERVER_URL),
    publicUrl: publicServerUrl(),
  });
};

export const getAudienceDoctors = async (req, res) => {
  try {
    return res.status(200).json(await findAudienceDoctors());
  } catch (error) {
    return sendError(res, "GetAudienceDoctors", error);
  }
};

export const getAudience = async (req, res) => {
  try {
    const q = req.query;
    const filters = {
      search: readText(q.search, 100),
      ageMin: readInt(q.ageMin, 0, 150),
      ageMax: readInt(q.ageMax, 0, 150),
      joinedFrom: readDate(q.joinedFrom),
      joinedTo: readDate(q.joinedTo),
      visit: readVisit(q.visit),
      doctorId: readInt(q.doctorId, 1, 2147483647),
      specialty: readText(q.specialty, 100),
      appointmentStatus: readEnum(q.appointmentStatus, appointmentStatuses),
      reach: readEnum(q.reach, ["phone", "email", "app"]),
      consent: readEnum(q.consent, ["yes", "no"]),
    };
    const bad = Object.keys(filters).find((key) => filters[key] === undefined);
    if (bad) return res.status(400).json({ message: `Filter "${bad}" is not valid` });
    if (filters.ageMin !== null && filters.ageMax !== null && filters.ageMin > filters.ageMax) {
      return res.status(400).json({ message: "Minimum age is more than maximum age" });
    }
    if (filters.joinedFrom && filters.joinedTo && filters.joinedFrom > filters.joinedTo) {
      return res.status(400).json({ message: "Joined 'from' date is after the 'to' date" });
    }
    const { patients, truncated } = await findAudience(filters);
    return res.status(200).json({ patients, truncated, limit: AUDIENCE_LIMIT });
  } catch (error) {
    return sendError(res, "GetAudience", error);
  }
};

// staff record that patients agreed (or no longer agree) to marketing messages
export const updateConsent = async (req, res) => {
  try {
    const { patientIds, consent } = req.body;
    if (typeof consent !== "boolean") return res.status(400).json({ message: "Consent must be true or false" });
    if (!Array.isArray(patientIds) || !patientIds.length || patientIds.length > 10000) {
      return res.status(400).json({ message: "Select at least one patient" });
    }
    if (patientIds.some((id) => !Number.isInteger(id) || id <= 0)) return res.status(400).json({ message: "Patient list is not valid" });
    const updated = await setMarketingConsent([...new Set(patientIds)], consent, "staff");
    return res.status(200).json({ message: `Consent updated for ${updated.length} patient(s)`, updated });
  } catch (error) {
    return sendError(res, "UpdateConsent", error);
  }
};

// multipart/form-data: the fields below (arrays as JSON text) + an optional "media" file
export const createCampaign = async (req, res) => {
  let savedMedia = null;
  try {
    const b = req.body || {};
    const channels = parseJson(b.channels);
    const usesWhatsapp = Array.isArray(channels) && channels.includes("whatsapp");
    const input = {
      name: typeof b.name === "string" ? b.name.trim() : "",
      channels: Array.isArray(channels) ? [...new Set(channels)] : channels,
      title: typeof b.title === "string" ? b.title.trim() : "",
      message: typeof b.message === "string" ? b.message.replace(/\r\n/g, "\n").trim() : "",
      whatsappMode: usesWhatsapp ? b.whatsappMode : null,
      whatsappTemplate: usesWhatsapp && b.whatsappMode === "template" ? String(b.whatsappTemplate || "").trim() : null,
      whatsappLanguage: usesWhatsapp && b.whatsappMode === "template" ? String(b.whatsappLanguage || "").trim() : null,
      whatsappParams: usesWhatsapp && b.whatsappMode === "template" ? parseJson(b.whatsappParams) || [] : null,
      patientIds: parseJson(b.patientIds),
      scheduledAt: b.scheduledAt || null,
      media: req.file || null,
    };
    if (Array.isArray(input.whatsappParams)) input.whatsappParams = input.whatsappParams.map((p) => (typeof p === "string" ? p.trim() : p));
    const problem = validateCampaign(input);
    if (problem) return res.status(400).json({ message: problem });

    const patients = await findPatientsForCampaign([...new Set(input.patientIds)]);
    if (!patients.length) return res.status(400).json({ message: "The selected patients no longer exist - refresh the list" });

    // a time within the next minute (or just past) means "now"
    const scheduled = input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now() + 60 * 1000;

    const messages = [];
    for (const patient of patients) {
      for (const channel of CHANNELS.filter((c) => input.channels.includes(c))) {
        const plan = planRecipient(patient, channel);
        messages.push({
          patientId: patient.id,
          name: patient.name,
          code: patient.code,
          channel,
          address: plan.address ?? (channel === "app" ? null : patient[channel === "email" ? "email" : "phone"] || null),
          skip: plan.skip || null,
          token: crypto.randomBytes(16).toString("hex"),
        });
      }
    }

    if (input.media) {
      const fileName = `campaign-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${MEDIA_RULES[input.media.mimetype].ext}`;
      await fs.mkdir(path.join(UPLOADS_DIR, "marketing"), { recursive: true });
      await fs.writeFile(path.join(UPLOADS_DIR, "marketing", fileName), input.media.buffer);
      savedMedia = `uploads/marketing/${fileName}`;
    }

    const campaign = await insertCampaign(
      {
        name: input.name,
        channels: input.channels,
        title: input.title || null,
        message: input.message,
        mediaPath: savedMedia,
        mediaType: input.media?.mimetype || null,
        mediaName: input.media ? path.basename(input.media.originalname || "").slice(0, 120) || null : null,
        whatsappMode: input.whatsappMode || "text",
        whatsappTemplate: input.whatsappTemplate,
        whatsappLanguage: input.whatsappLanguage,
        whatsappParams: input.whatsappParams,
        status: scheduled ? "scheduled" : "sending",
        scheduledAt: scheduled ? new Date(input.scheduledAt) : null,
        createdBy: req.adminId,
      },
      messages
    );
    savedMedia = null; // the campaign owns the file now
    if (!scheduled) kickCampaignSender();
    return res.status(201).json({
      message: scheduled ? "Campaign scheduled" : "Campaign is sending",
      campaign: await findCampaignById(campaign.id),
    });
  } catch (error) {
    if (savedMedia) await fs.rm(path.join(UPLOADS_DIR, ...savedMedia.split("/").slice(1)), { force: true }).catch(() => {});
    return sendError(res, "CreateCampaign", error);
  }
};

export const getCampaigns = async (req, res) => {
  try {
    return res.status(200).json(await findCampaigns());
  } catch (error) {
    return sendError(res, "GetCampaigns", error);
  }
};

export const getCampaign = async (req, res) => {
  try {
    if (!isValidId(req.params.campaignId)) return res.status(404).json({ message: "Campaign is not found" });
    const campaign = await findCampaignById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ message: "Campaign is not found" });
    return res.status(200).json(campaign);
  } catch (error) {
    return sendError(res, "GetCampaign", error);
  }
};

const PAGE_SIZE = 50;

// ?channel=whatsapp&status=read&search=ravi&page=1
export const getCampaignMessages = async (req, res) => {
  try {
    if (!isValidId(req.params.campaignId)) return res.status(404).json({ message: "Campaign is not found" });
    const channel = readEnum(req.query.channel, CHANNELS);
    const status = readEnum(req.query.status, MESSAGE_STATUSES);
    const search = readText(req.query.search, 100);
    const page = readInt(req.query.page, 1, 100000);
    if ([channel, status, search, page].includes(undefined)) return res.status(400).json({ message: "Filter is not valid" });
    const result = await findCampaignMessages(req.params.campaignId, {
      channel,
      status,
      search,
      limit: PAGE_SIZE,
      offset: ((page || 1) - 1) * PAGE_SIZE,
    });
    return res.status(200).json({ ...result, page: page || 1, pageSize: PAGE_SIZE });
  } catch (error) {
    return sendError(res, "GetCampaignMessages", error);
  }
};

export const stopCampaign = async (req, res) => {
  try {
    if (!isValidId(req.params.campaignId)) return res.status(404).json({ message: "Campaign is not found" });
    const cancelled = await cancelCampaign(req.params.campaignId);
    if (!cancelled) return res.status(400).json({ message: "Only a scheduled or sending campaign can be cancelled" });
    return res.status(200).json({ message: "Campaign cancelled", campaign: await findCampaignById(req.params.campaignId) });
  } catch (error) {
    return sendError(res, "StopCampaign", error);
  }
};
