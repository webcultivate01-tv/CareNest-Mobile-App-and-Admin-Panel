import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
const formatSlot = (hhmm) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? "AM" : "PM"}`;
};
const formatMoney = (value) => (value == null ? "-" : `₹${Number(value).toLocaleString("en-IN")}`);
const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500";
const toastOpts = { position: "top-center", autoClose: 2000 };

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-gray-900 break-words">{children}</div>
    </div>
  );
}

function AppointmentDetail() {
  const { appointmentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { appointmentData } = useSelector((state) => state.appointment);
  const appointment = appointmentData.find((a) => String(a.id) === appointmentId);

  const [showReschedule, setShowReschedule] = useState(searchParams.get("reschedule") === "1");
  const [rForm, setRForm] = useState({ date: "", scheduledAt: "", reason: "" });
  const [rSlots, setRSlots] = useState(null);
  const [rLoading, setRLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doctorId = appointment?.doctorId;
  useEffect(() => {
    setRSlots(null);
    if (!showReschedule || !doctorId || !rForm.date) return;
    let current = true;
    axios
      .get(serverUrl + `/api/doctor/slots/${doctorId}?date=${rForm.date}`, { withCredentials: true })
      .then((result) => current && setRSlots(result.data.slots))
      .catch(() => current && setRSlots([]));
    return () => {
      current = false;
    };
  }, [showReschedule, doctorId, rForm.date]);

  const replaceAppointment = (updated) =>
    dispatch(setAppointmentData(appointmentData.map((a) => (a.id === updated.id ? updated : a))));

  const closeReschedule = () => {
    setShowReschedule(false);
    if (searchParams.has("reschedule")) setSearchParams({}, { replace: true });
  };

  const handleChangeStatus = async (status) => {
    try {
      const result = await axios.post(
        serverUrl + `/api/appointment/editappointment/${appointment.id}`,
        { status },
        { withCredentials: true }
      );
      replaceAppointment(result.data.appointment);
      toast.success("Status Updated Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong", toastOpts);
    }
  };

  const handleReschedule = async (e) => {
    e.preventDefault();
    if (!rForm.scheduledAt) return toast.error("Choose a new date and time slot", toastOpts);
    if (!rForm.reason.trim()) return toast.error("Enter the reason for rescheduling", toastOpts);
    setRLoading(true);
    try {
      const result = await axios.post(
        serverUrl + `/api/appointment/reschedule/${appointment.id}`,
        { scheduledAt: rForm.scheduledAt, reason: rForm.reason },
        { withCredentials: true }
      );
      replaceAppointment(result.data.appointment);
      setRForm({ date: "", scheduledAt: "", reason: "" });
      closeReschedule();
      toast.success("Appointment Rescheduled Successfully", { position: "top-center", autoClose: 1000 });
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong", toastOpts);
    }
    setRLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove this appointment?")) return;
    setDeleting(true);
    try {
      await axios.delete(serverUrl + `/api/appointment/remove/${appointment.id}`, { withCredentials: true });
      // the remaining appointments are renumbered on the server
      const refreshed = await axios.get(serverUrl + "/api/appointment/getappointments", { withCredentials: true });
      dispatch(setAppointmentData(refreshed.data));
      toast.success("Appointment Removed Successfully", { position: "top-center", autoClose: 1000 });
      navigate("/appointments");
    } catch (error) {
      setDeleting(false);
      toast.error(error.response?.data?.message || "Something went wrong", toastOpts);
    }
  };

  if (!appointment) {
    return (
      <div>
        <button onClick={() => navigate("/appointments")} className="text-sm text-emerald-600 hover:underline">
          ← Back to appointments
        </button>
        <p className="mt-6 text-gray-400">Appointment not found</p>
      </div>
    );
  }

  const canReschedule = appointment.status === "pending" || appointment.status === "confirmed";

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate("/appointments")} className="text-sm text-emerald-600 hover:underline">
        ← Back to appointments
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{appointment.code}</h1>
          <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusColors[appointment.status]}`}>
            {appointment.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canReschedule && (
            <button
              onClick={() => setShowReschedule(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Reschedule
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm bg-red-50 text-red-600 hover:bg-red-100 min-w-[80px] flex items-center justify-center disabled:opacity-60"
          >
            {deleting ? <ClipLoader size={14} color="red" /> : "Delete"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-4">Appointment</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Appointment ID">{appointment.code}</Field>
            <Field label="Date & Time">{formatDateTime(appointment.scheduledAt)}</Field>
            <Field label="Duration">{appointment.durationMinutes} min</Field>
            <Field label="Status">
              <select
                value={appointment.status}
                onChange={(e) => handleChangeStatus(e.target.value)}
                className={`rounded-full px-2 py-1 text-xs outline-none ${statusColors[appointment.status]}`}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Notes">{appointment.notes || "-"}</Field>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-4">Patient</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Patient ID">{appointment.patientCode}</Field>
            <Field label="Name">{appointment.patientName}</Field>
            <Field label="Email">{appointment.patientEmail || "-"}</Field>
            <Field label="Mobile">{appointment.patientPhone || "-"}</Field>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-4">Doctor</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">{appointment.doctorName}</Field>
            <Field label="Specialty">{appointment.doctorSpecialty}</Field>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-4">Payment</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fee">{formatMoney(appointment.fee)}</Field>
            <Field label="Status">
              <PaymentStatusBadge
                status={appointment.paymentStatus === "paid" ? "captured" : appointment.paymentStatus}
              />
            </Field>
          </div>
        </section>

        {appointment.rescheduleCount > 0 && (
          <section className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-semibold text-amber-900 mb-4">
              Rescheduled {appointment.rescheduleCount} {appointment.rescheduleCount === 1 ? "time" : "times"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Previous time">{formatDateTime(appointment.previousScheduledAt)}</Field>
              <Field label="Rescheduled on">{formatDateTime(appointment.rescheduledAt)}</Field>
              <Field label="Reason">{appointment.rescheduleReason}</Field>
            </div>
          </section>
        )}
      </div>

      {showReschedule && (
        <Modal title="Reschedule Appointment" onClose={closeReschedule}>
          <form onSubmit={handleReschedule} className="space-y-3">
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
              {appointment.doctorName} · currently {formatDateTime(appointment.scheduledAt)}
            </p>
            <input
              type="date"
              className={inputClass}
              min={new Date().toLocaleDateString("en-CA")}
              value={rForm.date}
              onChange={(e) => setRForm({ ...rForm, date: e.target.value, scheduledAt: "" })}
            />
            <select
              className={inputClass}
              value={rForm.scheduledAt}
              disabled={!rSlots || rSlots.length === 0}
              onChange={(e) => setRForm({ ...rForm, scheduledAt: e.target.value })}
            >
              <option value="">
                {!rForm.date
                  ? "Select new date first"
                  : rSlots === null
                    ? "Loading slots..."
                    : rSlots.length === 0
                      ? "No free slots on this date"
                      : "Select new time slot"}
              </option>
              {(rSlots || []).map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {formatSlot(slot.time)}
                </option>
              ))}
            </select>
            <textarea
              className={inputClass}
              placeholder="Reason for rescheduling"
              rows={3}
              value={rForm.reason}
              onChange={(e) => setRForm({ ...rForm, reason: e.target.value })}
            />
            <button
              type="submit"
              disabled={rLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-10 flex items-center justify-center"
            >
              {rLoading ? <ClipLoader size={22} color="white" /> : "Reschedule"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AppointmentDetail;
