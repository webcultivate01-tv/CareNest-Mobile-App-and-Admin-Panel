import pg from "pg";
import dotenv from "dotenv";
import { createAdminTable } from "../model/adminModel.js";
import { createDoctorTable } from "../model/doctorModel.js";
import { createPatientTable } from "../model/patientModel.js";
import { createAppointmentTable } from "../model/appointmentModel.js";
import { createPaymentTable } from "../model/paymentModel.js";

dotenv.config();

// Supabase requires SSL
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const query = (text, params) => pool.query(text, params);

const connectDB = async () => {
  try {
    await pool.query("SELECT 1");
    // order matters: appointments reference doctors + patients
    await createAdminTable();
    await createDoctorTable();
    await createPatientTable();
    await createAppointmentTable();
    await createPaymentTable();
    console.log("DB Connected");
  } catch (error) {
    console.log(`DB error ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
