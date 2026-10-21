import { useEffect, useState } from "react";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setAppointmentData } from "../redux/appointmentSlice";
import Modal from "../components/Modal";

const statuses = ["pending", "confirmed", "completed", "cancelled"];
const statusColors = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};
const emptyForm = { patientId: "", doctorId: "", date: "", scheduledAt: "", notes: "" };
const formatSlot = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? "AM" : "PM"}`;
};

function Appointments() {
  const dispatch = useDispatch();
  const { appointmentData } = useSelector((state) => state.appointment);
  const { doctorData } = useSelector((state) => state.doctor);
  const { patientData } = useSelector((state) => state.patient);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(null);
  const [slots, setSlots] = useState(null); // free slots for the chosen doctor + date (null = not loaded)

  // only valid, free slots can be picked; the server checks again when saving
  useEffect(() => {
    setSlots(null);
    if (!form.doctorId || !form.date) return;
    let current = true;
    axios
      .get(serverUrl + `/api/doctor/slots/${form.doctorId}?date=${form.date}`, { withCredentials: true })
      .then((result) => current && setSlots(result.data.slots))
      .catch(() => current && setSlots([]));
    return () => {
      current = false;
    };
  }, [form.doctorId, form.date]);

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post(
        serverUrl + "/api/appointment/create",
        { patientId: form.patientId, doctorId: form.doctorId, scheduledAt: form.scheduledAt, notes: form.notes },
        { withCredentials: true }
      );
      dispatch(setAppointmentData([result.data.appointment, ...appointmentData]));
      setShowModal(false);
      setForm(emptyForm);
      setLoading(false);
      toast.success("Appointment Created Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading(false);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleChangeStatus = async (appointmentId, status) => {
    try {
      const result = await axios.post(
        serverUrl + `/api/appointment/editappointment/${appointmentId}`,
        { status },
        { withCredentials: true }
      );
      dispatch(
        setAppointmentData(
          appointmentData.map((a) => (a.id === appointmentId ? result.data.appointment : a))
        )
      );
      toast.success("Status Updated Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const handleRemoveAppointment = async (appointmentId) => {
    if (!window.confirm("Remove this appointment?")) return;
    setLoading1(appointmentId);
    try {
      await axios.delete(serverUrl + `/api/appointment/remove/${appointmentId}`, {
        withCredentials: true,
      });
      dispatch(setAppointmentData(appointmentData.filter((a) => a.id !== appointmentId)));
      setLoading1(null);
      toast.success("Appointment Removed Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      console.log(error);
      setLoading1(null);
      toast.error(error.response?.data?.message || "Something went wrong", {
        position: "top-center",
        autoClose: 2000,
      });
    }
  };

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + New Appointment
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">Appointment ID</th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {appointmentData.map((appointment) => (
              <tr key={appointment.id} className="border-t border-gray-100">
                <td className="px-4 py-3 tabular-nums">{appointment.code}</td>
                <td className="px-4 py-3 tabular-nums">{appointment.patientCode}</td>
                <td className="px-4 py-3 font-medium">{appointment.patientName}</td>
                <td className="px-4 py-3">
                  {appointment.doctorName}
                  <br />
                  <span className="text-gray-400">{appointment.doctorSpecialty}</span>
                </td>
                <td className="px-4 py-3">{new Date(appointment.scheduledAt).toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums">
                  {appointment.fee == null ? "-" : `₹${Number(appointment.fee).toLocaleString("en-IN")}`}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={appointment.status}
                    onChange={(e) => handleChangeStatus(appointment.id, e.target.value)}
                    className={`rounded-full px-2 py-1 text-xs outline-none ${statusColors[appointment.status]}`}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-gray-500">{appointment.notes || "-"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemoveAppointment(appointment.id)}
                    disabled={loading1 === appointment.id}
                    className="text-red-600 hover:underline"
                  >
                    {loading1 === appointment.id ? <ClipLoader size={14} color="red" /> : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {appointmentData.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  No appointments yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="New Appointment" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreateAppointment} className="space-y-3">
            <select
              className={inputClass}
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
            >
              <option value="">Select patient</option>
              {patientData.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={form.doctorId}
              onChange={(e) => setForm({ ...form, doctorId: e.target.value, scheduledAt: "" })}
            >
              <option value="">Select doctor</option>
              {doctorData
                .filter((doctor) => doctor.isAvailable)
                .map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name} - {doctor.specialty} (₹{Number(doctor.fee)})
                </option>
              ))}
            </select>
            <input
              type="date"
              className={inputClass}
              min={new Date().toLocaleDateString("en-CA")}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value, scheduledAt: "" })}
            />
            <select
              className={inputClass}
              value={form.scheduledAt}
              disabled={!slots || slots.length === 0}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            >
              <option value="">
                {!form.doctorId || !form.date
                  ? "Select doctor and date first"
                  : slots === null
                    ? "Loading slots..."
                    : slots.length === 0
                      ? "No free slots on this date"
                      : "Select time slot"}
              </option>
              {(slots || []).map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {formatSlot(slot.time)}
                </option>
              ))}
            </select>
            <textarea
              className={inputClass}
              placeholder="Notes (optional)"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-10 flex items-center justify-center"
            >
              {loading ? <ClipLoader size={22} color="white" /> : "Create"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Appointments;
