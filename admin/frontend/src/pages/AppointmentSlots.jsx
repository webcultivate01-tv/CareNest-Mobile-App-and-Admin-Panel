import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import { FiAlertCircle, FiChevronDown, FiHelpCircle } from "react-icons/fi";
import { serverUrl } from "../App";
import { primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import { BackLink, cardClass, formatDay, formatTime, plainInput, summarizeSchedule, useReplaceDoctor } from "../components/DoctorUI";
import WeeklySchedule from "../components/WeeklySchedule";
import { hasModule } from "../modules";

// Appointments -> Slots & limits, laid out as the steps front-desk staff follow:
//   1. pick a doctor  2. their working hours  3. their daily limit  4. the slots of one day
// plus the hospital-wide OPD rules (daily limit + same-day cutoff) at the bottom.
// The server applies every rule on each booking (config/booking.js); this page only edits them.

const SLOT_STYLES = {
  free: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  booked: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  blocked: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  break: "bg-amber-50 text-amber-700 border-amber-100 cursor-default",
  past: "bg-gray-50 text-gray-400 border-gray-100 cursor-default",
};
const LEGEND = [
  { state: "free", label: "Free: patients can book (click to block)" },
  { state: "blocked", label: "Blocked: hidden from patients (click to open)" },
  { state: "booked", label: "Booked (click to view)" },
  { state: "break", label: "Break" },
  { state: "past", label: "Time has passed" },
];

const localDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

function Step({ number, title, text, children }) {
  return (
    <section className={`${cardClass} p-5 sm:p-6 mb-6`}>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-bold flex items-center justify-center shrink-0">{number}</span>
        <div>
          <h2 className="font-bold text-gray-900">{title}</h2>
          {text && <p className="text-sm text-gray-500">{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 mb-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-emerald-800"
        aria-expanded={open}
      >
        <FiHelpCircle /> How do slots work?
        <FiChevronDown className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="px-4 pb-4 pl-10 text-sm text-gray-700 space-y-1.5 list-disc">
          <li>
            <b>Working hours</b> are when a doctor sees OPD patients, e.g. Monday to Saturday, 10:00 AM to 12:00 PM.
          </li>
          <li>
            Those hours are cut into <b>slots</b> of the doctor's appointment length. 10 to 12 with 15-minute appointments = 8 slots.
          </li>
          <li>
            Patients (app) and staff (this panel) can only book a <b>free</b> slot. One slot = one patient.
          </li>
          <li>
            <b>Block</b> a single slot when the doctor can't see a patient then (meeting, surgery, late arrival). For a whole day off, use
            the doctor's Availability page.
          </li>
          <li>
            A <b>daily limit</b> stops bookings once that many appointments are made for the day, even if free slots are left.
          </li>
          <li>
            The <b>same-day cutoff</b> stops new bookings for today after a set time. Patients can still book tomorrow onward.
          </li>
          <li>Changes apply right away. Existing appointments are never cancelled by these settings.</li>
        </ul>
      )}
    </div>
  );
}

function SlotButton({ slot, busy, onClick }) {
  const clickable = slot.state === "free" || slot.state === "booked" || (slot.state === "blocked" && slot.singleSlot);
  const hint = {
    free: "Click to block this slot",
    booked: `${slot.appointmentCode} · ${slot.patientName} (click to view)`,
    blocked: slot.singleSlot
      ? "Click to open this slot for booking again"
      : `Part of unavailable time${slot.exceptionReason ? ` (${slot.exceptionReason})` : ""}. Change it on the doctor's Availability page.`,
    break: "Doctor's break",
    past: "This time has already passed",
  }[slot.state];
  return (
    <button
      type="button"
      title={hint}
      disabled={!clickable || busy}
      onClick={onClick}
      className={`h-14 rounded-xl border text-sm font-semibold flex flex-col items-center justify-center transition disabled:opacity-100 ${SLOT_STYLES[slot.state]} ${busy ? "opacity-60" : ""}`}
    >
      {busy ? <ClipLoader size={14} color="#059669" /> : formatTime(slot.time)}
      <span className="text-[10px] font-medium capitalize truncate max-w-full px-1">
        {slot.state === "booked" ? slot.patientName : slot.state}
      </span>
    </button>
  );
}

function AppointmentSlots() {
  const navigate = useNavigate();
  const replaceDoctor = useReplaceDoctor();
  const { adminData } = useSelector((state) => state.admin);
  const { doctorData } = useSelector((state) => state.doctor);

  // hospital rules
  const [rules, setRules] = useState(null);
  const [rulesForm, setRulesForm] = useState({ dailyLimit: "", cutoffTime: "" });
  const [rulesSaving, setRulesSaving] = useState(false);

  // chosen doctor (with schedule) + their day board
  const [doctorId, setDoctorId] = useState("");
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState(localDate());
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [doctorLimit, setDoctorLimit] = useState("");
  const [limitSaving, setLimitSaving] = useState(false);
  const [busySlot, setBusySlot] = useState(null);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/appointment/bookingsettings", { withCredentials: true });
        setRules(result.data);
        setRulesForm({ dailyLimit: result.data.dailyLimit ?? "", cutoffTime: result.data.cutoffTime || "" });
      } catch (error) {
        showError(error);
      }
    };
    loadRules();
  }, []);

  // first doctor by default once the list is in
  useEffect(() => {
    if (!doctorId && doctorData.length) setDoctorId(String(doctorData[0].id));
  }, [doctorData, doctorId]);

  useEffect(() => {
    if (!doctorId) return;
    let current = true;
    setDoctor(null);
    axios
      .get(serverUrl + `/api/doctor/getdoctor/${doctorId}`, { withCredentials: true })
      .then((result) => {
        if (!current) return;
        setDoctor(result.data);
        setDoctorLimit(result.data.dailyLimit ?? "");
      })
      .catch((error) => current && showError(error));
    return () => {
      current = false;
    };
  }, [doctorId]);

  const loadBoard = async () => {
    if (!doctorId || !date) return;
    setBoardLoading(true);
    try {
      const result = await axios.get(serverUrl + `/api/appointment/slotboard/${doctorId}?date=${date}`, { withCredentials: true });
      setBoard(result.data);
    } catch (error) {
      setBoard(null);
      showError(error);
    }
    setBoardLoading(false);
  };

  useEffect(() => {
    loadBoard();
  }, [doctorId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveRules = async (e) => {
    e.preventDefault();
    setRulesSaving(true);
    try {
      const result = await axios.post(
        serverUrl + "/api/appointment/bookingsettings",
        { dailyLimit: rulesForm.dailyLimit === "" ? null : Number(rulesForm.dailyLimit), cutoffTime: rulesForm.cutoffTime || null },
        { withCredentials: true }
      );
      setRules(result.data.settings);
      showSuccess(result.data.message);
      loadBoard(); // the rules can open or close the day being shown
    } catch (error) {
      showError(error);
    }
    setRulesSaving(false);
  };

  const handleSaveDoctorLimit = async () => {
    setLimitSaving(true);
    try {
      const result = await axios.post(
        serverUrl + `/api/appointment/doctorlimit/${doctorId}`,
        { dailyLimit: doctorLimit === "" ? null : Number(doctorLimit) },
        { withCredentials: true }
      );
      setDoctor({ ...doctor, dailyLimit: result.data.dailyLimit });
      showSuccess(result.data.message);
      loadBoard();
    } catch (error) {
      showError(error);
    }
    setLimitSaving(false);
  };

  const handleSlotClick = async (slot) => {
    if (slot.state === "booked") return navigate(`/appointments/${slot.appointmentId}`);
    setBusySlot(slot.startsAt);
    try {
      if (slot.state === "free") {
        await axios.post(serverUrl + `/api/appointment/blockslot/${doctorId}`, { date, time: slot.time }, { withCredentials: true });
        showSuccess(`${formatTime(slot.time)} blocked: patients can't book it`);
      } else {
        await axios.delete(serverUrl + `/api/appointment/unblockslot/${doctorId}/${slot.exceptionId}`, { withCredentials: true });
        showSuccess(`${formatTime(slot.time)} is open for booking again`);
      }
      await loadBoard();
    } catch (error) {
      showError(error);
    }
    setBusySlot(null);
  };

  const counts = (board?.slots || []).reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] || 0) + 1 }), {});
  const hours = doctor ? summarizeSchedule(doctor.schedule) : [];
  const limitUnchanged = String(doctorLimit) === String(doctor?.dailyLimit ?? "");

  return (
    <div className="max-w-5xl">
      <BackLink to="/appointments" label="Back to appointments" />
      <h1 className="text-2xl font-extrabold text-gray-900">Slots & limits</h1>
      <p className="text-sm text-gray-500 mb-4">
        Set when each doctor sees OPD patients, how many appointments they take, and open or close single slots.
      </p>

      <HowItWorks />

      {/* 1. doctor */}
      <Step number={1} title="Choose a doctor">
        <select className={`${plainInput} sm:max-w-md`} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctorData.length === 0 && <option value="">No doctors yet</option>}
          {doctorData.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} - {d.specialty}
              {d.isAvailable ? "" : " (inactive)"}
            </option>
          ))}
        </select>
        {doctor && (
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p>
              <b>{doctor.appointmentDuration}-minute</b> appointments
              {hasModule(adminData, "doctors") && (
                <>
                  {" "}
                  (<Link to={`/doctors/${doctor.id}/edit`} className="text-emerald-700 hover:underline">change</Link>)
                </>
              )}
              {" · "}
              {hours.length === 0 ? (
                <span className="text-amber-700">No working hours yet. Set them in step 2 so patients can book.</span>
              ) : (
                <>Sees patients {hours.map((h) => `${h.days} ${h.hours}`).join(", ")}</>
              )}
            </p>
            {!doctor.isAvailable && (
              <p className="text-amber-700">This doctor is inactive, so nobody can book them until they are made active on the Doctors page.</p>
            )}
          </div>
        )}
      </Step>

      {/* 2. working hours */}
      <Step
        number={2}
        title="Working hours (OPD timing)"
        text="Tick the days the doctor comes and enter their hours, e.g. 10:00 AM to 12:00 PM. Slots are made from these hours automatically."
      >
        {!doctor ? (
          <div className="py-6 flex justify-center">
            <ClipLoader size={26} color="#059669" />
          </div>
        ) : (
          <WeeklySchedule
            doctor={doctor}
            onSaved={(schedule) => {
              setDoctor({ ...doctor, schedule });
              replaceDoctor({ id: doctor.id, schedule });
              loadBoard();
            }}
          />
        )}
      </Step>

      {/* 3. doctor limit */}
      <Step
        number={3}
        title="Daily limit for this doctor"
        text="Optional. The most patients this doctor sees in one day. When reached, their remaining slots for that day close."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="1"
            max="1000"
            placeholder="No limit"
            className={`${plainInput} !w-40`}
            value={doctorLimit}
            disabled={!doctor}
            onChange={(e) => setDoctorLimit(e.target.value)}
          />
          <span className="text-sm text-gray-500">patients per day</span>
          <button
            type="button"
            onClick={handleSaveDoctorLimit}
            disabled={!doctor || limitSaving || limitUnchanged}
            className={`${secondaryButton} disabled:opacity-50`}
          >
            {limitSaving ? <ClipLoader size={16} color="#059669" /> : "Save limit"}
          </button>
          {doctorLimit !== "" && (
            <button type="button" onClick={() => setDoctorLimit("")} className="text-sm text-gray-500 hover:underline">
              Remove limit
            </button>
          )}
        </div>
      </Step>

      {/* 4. day board */}
      <Step number={4} title="Slots on a day" text="See every slot for one day. Block a slot to stop patients booking it, or open it again.">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
            const d = localDate(offset);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  date === d ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : formatDay(d).split(",")[0] + " " + Number(d.slice(8))}
              </button>
            );
          })}
          <input type="date" aria-label="Other date" className={`${plainInput} !h-9 !w-44`} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {boardLoading && !board ? (
          <div className="py-10 flex justify-center">
            <ClipLoader size={28} color="#059669" />
          </div>
        ) : !board ? (
          <p className="text-sm text-gray-400 text-center py-8">Choose a doctor to see their slots.</p>
        ) : (
          <div className={boardLoading ? "opacity-60 transition-opacity" : ""}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-600 mb-3">
              <span className="font-semibold text-gray-900">{formatDay(board.date)}</span>
              <span>
                {board.doctorBooked} booked{board.doctor.dailyLimit ? ` of ${board.doctor.dailyLimit} (doctor's limit)` : ""}
              </span>
              <span>{counts.free || 0} free</span>
              {counts.blocked > 0 && <span>{counts.blocked} blocked</span>}
              {board.hospitalBooked !== null && (
                <span>
                  Whole hospital: {board.hospitalBooked} of {board.settings.dailyLimit}
                </span>
              )}
            </div>

            {board.closed && (
              <p role="status" className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <span>
                  <b>Patients can't book this day:</b> {board.closed.message.replace(/ Please choose another day\.$/, "")}
                  {["leave", "dayOff"].includes(board.closed.code) && hasModule(adminData, "doctors") && (
                    <>
                      {" "}
                      <Link to={`/doctors/${board.doctor.id}/availability`} className="font-semibold underline">
                        Edit leave
                      </Link>
                    </>
                  )}
                </span>
              </p>
            )}

            {board.slots.length > 0 && (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                  {board.slots.map((slot) => (
                    <SlotButton key={slot.startsAt} slot={slot} busy={busySlot === slot.startsAt} onClick={() => handleSlotClick(slot)} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-xs text-gray-500">
                  {LEGEND.map((item) => (
                    <span key={item.state} className="inline-flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded border ${SLOT_STYLES[item.state]}`} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </>
            )}
            {board.slots.length === 0 && !board.closed && (
              <p className="text-sm text-gray-400 text-center py-8">No slots on this day.</p>
            )}
          </div>
        )}
      </Step>

      {/* hospital rules */}
      <section className={`${cardClass} p-5 sm:p-6 border-emerald-200`}>
        <h2 className="font-bold text-gray-900">Rules for the whole hospital</h2>
        <p className="text-sm text-gray-500 mb-4">These apply to every doctor, for bookings from the patient app and from this panel.</p>

        {!rules ? (
          <div className="py-6 flex justify-center">
            <ClipLoader size={26} color="#059669" />
          </div>
        ) : (
          <form onSubmit={handleSaveRules} noValidate className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1.5">Total OPD appointments per day (all doctors)</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  placeholder="No limit"
                  className={plainInput}
                  value={rulesForm.dailyLimit}
                  onChange={(e) => setRulesForm({ ...rulesForm, dailyLimit: e.target.value })}
                />
                <span className="block text-xs text-gray-500 mt-1.5">
                  Today: <b>{rules.todayBooked}</b> booked{rules.dailyLimit ? ` of ${rules.dailyLimit}` : ""}. Leave empty for no limit.
                </span>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1.5">Stop taking today's appointments after</span>
                <div className="flex gap-2">
                  <input
                    type="time"
                    className={plainInput}
                    value={rulesForm.cutoffTime}
                    onChange={(e) => setRulesForm({ ...rulesForm, cutoffTime: e.target.value })}
                  />
                  {rulesForm.cutoffTime && (
                    <button type="button" onClick={() => setRulesForm({ ...rulesForm, cutoffTime: "" })} className={secondaryButton}>
                      Clear
                    </button>
                  )}
                </div>
                <span className="block text-xs text-gray-500 mt-1.5">
                  {rulesForm.cutoffTime
                    ? `After ${formatTime(rulesForm.cutoffTime)}, nobody can book for the same day. Tomorrow onward stays open.`
                    : "No cutoff: today's free slots can be booked until they start."}
                </span>
              </label>
            </div>
            <button type="submit" disabled={rulesSaving} className={`${primaryButton} sm:min-w-44`}>
              {rulesSaving ? <ClipLoader size={18} color="white" /> : "Save hospital rules"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default AppointmentSlots;
