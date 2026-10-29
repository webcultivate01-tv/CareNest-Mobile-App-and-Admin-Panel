import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft, FiClock, FiEdit2, FiPower } from "react-icons/fi";
import { serverUrl } from "../App";
import Avatar from "../components/Avatar";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import {
  ConfirmDialog,
  DoctorStatusBadge,
  LEAVE_REASONS,
  WEEK,
  formatDay,
  formatMoney,
  formatTime,
  useReplaceDoctor,
} from "../components/DoctorUI";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN") : "-");

const statusColors = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const queueLabels = {
  booked: "Booked - has not arrived yet",
  waiting: "Checked in - waiting for the doctor",
  in_consultation: "In consultation",
  done: "Consultation finished",
};

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right break-words">{value || "-"}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

// Full page for one doctor (opened from the Doctors table): profile, current activity,
// every booking, weekly schedule and leave dates.
function DoctorDetail() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const replaceDoctor = useReplaceDoctor();
  const { appointmentData } = useSelector((state) => state.appointment);
  const [doctor, setDoctor] = useState(null);
  const [failed, setFailed] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [tab, setTab] = useState("appointments");

  useEffect(() => {
    setDoctor(null);
    const loadDoctor = async () => {
      try {
        const result = await axios.get(serverUrl + `/api/doctor/getdoctor/${doctorId}`, { withCredentials: true });
        setDoctor(result.data);
      } catch (error) {
        console.log(error);
        setFailed(true);
      }
    };
    loadDoctor();
  }, [doctorId]);

  const handleChangeStatus = async () => {
    try {
      const result = await axios.post(
        serverUrl + `/api/doctor/status/${doctorId}`,
        { isAvailable: !doctor.isAvailable },
        { withCredentials: true }
      );
      setDoctor({ ...doctor, ...result.data.doctor });
      replaceDoctor(result.data.doctor);
      showSuccess(result.data.message);
      setShowStatus(false);
    } catch (error) {
      showError(error);
      return false;
    }
  };

  const back = (
    <button
      onClick={() => navigate("/doctors")}
      className="flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-600 mb-4"
    >
      <FiArrowLeft /> Back to doctors
    </button>
  );

  if (failed) {
    return (
      <div>
        {back}
        <p className="text-red-600">Doctor not found</p>
      </div>
    );
  }
  if (!doctor) {
    return (
      <div className="flex justify-center py-20">
        <ClipLoader size={40} color="#059669" />
      </div>
    );
  }

  const hoursFor = (weekday, kind) =>
    doctor.schedule
      .filter((row) => row.weekday === weekday && row.kind === kind)
      .map((row) => `${formatTime(row.start)}–${formatTime(row.end)}`);

  const appointments = appointmentData
    .filter((a) => Number(a.doctorId) === Number(doctorId))
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  const now = Date.now();
  const isActive = (a) => a.status === "pending" || a.status === "confirmed";
  const upcomingList = appointments.filter((a) => isActive(a) && new Date(a.scheduledAt) > now);
  const nextAppointment = upcomingList[upcomingList.length - 1];
  const todayStr = new Date().toDateString();
  const todayList = appointments.filter((a) => a.status !== "cancelled" && new Date(a.scheduledAt).toDateString() === todayStr);
  const completedList = appointments.filter((a) => a.status === "completed");
  const revenue = completedList.reduce((sum, a) => sum + Number(a.fee || 0), 0);
  const patientCount = new Set(appointments.map((a) => a.patientId)).size;

  return (
    <div>
      {back}

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-center gap-4 mb-6">
        <Avatar name={doctor.name} photo={doctor.photo} className="w-16 h-16 text-xl" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{doctor.name}</h1>
            <DoctorStatusBadge active={doctor.isAvailable} />
          </div>
          <p className="text-sm text-gray-500">
            {doctor.specialty}
            {doctor.qualifications ? ` · ${doctor.qualifications}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate(`/doctors/${doctorId}/edit`)} className={secondaryButton}>
            <FiEdit2 /> Edit
          </button>
          <button onClick={() => navigate(`/doctors/${doctorId}/availability`)} className={primaryButton}>
            <FiClock /> Availability
          </button>
          <button onClick={() => setShowStatus(true)} className={secondaryButton}>
            <FiPower /> {doctor.isAvailable ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Total bookings" value={appointments.length} />
        <Stat label="Patients" value={patientCount} />
        <Stat label="Completed" value={completedList.length} />
        <Stat label="Upcoming" value={upcomingList.length} />
        <Stat label="Cancelled" value={appointments.filter((a) => a.status === "cancelled").length} />
        <Stat label="Revenue" value={formatMoney(revenue)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-2">Doctor details</h2>
          <Row label="Specialization" value={doctor.specialty} />
          <Row label="Consultation fee" value={formatMoney(doctor.fee)} />
          <Row label="Appointment duration" value={`${doctor.appointmentDuration} min`} />
          <Row label="Experience" value={doctor.experienceYears ? `${doctor.experienceYears} years` : null} />
          <Row label="Qualifications" value={doctor.qualifications} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-2">Current activity</h2>
          {todayList.length > 0 ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 mb-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-medium">Today</p>
              <p className="font-medium mt-1">
                {todayList.length} appointment{todayList.length > 1 ? "s" : ""} scheduled
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {todayList.filter((a) => a.queueState === "waiting").length} waiting ·{" "}
                {todayList.filter((a) => a.queueState === "in_consultation").length > 0
                  ? queueLabels.in_consultation
                  : "not in consultation"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">No appointments scheduled for today.</p>
          )}
          <p className="text-xs text-gray-500">Next appointment</p>
          {nextAppointment ? (
            <p className="text-sm font-medium mt-1">
              {when(nextAppointment.scheduledAt)} with {nextAppointment.patientName} ·{" "}
              <Link to={`/appointments/${nextAppointment.id}`} className="text-blue-600 hover:underline">
                {nextAppointment.code}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Nothing upcoming.</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {[
          ["appointments", `Appointments (${appointments.length})`],
          ["schedule", "Weekly schedule"],
          ["leave", `Unavailable dates (${doctor.exceptions.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-full text-sm border ${
              tab === key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-emerald-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {tab === "appointments" && (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Date &amp; time</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/appointments/${a.id}`)}
                  className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3 tabular-nums">{a.code}</td>
                  <td className="px-4 py-3">
                    {a.patientName}
                    <span className="block text-xs text-gray-500">{a.patientPhone || a.patientEmail}</span>
                  </td>
                  <td className="px-4 py-3">{when(a.scheduledAt)}</td>
                  <td className="px-4 py-3">{a.fee != null ? formatMoney(a.fee) : "-"}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={a.paymentStatus === "paid" ? "captured" : a.paymentStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs capitalize ${statusColors[a.status]}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No appointments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "schedule" && (
          <div className="p-5">
            {doctor.schedule.length === 0 && (
              <p className="text-sm text-amber-600 mb-2">No schedule yet — patients cannot book this doctor.</p>
            )}
            <ul className="divide-y divide-gray-100 text-sm">
              {WEEK.map((day) => {
                const shifts = hoursFor(day.weekday, "shift");
                const breaks = hoursFor(day.weekday, "break");
                return (
                  <li key={day.weekday} className="py-2 flex gap-3">
                    <span className="w-12 font-semibold text-gray-700">{day.short}</span>
                    {shifts.length ? (
                      <span className="text-gray-700">
                        {shifts.join(", ")}
                        {breaks.length > 0 && <span className="block text-xs text-gray-400">Break {breaks.join(", ")}</span>}
                      </span>
                    ) : (
                      <span className="text-gray-400">Unavailable</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === "leave" && (
          <div className="p-5">
            {doctor.exceptions.length === 0 ? (
              <p className="text-sm text-gray-400">No leave or closures planned.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {doctor.exceptions.map((e) => (
                  <li key={e.id} className="py-2">
                    <p className="font-semibold text-gray-800">{formatDay(e.date)}</p>
                    <p className="text-gray-500">
                      {e.fullDay ? "Whole day" : `${formatTime(e.startTime)}–${formatTime(e.endTime)}`}
                      {e.reason && LEAVE_REASONS.includes(e.reason) ? ` · ${e.reason}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {showStatus && (
        <ConfirmDialog
          title={doctor.isAvailable ? "Deactivate doctor?" : "Activate doctor?"}
          icon={<FiPower />}
          text={
            doctor.isAvailable
              ? `${doctor.name} will no longer appear for patients and cannot be booked. Existing appointments are not cancelled.`
              : `${doctor.name} will appear for patients and can be booked during the working schedule.`
          }
          confirmLabel={doctor.isAvailable ? "Deactivate" : "Activate"}
          onConfirm={handleChangeStatus}
          onClose={() => setShowStatus(false)}
        />
      )}
    </div>
  );
}

export default DoctorDetail;
