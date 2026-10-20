import express from "express";
import multer from "multer";
import { deletePhoto, getCurrentUser, login, signUp, updateProfile, uploadPhoto } from "../controllers/userController.js";
import isUserAuth from "../middleware/isUserAuth.js";

// keep the image in memory; the controller saves it in admin/uploads/<userId>/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  // reject with a message (a silent skip would look like "no file sent")
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith("image/") ? cb(null, true) : cb(new Error("Only image files are allowed")),
});

const userRouter = express.Router();

userRouter.post("/signup", signUp);
userRouter.post("/login", login);
userRouter.get("/getcurrentuser", isUserAuth, getCurrentUser);
userRouter.put("/profile", isUserAuth, updateProfile);
// run multer by hand so a too-big file gives a clear message instead of a crash
const receivePhoto = (req, res, next) =>
  upload.single("photo")(req, res, (err) =>
    err ? res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Image must be under 5 MB" : err.message }) : next()
  );

userRouter.post("/photo", isUserAuth, receivePhoto, uploadPhoto);
userRouter.delete("/photo", isUserAuth, deletePhoto);

export default userRouter;
