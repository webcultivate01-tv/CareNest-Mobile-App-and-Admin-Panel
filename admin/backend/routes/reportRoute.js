import express from "express";
import { generateReport, getReportTypes, previewReport } from "../controllers/reportController.js";
import isAuth, { requireModule } from "../middleware/isAuth.js";

const reportRouter = express.Router();

// A report can read patient, doctor, appointment, payment and refund data, so the "reports" module
// is the single gate for all of it: the admin decides per sub-admin who may generate one (see
// config/modules.js). Reports are read-only - nothing here writes to the database.
reportRouter.get("/types", isAuth, requireModule("reports"), getReportTypes);
reportRouter.get("/:reportKey/preview", isAuth, requireModule("reports"), previewReport);
reportRouter.get("/:reportKey/generate", isAuth, requireModule("reports"), generateReport);

export default reportRouter;
