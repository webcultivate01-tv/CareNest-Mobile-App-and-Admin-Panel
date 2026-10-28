import { query } from "../config/database.js";
import { addDays, clinicTime, clinicToday, freeSlotsOf, getDayBoard, isValidDateString, toMinutes } from "../config/booking.js";
import { movePhoto, removePhotoFile, savePhoto } from "../config/photos.js";
import {
  deleteDoctorById,
  deleteExceptionById,
  findAllSchedules,
  findDoctorById,
  findDoctors,
  findExceptionById,
  findExceptions,
  findSchedule,
  insertDoctor,
  insertException,
  replaceSchedule,
  setDoctorPhoto,
  setDoctorStatus,
  updateDoctorById,
  updateExceptionById,
} from "../model/doctorModel.js";

const EXCEPTION_REASONS = ["Personal Leave", "Emergency", "Clinic Closed", "Slot Blocked", "Other"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// multipart forms send everything as text
const toBool = (value) => value === true || value === "true";

// checks + cleans the doctor form; returns { error } or { values }
const readDoctorForm = (body) => {
  const name = (body.name || "").trim();
  const specialty = (body.specialty || "").trim();
  const qualifications = (body.qualifications || "").trim();
  const fee = Number(body.fee);
  const appointmentDuration = Number(body.appointmentDuration || 15);
  const experienceYears = body.experienceYears === "" || body.experienceYears == null ? 0 : Number(body.experienceYears);

  if (name.length < 2) return { error: "Enter the doctor's full name" };
  if (!specialty) return { error: "Specialization is required" };
  if (qualifications.length > 200) return { error: "Qualifications must be under 200 characters" };
  if (body.fee === "" || body.fee == null || !Number.isFinite(fee) || fee < 0) {
    return { error: "Consultation fee must be 0 or more" };
  }
  if (fee > 1000000) return { error: "Consultation fee is too large" };
  if (!Number.isInteger(appointmentDuration) || appointmentDuration < 5 || appointmentDuration > 240) {
    return { error: "Appointment duration must be between 5 and 240 minutes" };
  }
  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80) {
    return { error: "Years of experience must be between 0 and 80" };
  }

  return {
    values: {
      name,
      specialty,
      qualifications: qualifications || null,
      experienceYears,
      fee: Math.round(fee * 100) / 100,
      appointmentDuration,
      isAvailable: body.isAvailable === undefined ? true : toBool(body.isAvailable),
    },
  };
};

export const getDoctors = async (req, res) => {
  try {
    const [doctors, schedules] = await Promise.all([findDoctors(req.query.search), findAllSchedules()]);
    return res.status(200).json(doctors.map((d) => ({ ...d, schedule: schedules[d.id] || [] })));
  } catch (error) {
    return res.status(500).json({ message: `GetDoctors error ${error.message}` });
  }
};

export const getDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await findDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    const [schedule, exceptions] = await Promise.all([findSchedule(doctorId), findExceptions(doctorId, clinicToday())]);
    return res.status(200).json({ ...doctor, schedule, exceptions });
  } catch (error) {
    return res.status(500).json({ message: `GetDoctor error ${error.message}` });
  }
};

export const createDoctor = async (req, res) => {
  try {
    const { error, values } = readDoctorForm(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    let doctor = await insertDoctor(values);
    if (req.file) {
      const photo = await savePhoto("doctors", doctor.name, doctor.id, req.file);
      doctor = await setDoctorPhoto(doctor.id, photo);
    }
    return res.status(201).json({ message: "Doctor created successfully", doctor: { ...doctor, schedule: [] } });
  } catch (error) {
    return res.status(500).json({ message: `CreateDoctor error ${error.message}` });
  }
};

export const editDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const oldDoctor = await findDoctorById(doctorId);
    if (!oldDoctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    const { error, values } = readDoctorForm(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    let doctor = await updateDoctorById(doctorId, values);

    // photo: new file replaces the old one, removePhoto="true" deletes it, a rename moves the folder
    if (req.file) {
      const photo = await savePhoto("doctors", doctor.name, doctor.id, req.file);
      doctor = await setDoctorPhoto(doctor.id, photo);
      await removePhotoFile(oldDoctor.photo);
    } else if (toBool(req.body.removePhoto) && oldDoctor.photo) {
      await removePhotoFile(oldDoctor.photo);
      doctor = await setDoctorPhoto(doctor.id, null);
    } else if (doctor.photo) {
      const photo = await movePhoto(doctor.photo, "doctors", doctor.name);
      if (photo !== doctor.photo) doctor = await setDoctorPhoto(doctor.id, photo);
    }

    const schedule = await findSchedule(doctorId);
    return res.status(200).json({ message: "Doctor updated successfully", doctor: { ...doctor, schedule } });
  } catch (error) {
    return res.status(500).json({ message: `EditDoctor error ${error.message}` });
  }
};

// active / inactive. Inactive doctors disappear from patient booking straight away.
export const changeDoctorStatus = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { isAvailable } = req.body;
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "Status must be active or inactive" });
    }
    const doctor = await setDoctorStatus(doctorId, isAvailable);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    const schedule = await findSchedule(doctorId);
    return res.status(200).json({
      message: isAvailable ? "Doctor activated" : "Doctor deactivated",
      doctor: { ...doctor, schedule },
    });
  } catch (error) {
    return res.status(500).json({ message: `ChangeDoctorStatus error ${error.message}` });
  }
};

export const removeDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const doctor = await deleteDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    await removePhotoFile(doctor.photo);
    return res.status(200).json({ message: "Doctor removed successfully" });
  } catch (error) {
    return res.status(500).json({ message: `RemoveDoctor error ${error.message}` });
  }
};

// ---- weekly schedule ----

export const getSchedule = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!(await findDoctorById(doctorId))) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    return res.status(200).json(await findSchedule(doctorId));
  } catch (error) {
    return res.status(500).json({ message: `GetSchedule error ${error.message}` });
  }
};

// body: { days: [{ weekday: 1, shifts: [{ start, end }], breaks: [{ start, end }] }] }
// a day that is missing, or has no shifts, is a day off
export const saveSchedule = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { days } = req.body;
    if (!(await findDoctorById(doctorId))) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    if (!Array.isArray(days)) {
      return res.status(400).json({ message: "Schedule is required" });
    }

    const rows = [];
    const seenDays = new Set();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const day of days) {
      const { weekday } = day;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || seenDays.has(weekday)) {
        return res.status(400).json({ message: "Invalid day in schedule" });
      }
      seenDays.add(weekday);
      const name = dayNames[weekday];
      const shifts = day.shifts || [];
      const breaks = day.breaks || [];
      if (shifts.length > 4 || breaks.length > 6) {
        return res.status(400).json({ message: `${name}: too many shifts or breaks` });
      }
      if (shifts.length === 0 && breaks.length > 0) continue;

      const readRange = (r, label) => {
        if (!TIME.test(r?.start || "") || !TIME.test(r?.end || "")) return `${name}: enter a valid ${label} time`;
        if (toMinutes(r.end) <= toMinutes(r.start)) return `${name}: ${label} end time must be after the start time`;
        return null;
      };
      for (const shift of shifts) {
        const problem = readRange(shift, "shift");
        if (problem) return res.status(400).json({ message: problem });
      }
      for (const brk of breaks) {
        const problem = readRange(brk, "break");
        if (problem) return res.status(400).json({ message: problem });
        const inside = shifts.some((s) => toMinutes(brk.start) >= toMinutes(s.start) && toMinutes(brk.end) <= toMinutes(s.end));
        if (!inside) return res.status(400).json({ message: `${name}: a break must be inside a working shift` });
      }
      const sorted = [...shifts].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) {
          return res.status(400).json({ message: `${name}: shifts must not overlap` });
        }
      }
      shifts.forEach((s) => rows.push({ weekday, kind: "shift", start: s.start, end: s.end }));
      breaks.forEach((b) => rows.push({ weekday, kind: "break", start: b.start, end: b.end }));
    }

    await replaceSchedule(doctorId, rows);
    return res.status(200).json({ message: "Schedule saved successfully", schedule: await findSchedule(doctorId) });
  } catch (error) {
    return res.status(500).json({ message: `SaveSchedule error ${error.message}` });
  }
};

// ---- date-specific exceptions (leave) ----

// checks + cleans the exception form; returns { error } or { values }
const readException = (body) => {
  const { date, fullDay, startTime, endTime, reason } = body;
  if (!isValidDateString(date)) return { error: "Choose a valid date" };
  if (date < clinicToday()) return { error: "Choose today or a future date" };
  if (typeof fullDay !== "boolean") return { error: "Choose full day or part of the day" };
  if (reason && !EXCEPTION_REASONS.includes(reason)) return { error: "Invalid reason" };
  if (!fullDay) {
    if (!TIME.test(startTime || "") || !TIME.test(endTime || "")) return { error: "Enter a start and end time" };
    if (toMinutes(endTime) <= toMinutes(startTime)) return { error: "End time must be after the start time" };
  }
  return {
    values: { date, fullDay, startTime: fullDay ? null : startTime, endTime: fullDay ? null : endTime, reason: reason || null },
  };
};

// how many already-booked appointments fall inside the blocked time (admin should call those patients)
const countAffected = async (doctorId, e) => {
  const from = clinicTime(e.date, e.fullDay ? 0 : toMinutes(e.startTime));
  const to = clinicTime(e.fullDay ? addDays(e.date, 1) : e.date, e.fullDay ? 0 : toMinutes(e.endTime));
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM appointments
     WHERE "doctorId" = $1 AND status IN ('pending','confirmed') AND "scheduledAt" >= $2 AND "scheduledAt" < $3`,
    [doctorId, from, to]
  );
  return rows[0].count;
};

export const getExceptions = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!(await findDoctorById(doctorId))) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    return res.status(200).json(await findExceptions(doctorId, clinicToday()));
  } catch (error) {
    return res.status(500).json({ message: `GetExceptions error ${error.message}` });
  }
};

export const createException = async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!(await findDoctorById(doctorId))) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    const { error, values } = readException(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const exception = await insertException(doctorId, values);
    const affected = await countAffected(doctorId, values);
    return res.status(201).json({ message: "Unavailable time saved", exception, affectedAppointments: affected });
  } catch (error) {
    return res.status(500).json({ message: `CreateException error ${error.message}` });
  }
};

export const editException = async (req, res) => {
  try {
    const { doctorId, exceptionId } = req.params;
    if (!(await findExceptionById(doctorId, exceptionId))) {
      return res.status(404).json({ message: "Unavailable time is not found" });
    }
    const { error, values } = readException(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }
    const exception = await updateExceptionById(doctorId, exceptionId, values);
    const affected = await countAffected(doctorId, values);
    return res.status(200).json({ message: "Unavailable time updated", exception, affectedAppointments: affected });
  } catch (error) {
    return res.status(500).json({ message: `EditException error ${error.message}` });
  }
};

export const removeException = async (req, res) => {
  try {
    const { doctorId, exceptionId } = req.params;
    const exception = await deleteExceptionById(doctorId, exceptionId);
    if (!exception) {
      return res.status(404).json({ message: "Unavailable time is not found" });
    }
    return res.status(200).json({ message: "Unavailable time removed" });
  } catch (error) {
    return res.status(500).json({ message: `RemoveException error ${error.message}` });
  }
};

// admin preview of the free slots patients will see
export const getSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    const doctor = await findDoctorById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    if (!isValidDateString(date)) {
      return res.status(400).json({ message: "Choose a valid date" });
    }
    // closed = why the whole day takes no bookings (leave, cutoff, daily limit...), or null
    const board = await getDayBoard(doctor, date);
    return res.status(200).json({ date, slots: freeSlotsOf(board), closed: board.closed });
  } catch (error) {
    return res.status(500).json({ message: `GetSlots error ${error.message}` });
  }
};
