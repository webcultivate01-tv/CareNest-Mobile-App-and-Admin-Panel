import multer from "multer";

// keep the image in memory; the controller saves it under admin/uploads/ (see config/photos.js)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  // reject with a message (a silent skip would look like "no file sent")
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only image files are allowed")),
});

// run multer by hand so a too-big file gives a clear message instead of a crash
const receivePhoto = (req, res, next) =>
  upload.single("photo")(req, res, (err) =>
    err ? res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Image must be under 5 MB" : err.message }) : next()
  );

export default receivePhoto;
