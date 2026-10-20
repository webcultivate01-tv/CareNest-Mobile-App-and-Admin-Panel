import { useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import { FiClock, FiEdit2, FiEye, FiPlus, FiPower, FiSearch, FiUserPlus } from "react-icons/fi";
import { serverUrl } from "../App";
import Avatar from "../components/Avatar";
import { IconAction, primaryButton, secondaryButton, showError, showSuccess } from "../components/AdminUI";
import {
  ConfirmDialog,
  DoctorStatusBadge,
  cardClass,
  formatMoney,
  summarizeSchedule,
  useReplaceDoctor,
} from "../components/DoctorUI";
import { fetchDoctors } from "../CustomHooks/getDoctors";

function Doctors() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const replaceDoctor = useReplaceDoctor();
  const { doctorData, doctorStatus } = useSelector((state) => state.doctor);
  const [search, setSearch] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return doctorData;
    return doctorData.filter((d) => d.name.toLowerCase().includes(text) || d.specialty.toLowerCase().includes(text));
  }, [doctorData, search]);

  const handleChangeStatus = async () => {
    const doctor = statusTarget;
    try {
      const result = await axios.post(
        serverUrl + `/api/doctor/status/${doctor.id}`,
        { isAvailable: !doctor.isAvailable },
        { withCredentials: true }
      );
      replaceDoctor(result.data.doctor);
      showSuccess(result.data.message);
      setStatusTarget(null);
    } catch (error) {
      showError(error);
      return false;
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Doctor Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Profiles, fees and availability for booking.</p>
        </div>
        <button onClick={() => navigate("/doctors/new")} className={`${primaryButton} shrink-0 self-start`}>
          <FiPlus className="text-base" /> Add Doctor
        </button>
      </div>

      <div className={cardClass}>
        <div className="p-4 sm:p-5 border-b border-gray-100">
          <div className="relative sm:w-80">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or specialization"
              aria-label="Search doctors"
              className="w-full h-10 pl-10 pr-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        </div>

        {doctorStatus === "loading" && (
          <div className="py-20 flex justify-center">
            <ClipLoader size={34} color="#059669" />
          </div>
        )}

        {doctorStatus === "error" && (
          <div className="py-16 text-center px-4">
            <p className="font-semibold text-gray-700">Could not load doctors</p>
            <p className="text-sm text-gray-400 mb-4">Check your connection and try again.</p>
            <button onClick={() => fetchDoctors(dispatch)} className={`${secondaryButton} mx-auto`}>
              Try again
            </button>
          </div>
        )}

        {doctorStatus === "ready" && doctorData.length === 0 && (
          <div className="py-16 text-center px-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl mb-3">
              <FiUserPlus />
            </div>
            <p className="font-semibold text-gray-700">No doctors yet</p>
            <p className="text-sm text-gray-400 mb-4">Add your first doctor to start accepting appointments.</p>
            <button onClick={() => navigate("/doctors/new")} className={`${primaryButton} mx-auto`}>
              <FiPlus /> Add Doctor
            </button>
          </div>
        )}

        {doctorStatus === "ready" && doctorData.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="pl-5 pr-3 py-3 font-semibold">Doctor</th>
                  <th className="hidden md:table-cell px-3 py-3 font-semibold">Specialization</th>
                  <th className="hidden sm:table-cell px-3 py-3 font-semibold">Fee</th>
                  <th className="hidden lg:table-cell px-3 py-3 font-semibold">Working schedule</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="pl-3 pr-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doctor) => {
                  const schedule = summarizeSchedule(doctor.schedule);
                  return (
                    <tr key={doctor.id} className="border-t border-gray-100 hover:bg-gray-50/70">
                      <td className="pl-5 pr-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={doctor.name} photo={doctor.photo} />
                          <div className="min-w-0">
                            <button
                              onClick={() => navigate(`/doctors/${doctor.id}`)}
                              className="font-semibold text-gray-900 hover:text-emerald-700 text-left"
                            >
                              {doctor.name}
                            </button>
                            {/* narrow screens hide the columns, so the key details stay under the name */}
                            <p className="md:hidden text-[13px] text-gray-500">{doctor.specialty}</p>
                            <p className="sm:hidden text-[13px] text-gray-500">{formatMoney(doctor.fee)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 text-gray-700">{doctor.specialty}</td>
                      <td className="hidden sm:table-cell px-3 py-3 text-gray-700 whitespace-nowrap tabular-nums">
                        {formatMoney(doctor.fee)}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 text-gray-600">
                        {schedule.length === 0 ? (
                          <span className="text-amber-600 text-[13px]">Not set — cannot be booked</span>
                        ) : (
                          schedule.map((s) => (
                            <p key={s.days} className="text-[13px]">
                              <span className="font-semibold text-gray-800">{s.days}</span> {s.hours}
                            </p>
                          ))
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <DoctorStatusBadge active={doctor.isAvailable} />
                      </td>
                      <td className="pl-3 pr-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconAction label="View" onClick={() => navigate(`/doctors/${doctor.id}`)}>
                            <FiEye />
                          </IconAction>
                          <IconAction label="Edit" onClick={() => navigate(`/doctors/${doctor.id}/edit`)}>
                            <FiEdit2 />
                          </IconAction>
                          <IconAction label="Manage availability" onClick={() => navigate(`/doctors/${doctor.id}/availability`)}>
                            <FiClock />
                          </IconAction>
                          <IconAction
                            label={doctor.isAvailable ? "Deactivate" : "Activate"}
                            onClick={() => setStatusTarget(doctor)}
                          >
                            <FiPower />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <p className="font-semibold text-gray-700">No matching doctors</p>
                      <p className="text-sm text-gray-400">Try a different name or specialization.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statusTarget && (
        <ConfirmDialog
          title={statusTarget.isAvailable ? "Deactivate doctor?" : "Activate doctor?"}
          icon={<FiPower />}
          text={
            statusTarget.isAvailable
              ? `${statusTarget.name} will no longer appear for patients and cannot be booked. Existing appointments are not cancelled.`
              : `${statusTarget.name} will appear for patients and can be booked during the working schedule.`
          }
          confirmLabel={statusTarget.isAvailable ? "Deactivate" : "Activate"}
          onConfirm={handleChangeStatus}
          onClose={() => setStatusTarget(null)}
        />
      )}
    </div>
  );
}

export default Doctors;
