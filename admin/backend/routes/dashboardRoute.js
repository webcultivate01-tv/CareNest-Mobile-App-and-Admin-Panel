import express from "express";
import { getStats } from "../controllers/dashboardController.js";
import isAuth from "../middleware/isAuth.js";

const dashboardRouter = express.Router();

dashboardRouter.get("/getstats", isAuth, getStats);

export default dashboardRouter;
