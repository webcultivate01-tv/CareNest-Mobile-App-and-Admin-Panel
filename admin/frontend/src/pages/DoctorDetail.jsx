import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { FiClock, FiEdit2, FiPower } from "react-icons/fi";
import { serverUrl } from "../App";
import Avatar from "../components/Avatar";
import { primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import {
  BackLink,
  ConfirmDialog,
  DoctorStatusBadge,
  LEAVE_REASONS,
  WEEK,
  cardClass,
  formatDay,
  formatMoney,
  formatTime,
  useReplaceDoctor,
} from "../components/DoctorUI";

function DoctorDetail() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const replaceDoctor = useReplaceDoctor();
  const [doctor, setDoctor] = useState(null);
  const [failed, setFailed] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
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

  const hoursFor = (weekday, kind) =>
    doctor.schedule
      .filter((row) => row.weekday === weekday && row.kind === kind)
      .map((row) => `${formatTime(row.start)}–${formatTime(row.end)}`);

  return (
    <div className="max-w-4xl">
      <BackLink to="/doctors" label="Back to doctors" />

      <div className={`${cardClass} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5 mb-6`}>
        <Avatar name={doctor.name} photo={doctor.photo} className="w-24 h-24 text-3xl shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-gray-900">{doctor.name}</h1>
            <DoctorStatusBadge active={doctor.isAvailable} />
          </div>
          <p className="text-gray-600">{doctor.specialty}</p>
          {doctor.qualifications && <p className="text-sm text-gray-500">{doctor.qualifications}</p>}
          <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Consultation fee</dt>
              <dd className="font-bold text-gray-900">{formatMoney(doctor.fee)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Appointment duration</dt>
              <dd className="font-bold text-gray-900">{doctor.appointmentDuration} min</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Experience</dt>
              <dd className="font-bold text-gray-900">{doctor.experienceYears ? `${doctor.experienceYears} years` : "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col">
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

      <div className="grid md:grid-cols-2 gap-6">
        <div className={`${cardClass} p-5`}>
          <h2 className="font-bold text-gray-900 mb-3">Weekly schedule</h2>
          {doctor.schedule.length === 0 && (
            <p className="text-sm text-amber-600">No schedule yet — patients cannot book this doctor.</p>
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

        <div className={`${cardClass} p-5`}>
          <h2 className="font-bold text-gray-900 mb-3">Upcoming unavailable dates</h2>
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
