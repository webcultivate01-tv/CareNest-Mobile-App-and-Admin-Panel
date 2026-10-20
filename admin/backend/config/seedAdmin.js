import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "./database.js";
import { createAdminTable, ensurePrimaryAdmin, upsertAdmin } from "../model/adminModel.js";

dotenv.config();

// run with: npm run seed
const seedAdmin = async () => {
  try {
    const email = (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "admin123";

    await createAdminTable();
    const hashPassword = await bcrypt.hash(password, 10);
    await upsertAdmin("Admin", email, hashPassword);
    await ensurePrimaryAdmin(); // on a fresh database the seeded account is the admin
    console.log(`Admin seeded: ${email}`);

    // ten subadmins sharing one password; seeded after the admin so they never become primary
    const subadminHash = await bcrypt.hash("admin123", 10);
    for (let i = 1; i <= 10; i++) {
      const subEmail = `subadmin${i}@gmail.com`;
      const subPhone = `+91 98765 432${String(i - 1).padStart(2, "0")}`; // dummy numbers
      await upsertAdmin(`Subadmin ${i}`, subEmail, subadminHash, subPhone);
      console.log(`Subadmin seeded: ${subEmail} (${subPhone})`);
    }
  } catch (error) {
    console.log(`Seed admin error ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seedAdmin();
