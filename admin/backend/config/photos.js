import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "./paths.js";

// Profile photos are saved as admin/uploads/<group>/<person name>/<file>
// and stored in the DB as the relative path "uploads/<group>/<person name>/<file>".
// group: "patients", "doctors", "admins" or "subadmins"

const EXTENSIONS = { "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif" };

// folder name = person's name, minus characters Windows/Linux don't allow in folder names
const folderName = (name) =>
  (name || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "unnamed";

// "uploads/<group>/<name>/<file>" -> full path on disk
const photoFile = (photo) => path.join(UPLOADS_DIR, ...photo.split("/").slice(1));

// write an uploaded image (multer memory file) and return the path to store in the DB;
// the id in the file name keeps two people with the same name (same folder) apart
export const savePhoto = async (group, name, id, file) => {
  const folder = folderName(name);
  const fileName = `profile-${id}-${Date.now()}${EXTENSIONS[file.mimetype] || ".jpg"}`;
  await fs.mkdir(path.join(UPLOADS_DIR, group, folder), { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, group, folder, fileName), file.buffer);
  return `uploads/${group}/${folder}/${fileName}`;
};

// only removes this person's own file; the folder goes too once it is empty
export const removePhotoFile = async (photo) => {
  if (!photo) return;
  const file = photoFile(photo);
  await fs.rm(file, { force: true });
  await fs.rmdir(path.dirname(file)).catch(() => {}); // fails (and is skipped) if not empty
};

// after a name change, move the photo into the folder for the new name.
// returns the new DB path (the same path when nothing had to move)
export const movePhoto = async (photo, group, name) => {
  if (!photo) return photo;
  const newPhoto = `uploads/${group}/${folderName(name)}/${photo.split("/").pop()}`;
  if (newPhoto === photo) return photo;

  await fs.mkdir(path.dirname(photoFile(newPhoto)), { recursive: true });
  await fs.rename(photoFile(photo), photoFile(newPhoto));
  await fs.rmdir(path.dirname(photoFile(photo))).catch(() => {});
  return newPhoto;
};

// full URL for a stored path (names can have spaces, so encode each part)
export const photoUrl = (req, photo) =>
  photo ? `${req.protocol}://${req.get("host")}/${photo.split("/").map(encodeURIComponent).join("/")}` : null;
