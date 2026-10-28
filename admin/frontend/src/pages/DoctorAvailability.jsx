import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { toast } from "react-toastify";
import { serverUrl } from "../App";
import { primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import {
  BackLink,
  ConfirmDialog,
  LEAVE_REASONS,
  cardClass,
  formatDay,
  formatTime,
  plainInput,
  useReplaceDoctor,
} from "../components/DoctorUI";
import WeeklySchedule, { TimeRange, toMinutes } from "../components/WeeklySchedule";

const emptyLeave = { date: "", fullDay: true, startTime: "11:00", endTime: "13:00", reason: "" };

function DoctorAvailability() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const replaceDoctor = useReplaceDoctor();
  const [doctor, setDoctor] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [failed, setFailed] = useState(false);
  const [leave, setLeave] = useState(emptyLeave);
  const [editLeaveId, setEditLeaveId] = useState(null);
  const [leaveError, setLeaveError] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const loadDoctor = async () => {
      try {
        const result = await axios.get(serverUrl + `/api/doctor/getdoctor/${doctorId}`, { withCredentials: true });
        setDoctor(result.data);
        setExceptions(result.data.exceptions);
      } catch (error) {
        console.log(error);
        setFailed(true);
      }
    };
    loadDoctor();
  }, [doctorId]);

  const handleEditLeave = (e) => {
    setEditLeaveId(e.id);
    setLeave({
      date: e.date,
      fullDay: e.fullDay,
      startTime: e.startTime || "11:00",
      endTime: e.endTime || "13:00",
      reason: e.reason || "",
    });
    setLeaveError("");
    document.getElementById("leave-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const resetLeaveForm = () => {
    setLeave(emptyLeave);
    setEditLeaveId(null);
    setLeaveError("");
  };

  const handleSaveLeave = async (e) => {
    e.preventDefault();
    if (!leave.date) return setLeaveError("Choose a date");
    if (!leave.fullDay) {
      if (!leave.startTime || !leave.endTime) return setLeaveError("Enter a start and end time");
      if (toMinutes(leave.endTime) <= toMinutes(leave.startTime)) return setLeaveError("End time must be after the start time");
    }

    setLeaveSaving(true);
    try {
      const body = {
        date: leave.date,
        fullDay: leave.fullDay,
        startTime: leave.fullDay ? null : leave.startTime,
        endTime: leave.fullDay ? null : leave.endTime,
        reason: leave.reason || null,
      };
      const result = editLeaveId
        ? await axios.post(serverUrl + `/api/doctor/editexception/${doctorId}/${editLeaveId}`, body, { withCredentials: true })
        : await axios.post(serverUrl + `/api/doctor/exception/${doctorId}`, body, { withCredentials: true });
      const saved = result.data.exception;
      const next = editLeaveId ? exceptions.map((x) => (x.id === saved.id ? saved : x)) : [...exceptions, saved];
      setExceptions(next.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || "")));
      resetLeaveForm();
      showSuccess(result.data.message);
      if (result.data.affectedAppointments > 0) {
        toast.warning(`${result.data.affectedAppointments} existing appointment(s) fall in this time. Contact those patients.`, {
          position: "top-center",
          autoClose: 6000,
        });
      }
    } catch (error) {
      showError(error);
    }
    setLeaveSaving(false);
  };

  const handleDeleteLeave = async () => {
    try {
      await axios.delete(serverUrl + `/api/doctor/removeexception/${doctorId}/${deleteTarget.id}`, { withCredentials: true });
      setExceptions(exceptions.filter((x) => x.id !== deleteTarget.id));
      if (editLeaveId === deleteTarget.id) resetLeaveForm();
      showSuccess("Unavailable time removed");
      setDeleteTarget(null);
    } catch (error) {
      showError(error);
      return false;
    }
  };

  if (failed) {
    return (
      <div className="py-20 text-center">
        <p className="font-semibold text-gray-700">Doctor not found</p>
        <button onClick={() => navigate("/doctors")} className={`${secondaryButton} mx-auto mt-4`}>
          Back to doctors
        </button>
      </div>
    );
  }
  if (!doctor) {
    return (
      <div className="py-24 flex justify-center">
        <ClipLoader size={34} color="#059669" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <BackLink to={`/doctors/${doctorId}`} label="Back to doctor" />
      <h1 className="text-2xl font-extrabold text-gray-900">Availability</h1>
      <p className="text-sm text-gray-500 mb-6">
        {doctor.name} · {doctor.appointmentDuration}-minute appointments
        {!doctor.isAvailable && <span className="text-amber-600"> · Doctor is inactive, so patients cannot book yet</span>}
      </p>

      {/* weekly schedule */}
      <section className={`${cardClass} p-5 sm:p-6 mb-6`}>
        <h2 className="font-bold text-gray-900">Weekly schedule</h2>
        <p className="text-sm text-gray-500 mb-4">Pick the days this doctor works and the hours for each. Add more hours or a break if needed.</p>
        <WeeklySchedule
          doctor={doctor}
          onSaved={(schedule) => {
            replaceDoctor({ id: Number(doctorId), schedule });
            setDoctor({ ...doctor, schedule });
          }}
        />
      </section>

      {/* leave / exceptions */}
      <section className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="font-bold text-gray-900">Unavailable dates</h2>
        <p className="text-sm text-gray-500 mb-4">
          Block a whole day or part of a day. This overrides the weekly schedule for that date only.
        </p>

        <form id="leave-form" onSubmit={handleSaveLeave} noValidate className="rounded-xl bg-gray-50/70 border border-gray-100 p-4 space-y-4 mb-5">
          <p className="text-sm font-semibold text-gray-700">{editLeaveId ? "Edit unavailable time" : "Add unavailable time"}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5">Date</span>
              <input
                type="date"
                className={plainInput}
                value={leave.date}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => {
                  setLeaveError("");
                  setLeave({ ...leave, date: e.target.value });
                }}
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1.5">Reason (optional)</span>
              <select className={plainInput} value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })}>
                <option value="">No reason</option>
                {LEAVE_REASONS.map((reason) => (
                  <option key={reason}>{reason}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="leaveType" checked={leave.fullDay} onChange={() => setLeave({ ...leave, fullDay: true })} className="accent-emerald-600" />
              Whole day
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="leaveType" checked={!leave.fullDay} onChange={() => setLeave({ ...leave, fullDay: false })} className="accent-emerald-600" />
              Part of the day
            </label>
            {!leave.fullDay && (
              <TimeRange
                label="Unavailable"
                range={{ start: leave.startTime, end: leave.endTime }}
                canRemove={false}
                onChange={(r) => setLeave({ ...leave, startTime: r.start, endTime: r.end })}
              />
            )}
          </div>
          {leaveError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              {leaveError}
            </p>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={leaveSaving} className={`${primaryButton} sm:min-w-40`}>
              {leaveSaving ? <ClipLoader size={18} color="white" /> : editLeaveId ? "Update" : "Save"}
            </button>
            {editLeaveId && (
              <button type="button" onClick={resetLeaveForm} className={secondaryButton}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {exceptions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No upcoming unavailable dates.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {exceptions.map((e) => (
              <li key={e.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{formatDay(e.date)}</p>
                  <p className="text-sm text-gray-500">
                    {e.fullDay ? "Whole day" : `${formatTime(e.startTime)}–${formatTime(e.endTime)}`}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleEditLeave(e)}
                  aria-label={`Edit ${formatDay(e.date)}`}
                  className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  <FiEdit2 />
                </button>
                <button
                  onClick={() => setDeleteTarget(e)}
                  aria-label={`Remove ${formatDay(e.date)}`}
                  className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50"
                >
                  <FiTrash2 />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          title="Remove unavailable time?"
          icon={<FiTrash2 />}
          text={`${formatDay(deleteTarget.date)} will follow the normal weekly schedule again, and patients can book those slots.`}
          confirmLabel="Remove"
          onConfirm={handleDeleteLeave}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

export default DoctorAvailability;
