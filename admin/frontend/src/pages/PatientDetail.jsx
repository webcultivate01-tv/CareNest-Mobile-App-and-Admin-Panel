import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft } from "react-icons/fi";
import { serverUrl } from "../App";
import Avatar from "../components/Avatar";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  in_consultation: "In consultation with the doctor",
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

// Full page for one patient (opened from the Patients table): details, what they are doing now,
// every booking and every payment.
function PatientDetail() {
  const navigate = useNavigate();
  const { patientId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("appointments");

  useEffect(() => {
    setData(null);
    axios
      .get(serverUrl + `/api/patient/profile/${patientId}`, { withCredentials: true })
      .then((result) => {
        setData(result.data);
        setError("");
      })
      .catch((e) => setError(e.response?.data?.message || "Something went wrong"));
  }, [patientId]);

  const back = (
    <button
      onClick={() => navigate("/patients")}
      className="flex items-center gap-2 text-sm text-gray-600 hover:text-emerald-600 mb-4"
    >
      <FiArrowLeft /> Back to patients
    </button>
  );

  if (error) {
    return (
      <div>
        {back}
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <ClipLoader size={40} color="#059669" />
      </div>
    );
  }

  const { patient, stats, current, appointments, payments } = data;
  const { todayVisit, nextAppointment } = current;

  return (
    <div>
      {back}

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-center gap-4 mb-6">
        <Avatar name={patient.name} photo={patient.photo} className="w-16 h-16 text-xl" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{patient.name}</h1>
          <p className="text-sm text-gray-500">
            {patient.code} · Joined {new Date(patient.createdAt).toLocaleDateString("en-IN")}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            patient.marketingConsent ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {patient.marketingConsent ? "Agreed to offers & updates" : "No marketing consent"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Total bookings" value={stats.totalBookings} />
        <Stat label="Completed" value={stats.completed} />
        <Stat label="Upcoming" value={stats.upcoming} />
        <Stat label="Cancelled" value={stats.cancelled} />
        <Stat label="Total paid" value={money(stats.totalPaid)} />
        <Stat label="Refunded" value={money(stats.totalRefunded)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-2">Personal details</h2>
          <Row label="Mobile number" value={patient.phone} />
          <Row label="Email" value={patient.email} />
          <Row label="Date of birth" value={patient.dob} />
          <Row label="Address" value={patient.address} />
          <Row label="Last visit" value={stats.lastVisit ? when(stats.lastVisit) : null} />
          {patient.marketingConsent && <Row label="Consent given via" value={patient.marketingConsentSource} />}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-2">Current activity</h2>
          {todayVisit ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 mb-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700 font-medium">Today</p>
              <p className="font-medium mt-1">{queueLabels[todayVisit.queueState]}</p>
              <p className="text-sm text-gray-600 mt-1">
                {todayVisit.doctorName} ({todayVisit.doctorSpecialty}) · {when(todayVisit.scheduledAt)}
              </p>
              <Link to={`/appointments/${todayVisit.id}`} className="text-sm text-blue-600 hover:underline">
                {todayVisit.code}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-3">No visit scheduled for today.</p>
          )}
          <p className="text-xs text-gray-500">Next appointment</p>
          {nextAppointment ? (
            <p className="text-sm font-medium mt-1">
              {when(nextAppointment.scheduledAt)} with {nextAppointment.doctorName} ·{" "}
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
          ["payments", `Payments (${payments.length})`],
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
        {tab === "appointments" ? (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3">Doctor</th>
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
                    {a.doctorName}
                    <span className="block text-xs text-gray-500">{a.doctorSpecialty}</span>
                  </td>
                  <td className="px-4 py-3">{when(a.scheduledAt)}</td>
                  <td className="px-4 py-3">{a.fee != null ? money(a.fee) : "-"}</td>
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
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Appointment</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Refunded</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/payments/${p.id}`)}
                  className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-3">{when(p.capturedAt || p.createdAt)}</td>
                  <td className="px-4 py-3 tabular-nums">{p.appointmentCode}</td>
                  <td className="px-4 py-3">{p.doctorName}</td>
                  <td className="px-4 py-3">{money(p.amount)}</td>
                  <td className="px-4 py-3 capitalize">{p.method || "-"}</td>
                  <td className="px-4 py-3">{Number(p.refundedAmount) > 0 ? money(p.refundedAmount) : "-"}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={p.status} />
                    {p.failureReason && <span className="block text-xs text-red-600 mt-1">{p.failureReason}</span>}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No payments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default PatientDetail;
