import multer from "multer";
import { MEDIA_RULES } from "../config/marketing.js";

// Campaign media (one image / video / PDF), kept in memory until the campaign passes its checks;
// the controller then saves it under admin/uploads/marketing/. The per-type size limits are checked
// in validateCampaign() - this limit is just the largest of them.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(...Object.values(MEDIA_RULES).map((r) => r.max)), files: 1 },
  fileFilter: (req, file, cb) =>
    MEDIA_RULES[file.mimetype] ? cb(null, true) : cb(new Error("Media must be a JPG or PNG image, an MP4 video or a PDF")),
});

const receiveMedia = (req, res, next) =>
  upload.single("media")(req, res, (err) =>
    err ? res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Media must be under 16 MB" : err.message }) : next()
  );

export default receiveMedia;
