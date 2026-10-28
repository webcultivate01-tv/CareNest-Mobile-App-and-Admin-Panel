import { useEffect, useState } from "react";
import axios from "axios";
import { ClipLoader } from "react-spinners";
import { FiCopy, FiPlus, FiX } from "react-icons/fi";
import { toast } from "react-toastify";
import { serverUrl } from "../App";
import { primaryButton, showError, showSuccess } from "./AdminUI";
import { WEEK, formatTime, plainInput } from "./DoctorUI";

// A doctor's weekly working hours (shifts + breaks per weekday). Used on the doctor's Availability
// page and on Appointments -> Slots & limits. Patients can only book inside these hours.

const DEFAULT_SHIFT = { start: "10:00", end: "12:00" };

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// schedule rows from the server -> { [weekday]: { working, shifts, breaks } }
const toWeek = (schedule) => {
  const week = {};
  WEEK.forEach(({ weekday }) => {
    const pick = (kind) => schedule.filter((r) => r.weekday === weekday && r.kind === kind).map((r) => ({ start: r.start, end: r.end }));
    const shifts = pick("shift");
    week[weekday] = { working: shifts.length > 0, shifts, breaks: pick("break") };
  });
  return week;
};

// same rules as the server; returns a message or null
const checkWeek = (week) => {
  for (const { weekday, name } of WEEK) {
    const day = week[weekday];
    if (!day.working) continue;
    if (day.shifts.length === 0) return `${name}: add working hours or mark the day as off`;
    for (const range of [...day.shifts, ...day.breaks]) {
      if (!range.start || !range.end) return `${name}: fill in every start and end time`;
      if (toMinutes(range.end) <= toMinutes(range.start)) return `${name}: end time must be after the start time`;
    }
    const sorted = [...day.shifts].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return `${name}: working hours must not overlap`;
    }
    for (const b of day.breaks) {
      if (!day.shifts.some((s) => toMinutes(b.start) >= toMinutes(s.start) && toMinutes(b.end) <= toMinutes(s.end))) {
        return `${name}: a break must be inside the working hours`;
      }
    }
  }
  return null;
};

// how many appointment slots a day's hours give (same slot maths as the server's config/booking.js)
const countSlots = (day, duration) => {
  if (!day.working || !duration) return 0;
  const valid = (r) => r.start && r.end && toMinutes(r.end) > toMinutes(r.start);
  const breaks = day.breaks.filter(valid).map((b) => [toMinutes(b.start), toMinutes(b.end)]);
  let count = 0;
  for (const shift of day.shifts.filter(valid)) {
    for (let t = toMinutes(shift.start); t + duration <= toMinutes(shift.end); t += duration) {
      if (!breaks.some(([s, e]) => t < e && t + duration > s)) count += 1;
    }
  }
  return count;
};

export function TimeRange({ range, label, onChange, onRemove, canRemove = true }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        aria-label={`${label} start`}
        className={`${plainInput} !h-10 w-32`}
        value={range.start}
        onChange={(e) => onChange({ ...range, start: e.target.value })}
      />
      <span className="text-gray-400">to</span>
      <input
        type="time"
        aria-label={`${label} end`}
        className={`${plainInput} !h-10 w-32`}
        value={range.end}
        onChange={(e) => onChange({ ...range, end: e.target.value })}
      />
      {canRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
          <FiX />
        </button>
      )}
    </div>
  );
}

// doctor = { id, appointmentDuration, schedule }; onSaved(schedule) runs after a successful save
function WeeklySchedule({ doctor, onSaved }) {
  const [week, setWeek] = useState(() => toWeek(doctor.schedule));
  const [saving, setSaving] = useState(false);
  const [weekError, setWeekError] = useState("");
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    setWeek(toWeek(doctor.schedule));
    setWeekError("");
    setChanged(false);
  }, [doctor.id, doctor.schedule]);

  const duration = doctor.appointmentDuration;

  const updateDay = (weekday, change) => {
    setWeekError("");
    setChanged(true);
    setWeek({ ...week, [weekday]: { ...week[weekday], ...change } });
  };

  const handleToggleDay = (weekday) => {
    const day = week[weekday];
    updateDay(weekday, day.working ? { working: false } : { working: true, shifts: day.shifts.length ? day.shifts : [{ ...DEFAULT_SHIFT }] });
  };

  // copy one day's hours to every other day that is switched on
  const handleCopyDay = (weekday) => {
    const source = week[weekday];
    const next = { ...week };
    WEEK.forEach((d) => {
      if (d.weekday !== weekday && week[d.weekday].working) {
        next[d.weekday] = { working: true, shifts: source.shifts.map((s) => ({ ...s })), breaks: source.breaks.map((b) => ({ ...b })) };
      }
    });
    setWeek(next);
    setChanged(true);
    toast.info("Copied to the other working days (not saved yet)", { position: "top-center", autoClose: 1500 });
  };

  const handleSaveSchedule = async () => {
    const problem = checkWeek(week);
    if (problem) return setWeekError(problem);

    setSaving(true);
    try {
      const days = WEEK.map(({ weekday }) => ({
        weekday,
        shifts: week[weekday].working ? week[weekday].shifts : [],
        breaks: week[weekday].working ? week[weekday].breaks : [],
      }));
      const result = await axios.post(serverUrl + `/api/doctor/schedule/${doctor.id}`, { days }, { withCredentials: true });
      setWeek(toWeek(result.data.schedule));
      setChanged(false);
      showSuccess("Working hours saved");
      onSaved?.(result.data.schedule);
    } catch (error) {
      showError(error);
    }
    setSaving(false);
  };

  const weeklyTotal = WEEK.reduce((sum, { weekday }) => sum + countSlots(week[weekday], duration), 0);

  return (
    <div>
      <ul className="divide-y divide-gray-100">
        {WEEK.map(({ weekday, name }) => {
          const day = week[weekday];
          const slots = countSlots(day, duration);
          return (
            <li key={weekday} className="py-4 flex flex-col sm:flex-row gap-3 sm:gap-6">
              <label className="flex items-center gap-3 sm:w-40 shrink-0 cursor-pointer select-none">
                <input type="checkbox" checked={day.working} onChange={() => handleToggleDay(weekday)} className="w-4 h-4 accent-emerald-600" />
                <span className="min-w-0">
                  <span className={`block font-semibold ${day.working ? "text-gray-900" : "text-gray-400"}`}>{name}</span>
                  {day.working && <span className="block text-xs text-emerald-700">{slots} slots</span>}
                </span>
              </label>

              {!day.working ? (
                <span className="text-sm text-gray-400 sm:pt-0.5">Day off: no appointments</span>
              ) : (
                <div className="space-y-2 flex-1">
                  {day.shifts.map((shift, i) => (
                    <TimeRange
                      key={`s${i}`}
                      label={`${name} hours ${i + 1}`}
                      range={shift}
                      canRemove={day.shifts.length > 1}
                      onChange={(r) => updateDay(weekday, { shifts: day.shifts.map((s, j) => (j === i ? r : s)) })}
                      onRemove={() => updateDay(weekday, { shifts: day.shifts.filter((_, j) => j !== i) })}
                    />
                  ))}
                  {day.breaks.map((brk, i) => (
                    <div key={`b${i}`} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-md px-2 py-1">Break</span>
                      <TimeRange
                        label={`${name} break ${i + 1}`}
                        range={brk}
                        onChange={(r) => updateDay(weekday, { breaks: day.breaks.map((b, j) => (j === i ? r : b)) })}
                        onRemove={() => updateDay(weekday, { breaks: day.breaks.filter((_, j) => j !== i) })}
                      />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold">
                    {day.shifts.length < 4 && (
                      <button
                        type="button"
                        onClick={() => updateDay(weekday, { shifts: [...day.shifts, { start: "16:00", end: "18:00" }] })}
                        className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline"
                        title="For a doctor who comes twice a day, e.g. morning and evening OPD"
                      >
                        <FiPlus /> Add more hours
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const s = day.shifts[0];
                        const mid = s?.start && s?.end ? Math.floor((toMinutes(s.start) + toMinutes(s.end)) / 2 / 15) * 15 : 660;
                        const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                        updateDay(weekday, { breaks: [...day.breaks, { start: hhmm(mid), end: hhmm(mid + 15) }] });
                      }}
                      className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline"
                    >
                      <FiPlus /> Add break
                    </button>
                    <button type="button" onClick={() => handleCopyDay(weekday)} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-800">
                      <FiCopy /> Copy to other working days
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-500 mt-3">
        Each appointment is {duration} minutes, so e.g. {formatTime("10:00")} to {formatTime("12:00")} gives {Math.floor(120 / duration)} slots.
        This schedule gives <b>{weeklyTotal}</b> slots a week.
      </p>

      {weekError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-4">
          {weekError}
        </p>
      )}
      <div className="mt-5 flex items-center gap-3">
        <button onClick={handleSaveSchedule} disabled={saving} className={`${primaryButton} sm:min-w-44`}>
          {saving ? <ClipLoader size={18} color="white" /> : "Save working hours"}
        </button>
        {changed && <span className="text-sm text-amber-700">You have unsaved changes</span>}
      </div>
    </div>
  );
}

export default WeeklySchedule;
