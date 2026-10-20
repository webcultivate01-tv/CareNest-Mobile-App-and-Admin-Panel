import path from "path";

// admin/uploads: one folder per user (admin/uploads/<userId>/), holding that user's profile photo
export const UPLOADS_DIR = path.resolve(import.meta.dirname, "..", "..", "uploads");
