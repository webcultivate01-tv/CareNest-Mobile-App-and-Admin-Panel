import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import { FiAlertCircle, FiCalendar, FiClock, FiCreditCard, FiDollarSign, FiRefreshCw, FiUserCheck, FiUsers } from "react-icons/fi";
import { serverUrl } from "../App";
import RevenueChart from "../components/RevenueChart";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

const statuses = ["pending", "confirmed", "completed", "cancelled"];
const statusBarColors = {
  pending: "bg-amber-400",
  confirmed: "bg-blue-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-400",
};
const statusBadgeColors = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const money = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function SummaryCard({ icon, label, value, sub, color, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <span className={`flex items-center justify-center w-9 h-9 rounded-lg ${color}`}>{icon}</span>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 flex items-center mt-2">
          <ClipLoader size={16} color="#9ca3af" />
        </div>
      ) : (
        <p className="text-2xl font-bold mt-2 text-gray-900">{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Dashboard() {
  const { statsData } = useSelector((state) => state.dashboard);
  const { adminData } = useSelector((state) => state.admin);
  const { appointmentData } = useSelector((state) => state.appointment);
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [granularity, setGranularity] = useState("day");
  const [chartPoints, setChartPoints] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
  }, []);

  useEffect(() => {
    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        const result = await axios.get(serverUrl + "/api/payment/summary", { params: range, withCredentials: true });
        setSummary(result.data);
      } catch (error) {
        console.log(error);
      } finally {
        setSummaryLoading(false);
      }
    };
    loadSummary();
  }, [range]);

  useEffect(() => {
    const loadChart = async () => {
      setChartLoading(true);
      try {
        const result = await axios.get(serverUrl + "/api/payment/chart", {
          params: { ...range, granularity },
          withCredentials: true,
        });
        setChartPoints(result.data.points);
      } catch (error) {
        console.log(error);
      } finally {
        setChartLoading(false);
      }
    };
    loadChart();
  }, [range, granularity]);

  const statusCounts = statuses.map((status) => ({
    status,
    count: appointmentData.filter((a) => a.status === status).length,
  }));

  const todaysAppointments = useMemo(() => {
    const now = new Date();
    return appointmentData
      .filter((a) => a.status === "confirmed" && isSameDay(new Date(a.scheduledAt), now))
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }, [appointmentData]);

  const cards = [
    {
      label: "Doctors",
      value: statsData?.doctors ?? "-",
      icon: <FiUserCheck className="text-blue-600" size={18} />,
      color: "bg-blue-50",
    },
    {
      label: "Patients",
      value: statsData?.patients ?? "-",
      icon: <FiUsers className="text-purple-600" size={18} />,
      color: "bg-purple-50",
    },
    {
      label: "Total Appointments",
      value: statsData?.appointments ?? "-",
      icon: <FiCalendar className="text-indigo-600" size={18} />,
      color: "bg-indigo-50",
    },
    {
      label: "Today's Appointments",
      value: statsData?.today ?? "-",
      icon: <FiClock className="text-amber-600" size={18} />,
      color: "bg-amber-50",
    },
    {
      label: "Pending Appointments",
      value: statsData?.pending ?? "-",
      icon: <FiAlertCircle className="text-orange-600" size={18} />,
      color: "bg-orange-50",
    },
    {
      label: "Revenue (30 days)",
      value: summary ? money(summary.revenue.amount) : "-",
      sub:
        summary?.revenue.changePct == null
          ? "Captured payments"
          : `${summary.revenue.changePct >= 0 ? "+" : ""}${summary.revenue.changePct.toFixed(1)}% vs previous period`,
      icon: <FiDollarSign className="text-emerald-600" size={18} />,
      color: "bg-emerald-50",
      loading: summaryLoading,
    },
    {
      label: "Pending Payments",
      value: summary ? summary.pending.count : "-",
      sub: summary ? `${money(summary.pending.amount)} awaiting confirmation` : "",
      icon: <FiCreditCard className="text-sky-600" size={18} />,
      color: "bg-sky-50",
      loading: summaryLoading,
    },
    {
      label: "Refunds (30 days)",
      value: summary ? money(summary.refunds.amount) : "-",
      sub: summary ? `${summary.refunds.count} refunded transaction(s)` : "",
      icon: <FiRefreshCw className="text-red-600" size={18} />,
      color: "bg-red-50",
      loading: summaryLoading,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome, {adminData?.name}</h1>
      <p className="text-gray-500 mb-6">Overview of CareNest</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mb-6">
        <RevenueChart points={chartPoints} granularity={granularity} onGranularityChange={setGranularity} loading={chartLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    style={{ width: `${appointmentData.length ? (count / appointmentData.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {appointmentData.length === 0 && <p className="text-sm text-gray-400">No appointments yet</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-lg font-semibold">Today's Appointments</h2>
            <button onClick={() => navigate("/appointments")} className="text-sm text-emerald-600 hover:underline">
              View all
            </button>
          </div>
          <div className="divide-y divide-gray-100 max-h-[280px] overflow-y-auto">
            {todaysAppointments.length === 0 && <p className="px-6 pb-5 text-sm text-gray-400">No appointments scheduled for today</p>}
            {todaysAppointments.map((appointment) => (
              <div key={appointment.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{appointment.patientName}</p>
                  <p className="text-xs text-gray-500">
                    {appointment.doctorName} · {new Date(appointment.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaymentStatusBadge status={appointment.paymentStatus === "paid" ? "captured" : appointment.paymentStatus} />
                  <span className={`rounded-full px-2 py-1 text-xs capitalize ${statusBadgeColors[appointment.status]}`}>
                    {appointment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
