import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft } from "react-icons/fi";
import { setDoctorData } from "../redux/doctorSlice";
import { Dialog, primaryButton, secondaryButton } from "./AdminUI";

// Shared bits for the Doctor Management pages (list, form, detail, availability).

// weekday numbers match the backend: 0 = Sunday ... 6 = Saturday. Shown Monday first.
export const WEEK = [
  { weekday: 1, short: "Mon", name: "Monday" },
  { weekday: 2, short: "Tue", name: "Tuesday" },
  { weekday: 3, short: "Wed", name: "Wednesday" },
  { weekday: 4, short: "Thu", name: "Thursday" },
  { weekday: 5, short: "Fri", name: "Friday" },
  { weekday: 6, short: "Sat", name: "Saturday" },
  { weekday: 0, short: "Sun", name: "Sunday" },
];

export const LEAVE_REASONS = ["Personal Leave", "Emergency", "Clinic Closed", "Slot Blocked", "Other"];

// "13:30" -> "1:30 PM"
export const formatTime = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

// "2026-10-24" -> "Sat, Oct 24, 2026" (parsed as a plain calendar date, no timezone shift)
export const formatDay = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

// schedule rows -> [{ days: "Mon–Sat", hours: "9:00 AM–1:00 PM" }]; identical days are grouped
export const summarizeSchedule = (schedule = []) => {
  const labelFor = (weekday) =>
    schedule
      .filter((row) => row.weekday === weekday && row.kind === "shift")
      .map((row) => `${formatTime(row.start)}–${formatTime(row.end)}`)
      .join(", ");

  const groups = [];
  for (const day of WEEK) {
    const hours = labelFor(day.weekday);
    if (!hours) continue;
    const last = groups[groups.length - 1];
    if (last && last.hours === hours && last.lastIndex === WEEK.indexOf(day) - 1) {
      last.to = day.short;
      last.lastIndex += 1;
    } else {
      groups.push({ from: day.short, to: day.short, hours, lastIndex: WEEK.indexOf(day) });
    }
  }
  return groups.map((g) => ({ days: g.from === g.to ? g.from : `${g.from}–${g.to}`, hours: g.hours }));
};

export function DoctorStatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Inactive
    </span>
  );
}

export function BackLink({ to, label }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-emerald-700 mb-4"
    >
      <FiArrowLeft /> {label}
    </button>
  );
}

// replaces one doctor in the shared list so the list page stays current after edits
export const useReplaceDoctor = () => {
  const dispatch = useDispatch();
  const { doctorData } = useSelector((state) => state.doctor);
  return (updated) => dispatch(setDoctorData(doctorData.map((d) => (d.id === updated.id ? { ...d, ...updated } : d))));
};

// small yes/no question before a destructive or visible-to-patients change
export function ConfirmDialog({ title, text, confirmLabel, icon, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    const done = await onConfirm();
    if (done === false) setLoading(false);
  };
  return (
    <Dialog title={title} icon={icon} onClose={onClose}>
      <div className="px-6 pb-6">
        <p className="text-sm text-gray-600 mb-5">{text}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className={`${secondaryButton} flex-1`}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading} className={`${primaryButton} flex-1`}>
            {loading ? <ClipLoader size={18} color="white" /> : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export const cardClass = "bg-white rounded-2xl border border-gray-200/80 shadow-sm shadow-gray-900/[0.02]";
export const plainInput =
  "w-full h-11 px-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm outline-none transition focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
