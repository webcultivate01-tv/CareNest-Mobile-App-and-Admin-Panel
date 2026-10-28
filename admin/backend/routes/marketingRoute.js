import express from "express";
import {
  createCampaign,
  getAudience,
  getAudienceDoctors,
  getCampaign,
  getCampaignMessages,
  getCampaigns,
  getChannelStatus,
  stopCampaign,
  updateConsent,
} from "../controllers/marketingController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";
import receiveMedia from "../middleware/receiveMedia.js";

const marketingRouter = express.Router();

marketingRouter.use(isAuth, requireModule("marketing"));

marketingRouter.get("/channels", getChannelStatus);
marketingRouter.get("/doctors", getAudienceDoctors);
marketingRouter.get("/audience", getAudience); // ?search&ageMin&ageMax&joinedFrom&joinedTo&visit&doctorId&specialty&appointmentStatus&reach&consent
marketingRouter.post("/consent", updateConsent);
marketingRouter.get("/campaigns", getCampaigns);
marketingRouter.post("/campaigns", receiveMedia, createCampaign); // multipart: fields + optional "media"
marketingRouter.get("/campaigns/:campaignId", getCampaign);
marketingRouter.get("/campaigns/:campaignId/messages", getCampaignMessages); // ?channel&status&search&page
marketingRouter.post("/campaigns/:campaignId/cancel", stopCampaign);

export default marketingRouter;
