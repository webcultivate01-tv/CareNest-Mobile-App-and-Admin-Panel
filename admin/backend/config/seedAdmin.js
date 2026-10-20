import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "./database.js";
import { createAdminTable, upsertAdmin } from "../model/adminModel.js";

dotenv.config();

// run with: npm run seed
const seedAdmin = async () => {
  try {
    const email = (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "admin123";

    await createAdminTable();
    const hashPassword = await bcrypt.hash(password, 10);
    await upsertAdmin("Admin", email, hashPassword);
    console.log(`Admin seeded: ${email}`);
  } catch (error) {
    console.log(`Seed admin error ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seedAdmin();
