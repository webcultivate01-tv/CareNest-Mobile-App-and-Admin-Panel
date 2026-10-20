import path from "path";

// admin/uploads: profile photos, one folder per person's name inside
// admin/uploads/patients/, admin/uploads/admins/ and admin/uploads/subadmins/ (see photos.js)
export const UPLOADS_DIR = path.resolve(import.meta.dirname, "..", "..", "uploads");
