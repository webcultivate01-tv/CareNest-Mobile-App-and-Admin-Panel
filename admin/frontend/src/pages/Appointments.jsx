import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { serverUrl } from "../App";
import { setAppointmentData } from "../redux/appointmentSlice";
import Modal from "../components/Modal";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

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
  const navigate = useNavigate();
  const { appointmentData } = useSelector((state) => state.appointment);
  const { doctorData } = useSelector((state) => state.doctor);
  const { patientData } = useSelector((state) => state.patient);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [loading1, setLoading1] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("confirmed");
  const [slots, setSlots] = useState(null); // free slots for the chosen doctor + date (null = not loaded)
  const [closedReason, setClosedReason] = useState(""); // why the whole day is closed (cutoff, daily limit...)

  // only valid, free slots can be picked; the server checks again when saving
  useEffect(() => {
    setSlots(null);
    setClosedReason("");
    if (!form.doctorId || !form.date) return;
    let current = true;
    axios
      .get(serverUrl + `/api/doctor/slots/${form.doctorId}?date=${form.date}`, { withCredentials: true })
      .then((result) => {
        if (!current) return;
        setSlots(result.data.slots);
        setClosedReason(result.data.closed?.message || "");
      })
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
      // reload: the remaining appointments are renumbered on the server
      const refreshed = await axios.get(serverUrl + "/api/appointment/getappointments", { withCredentials: true });
      dispatch(setAppointmentData(refreshed.data));
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

  // search matches name, email, phone, ids and the date (as dd/mm/yyyy, yyyy-mm-dd or "12 Oct 2026")
  const query = search.trim().toLowerCase();
  const filteredAppointments = [...appointmentData]
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt))
    .filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (!query) return true;
    const d = new Date(a.scheduledAt);
    const haystack = [
      a.patientName,
      a.patientEmail,
      a.patientPhone,
      a.patientCode,
      a.code,
      a.doctorName,
      d.toLocaleDateString("en-GB"),
      d.toLocaleDateString("en-CA"),
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    ];
    return haystack.some((v) => String(v ?? "").toLowerCase().includes(query));
  });

  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/appointments/slots")}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm"
          >
            Slots & limits
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm"
          >
            + New Appointment
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, mobile, date..."
          className="w-full md:w-1/2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <div className="flex w-full md:w-auto items-center md:justify-end gap-2 overflow-x-auto md:flex-wrap md:overflow-visible pb-1 md:pb-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          {["all", ...statuses].map((status) => {
            const count =
              status === "all" ? appointmentData.length : appointmentData.filter((a) => a.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize border transition ${
                  statusFilter === status
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {status} ({count})
              </button>
            );
          })}
          {(search || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="text-xs text-gray-500 hover:underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Appointment ID</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAppointments.map((appointment, index) => (
              <tr key={appointment.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 tabular-nums text-gray-500">{index + 1}</td>
                <td className="px-4 py-3 tabular-nums">{appointment.code}</td>
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
                  <PaymentStatusBadge status={appointment.paymentStatus === "paid" ? "captured" : appointment.paymentStatus} />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={appointment.status}
                    onChange={(e) =>
                      e.target.value === "reschedule"
                        ? navigate(`/appointments/${appointment.id}?reschedule=1`)
                        : handleChangeStatus(appointment.id, e.target.value)
                    }
                    className={`rounded-full px-2 py-1 text-xs outline-none ${statusColors[appointment.status]}`}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                    {(appointment.status === "pending" || appointment.status === "confirmed") && (
                      <option value="reschedule">reschedule...</option>
                    )}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => navigate(`/appointments/${appointment.id}`)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleRemoveAppointment(appointment.id)}
                      disabled={loading1 === appointment.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition min-w-[60px] flex items-center justify-center disabled:opacity-60"
                    >
                      {loading1 === appointment.id ? <ClipLoader size={12} color="red" /> : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAppointments.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  {appointmentData.length === 0 ? "No appointments yet" : "No appointments match your search"}
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
                      ? closedReason || "No free slots on this date"
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
