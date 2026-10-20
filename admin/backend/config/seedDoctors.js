import dotenv from "dotenv";
import { pool } from "./database.js";
import { createDoctorTable, findDoctors, insertDoctor, replaceSchedule } from "../model/doctorModel.js";

dotenv.config();

// sample doctors, each with their own fee, appointment duration and weekly hours
// weekday: 0 = Sunday ... 6 = Saturday
const mondayToSaturday = [1, 2, 3, 4, 5, 6];
const doctors = [
  {
    name: "Dr. Amit Deshmukh", specialty: "General Physician", qualifications: "MBBS, MD", experienceYears: 12,
    fee: 500, appointmentDuration: 15,
    days: mondayToSaturday, shifts: [["09:00", "13:00"]], breaks: [["11:00", "11:15"]],
  },
  {
    name: "Dr. Priya Sharma", specialty: "Cardiology", qualifications: "MBBS, DM Cardiology", experienceYears: 15,
    fee: 700, appointmentDuration: 30,
    days: [1, 2, 3, 4, 5], shifts: [["10:00", "13:00"], ["16:00", "19:00"]], breaks: [],
  },
  {
    name: "Dr. Rahul Patil", specialty: "Dermatology", qualifications: "MBBS, MD Dermatology", experienceYears: 7,
    fee: 400, appointmentDuration: 15,
    days: mondayToSaturday, shifts: [["14:00", "18:00"]], breaks: [["16:00", "16:30"]],
  },
  {
    name: "Dr. Sneha Kulkarni", specialty: "Pediatrics", qualifications: "MBBS, DCH", experienceYears: 9,
    fee: 600, appointmentDuration: 20,
    days: [1, 2, 3, 4, 5, 6, 0], shifts: [["09:00", "12:00"]], breaks: [],
  },
  {
    name: "Dr. Vikram Joshi", specialty: "Orthopedics", qualifications: "MBBS, MS Orthopedics", experienceYears: 18,
    fee: 800, appointmentDuration: 30,
    days: [2, 4, 6], shifts: [["10:00", "14:00"]], breaks: [["12:00", "12:30"]],
  },
];

// run with: npm run seed:doctors  (doctors that already exist by name are skipped)
const seedDoctors = async () => {
  try {
    await createDoctorTable();
    const existing = (await findDoctors()).map((d) => d.name);

    for (const d of doctors) {
      if (existing.includes(d.name)) {
        console.log(`Doctor already exists: ${d.name}`);
        continue;
      }
      const doctor = await insertDoctor({ ...d, isAvailable: true });
      const rows = d.days.flatMap((weekday) => [
        ...d.shifts.map(([start, end]) => ({ weekday, kind: "shift", start, end })),
        ...d.breaks.map(([start, end]) => ({ weekday, kind: "break", start, end })),
      ]);
      await replaceSchedule(doctor.id, rows);
      console.log(`Doctor seeded: ${d.name} (₹${d.fee})`);
    }
  } catch (error) {
    console.log(`Seed doctors error ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

seedDoctors();
