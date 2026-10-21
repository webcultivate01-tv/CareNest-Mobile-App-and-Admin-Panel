import express from "express";
import { getStats } from "../controllers/dashboardController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const dashboardRouter = express.Router();

dashboardRouter.get("/getstats", isAuth, requireModule("dashboard", "appointments"), getStats);

export default dashboardRouter;
