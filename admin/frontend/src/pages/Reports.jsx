import { useState } from "react";
import { useSelector } from "react-redux";

const statuses = ["pending", "confirmed", "completed", "cancelled"];
const statusBarColors = {
  pending: "bg-amber-400",
  confirmed: "bg-blue-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-400",
};
const ranges = [
  { value: "all", label: "All time" },
  { value: "30", label: "Last 30 days" },
  { value: "7", label: "Last 7 days" },
];

function Reports() {
  const { doctorData } = useSelector((state) => state.doctor);
  const { patientData } = useSelector((state) => state.patient);
  const { appointmentData } = useSelector((state) => state.appointment);
  const [range, setRange] = useState("all");

  const fromDate = range === "all" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
  const appointments = fromDate
    ? appointmentData.filter((a) => new Date(a.scheduledAt) >= fromDate)
    : appointmentData;

  const feeByDoctor = Object.fromEntries(doctorData.map((d) => [d.id, Number(d.fee) || 0]));
  const completed = appointments.filter((a) => a.status === "completed");
  const revenue = completed.reduce((sum, a) => sum + (feeByDoctor[a.doctorId] || 0), 0);
  const completionRate = appointments.length ? Math.round((completed.length / appointments.length) * 100) : 0;

  const statusCounts = statuses.map((status) => ({
    status,
    count: appointments.filter((a) => a.status === status).length,
  }));

  const doctorRows = doctorData
    .map((doctor) => {
      const list = appointments.filter((a) => a.doctorId === doctor.id);
      const done = list.filter((a) => a.status === "completed").length;
      return { ...doctor, total: list.length, done, revenue: done * (Number(doctor.fee) || 0) };
    })
    .sort((a, b) => b.total - a.total);

  const specialtyRows = Object.entries(
    appointments.reduce((acc, a) => {
      acc[a.doctorSpecialty] = (acc[a.doctorSpecialty] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxSpecialty = specialtyRows[0]?.[1] || 1;

  const cards = [
    { label: "Appointments", value: appointments.length },
    { label: "Completed", value: completed.length },
    { label: "Completion Rate", value: `${completionRate}%` },
    { label: "Revenue (completed)", value: `₹${revenue.toLocaleString("en-IN")}` },
    { label: "Doctors", value: doctorData.length },
    { label: "Patients", value: patientData.length },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-500">Appointment activity, doctor performance and revenue.</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
        >
          {ranges.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Appointments by Status</h2>
          <div className="space-y-4">
            {statusCounts.map(({ status, count }) => (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="capitalize text-gray-700">{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${statusBarColors[status]}`}
                    style={{ width: `${appointments.length ? (count / appointments.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Appointments by Specialty</h2>
          <div className="space-y-4">
            {specialtyRows.map(([specialty, count]) => (
              <div key={specialty}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{specialty}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(count / maxSpecialty) * 100}%` }} />
                </div>
              </div>
            ))}
            {specialtyRows.length === 0 && <p className="text-sm text-gray-400">No appointments in this period</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <h2 className="text-lg font-semibold px-6 pt-5 pb-3">Doctor Performance</h2>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-6 py-3">Doctor</th>
              <th className="px-6 py-3">Specialty</th>
              <th className="px-6 py-3">Appointments</th>
              <th className="px-6 py-3">Completed</th>
              <th className="px-6 py-3">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {doctorRows.map((doctor) => (
              <tr key={doctor.id} className="border-t border-gray-100">
                <td className="px-6 py-3 font-medium">{doctor.name}</td>
                <td className="px-6 py-3">{doctor.specialty}</td>
                <td className="px-6 py-3">{doctor.total}</td>
                <td className="px-6 py-3">{doctor.done}</td>
                <td className="px-6 py-3">₹{doctor.revenue.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {doctorRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No doctors yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Reports;
