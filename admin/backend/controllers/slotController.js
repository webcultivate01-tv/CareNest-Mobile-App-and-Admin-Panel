import { query } from "../config/database.js";
import { addDays, clinicTime, clinicToday, getDayBoard, isValidDateString, toHHMM, toMinutes } from "../config/booking.js";
import { deleteExceptionById, findDoctorById, insertException, setDoctorDailyLimit } from "../model/doctorModel.js";
import { findBookingSettings, updateBookingSettings } from "../model/settingsModel.js";
import { isValidId } from "./appointmentController.js";

// Admin "Slots & limits" page (Appointments section): the hospital-wide OPD rules and a per-doctor
// slot board. The rules themselves are applied in config/booking.js, for every booking.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SLOT_BLOCK_REASON = "Slot Blocked";

// "" / null = no limit; otherwise a whole number 1..1000. Returns { value } or { error }.
export const readDailyLimit = (value) => {
  if (value === null || value === undefined || value === "") return { value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1000) return { error: "Daily limit must be a whole number from 1 to 1000" };
  return { value: number };
};

// appointments (not cancelled) on one clinic day, all doctors together
const countDayAppointments = async (dateStr) => {
  const { rows } = await query(
    `SELECT count(*)::int AS count FROM appointments
     WHERE status <> 'cancelled' AND "scheduledAt" >= $1 AND "scheduledAt" < $2`,
    [clinicTime(dateStr, 0), clinicTime(addDays(dateStr, 1), 0)]
  );
  return rows[0].count;
};

export const getBookingSettings = async (req, res) => {
  try {
    const settings = await findBookingSettings();
    return res.status(200).json({ ...settings, today: clinicToday(), todayBooked: await countDayAppointments(clinicToday()) });
  } catch (error) {
    return res.status(500).json({ message: `GetBookingSettings error ${error.message}` });
  }
};

// body: { dailyLimit: number | null, cutoffTime: "11:00" | null }
export const saveBookingSettings = async (req, res) => {
  try {
    const { dailyLimit, cutoffTime } = req.body;
    const limit = readDailyLimit(dailyLimit);
    if (limit.error) {
      return res.status(400).json({ message: limit.error });
    }
    if (cutoffTime && !TIME.test(cutoffTime)) {
      return res.status(400).json({ message: "Enter a valid cutoff time" });
    }
    const settings = await updateBookingSettings({ dailyLimit: limit.value, cutoffTime: cutoffTime || null });
    return res.status(200).json({
      message: "Booking rules saved",
      settings: { ...settings, today: clinicToday(), todayBooked: await countDayAppointments(clinicToday()) },
    });
  } catch (error) {
    return res.status(500).json({ message: `SaveBookingSettings error ${error.message}` });
  }
};

// ?date=YYYY-MM-DD -> every slot of the doctor's day with its state (see getDayBoard)
export const getSlotBoard = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    const doctor = isValidId(doctorId) ? await findDoctorById(doctorId) : null;
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    if (!isValidDateString(date)) {
      return res.status(400).json({ message: "Choose a valid date" });
    }
    const board = await getDayBoard(doctor, date);
    return res.status(200).json({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        isAvailable: doctor.isAvailable,
        appointmentDuration: doctor.appointmentDuration,
        dailyLimit: doctor.dailyLimit,
      },
      date,
      ...board,
    });
  } catch (error) {
    return res.status(500).json({ message: `GetSlotBoard error ${error.message}` });
  }
};

// body: { dailyLimit: number | null }
export const saveDoctorLimit = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { dailyLimit } = req.body;
    if (!isValidId(doctorId) || !(await findDoctorById(doctorId))) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    const limit = readDailyLimit(dailyLimit);
    if (limit.error) {
      return res.status(400).json({ message: limit.error });
    }
    const doctor = await setDoctorDailyLimit(doctorId, limit.value);
    return res.status(200).json({ message: "Doctor's daily limit saved", dailyLimit: doctor.dailyLimit });
  } catch (error) {
    return res.status(500).json({ message: `SaveDoctorLimit error ${error.message}` });
  }
};

// body: { date, time: "09:15" } -> blocks exactly that one slot (a part-day exception the size of
// one appointment), so patients can not book it. Shows on the doctor's Availability page too.
export const blockSlot = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, time } = req.body;
    const doctor = isValidId(doctorId) ? await findDoctorById(doctorId) : null;
    if (!doctor) {
      return res.status(404).json({ message: "Doctor is not found" });
    }
    if (!isValidDateString(date) || !TIME.test(time || "")) {
      return res.status(400).json({ message: "Choose a valid slot" });
    }
    const board = await getDayBoard(doctor, date);
    const slot = board.slots.find((s) => s.time === time);
    if (!slot) {
      return res.status(400).json({ message: "This is not one of the doctor's slots" });
    }
    if (slot.state !== "free") {
      return res.status(409).json({ message: `This slot can not be blocked (it is ${slot.state})` });
    }
    const start = toMinutes(time);
    const exception = await insertException(doctor.id, {
      date,
      fullDay: false,
      startTime: time,
      endTime: toHHMM(start + doctor.appointmentDuration),
      reason: SLOT_BLOCK_REASON,
    });
    return res.status(201).json({ message: "Slot blocked", exception });
  } catch (error) {
    return res.status(500).json({ message: `BlockSlot error ${error.message}` });
  }
};

export const unblockSlot = async (req, res) => {
  try {
    const { doctorId, exceptionId } = req.params;
    if (!isValidId(doctorId) || !isValidId(exceptionId)) {
      return res.status(404).json({ message: "Blocked slot is not found" });
    }
    const exception = await deleteExceptionById(doctorId, exceptionId);
    if (!exception) {
      return res.status(404).json({ message: "Blocked slot is not found" });
    }
    return res.status(200).json({ message: "Slot opened again" });
  } catch (error) {
    return res.status(500).json({ message: `UnblockSlot error ${error.message}` });
  }
};
