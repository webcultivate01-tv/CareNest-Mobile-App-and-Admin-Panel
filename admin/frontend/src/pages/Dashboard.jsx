import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import {
  FiAlertCircle,
  FiArrowDownRight,
  FiArrowRight,
  FiArrowUpRight,
  FiCalendar,
  FiChevronRight,
  FiClock,
  FiDollarSign,
  FiRefreshCw,
  FiUser,
  FiUserCheck,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { serverUrl } from "../App";
import { hasModule } from "../modules";
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

function SummaryCard({ icon, label, value, sub, trend, color, loading, to, onOpen }) {
  const trendUp = trend != null && trend >= 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 flex gap-2 sm:gap-4 relative active:bg-gray-50 sm:active:bg-white">
      <button
        onClick={() => onOpen(to)}
        className="absolute inset-0 rounded-2xl sm:hidden"
        aria-label={`Open ${label}`}
      />
      <span className={`flex items-center justify-center w-8 h-8 sm:w-14 sm:h-14 rounded-lg sm:rounded-2xl shrink-0 [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-6 sm:[&>svg]:h-6 ${color}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs sm:text-sm text-gray-600 sm:truncate">{label}</p>
          <button
            onClick={() => onOpen(to)}
            className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0 relative"
            aria-label={`Open ${label}`}
          >
            <FiChevronRight size={14} />
          </button>
        </div>
        {loading ? (
          <div className="h-8 flex items-center">
            <ClipLoader size={16} color="#9ca3af" />
          </div>
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{value}</p>
        )}
        {trend != null && !loading && (
          <p className={`hidden sm:flex items-center gap-1 text-xs font-semibold ${trendUp ? "text-emerald-600" : "text-red-500"}`}>
            {trendUp ? <FiArrowUpRight size={14} /> : <FiArrowDownRight size={14} />}
            {trendUp ? "+" : ""}
            {trend.toFixed(1)}%
          </p>
        )}
        {sub && !loading && <p className="hidden sm:block text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Dashboard() {
  const { statsData } = useSelector((state) => state.dashboard);
  const { appointmentData } = useSelector((state) => state.appointment);
  const { adminData } = useSelector((state) => state.admin);
  const canSeePayments = hasModule(adminData, "payments");
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
    if (!canSeePayments) {
      setSummaryLoading(false);
      return;
    }
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
  }, [range, canSeePayments]);

  useEffect(() => {
    if (!canSeePayments) {
      setChartLoading(false);
      return;
    }
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
  }, [range, granularity, canSeePayments]);

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

  const recentAppointments = useMemo(
    () => [...appointmentData].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)).slice(0, 4),
    [appointmentData]
  );

  const cards = [
    {
      label: "Total Appointments",
      value: statsData?.appointments ?? "-",
      sub: "All time appointments",
      icon: <FiCalendar className="text-indigo-600" size={24} />,
      color: "bg-indigo-50",
      to: "/appointments",
    },
    {
      label: "Today's Appointments",
      value: statsData?.today ?? "-",
      sub: "Appointments for today",
      icon: <FiClock className="text-amber-600" size={24} />,
      color: "bg-amber-50",
      to: "/queue",
    },
    {
      label: "Pending Appointments",
      value: statsData?.pending ?? "-",
      sub: "Awaiting confirmation",
      icon: <FiAlertCircle className="text-orange-600" size={24} />,
      color: "bg-orange-50",
      to: "/appointments",
    },
    {
      label: "Cancelled Appointments",
      value: statusCounts.find((s) => s.status === "cancelled").count,
      sub: "Cancelled bookings",
      icon: <FiXCircle className="text-red-600" size={24} />,
      color: "bg-red-50",
      to: "/appointments",
    },
    {
      label: "Doctors",
      value: statsData?.doctors ?? "-",
      sub: "Total registered doctors",
      icon: <FiUserCheck className="text-blue-600" size={24} />,
      color: "bg-blue-50",
      to: "/doctors",
    },
    {
      label: "Patients",
      value: statsData?.patients ?? "-",
      sub: "Total registered patients",
      icon: <FiUsers className="text-purple-600" size={24} />,
      color: "bg-purple-50",
      to: "/patients",
    },
    {
      label: "Revenue (30 days)",
      value: summary ? money(summary.revenue.amount) : "-",
      trend: summary?.revenue.changePct,
      sub: "Captured payments",
      icon: <FiDollarSign className="text-emerald-600" size={24} />,
      color: "bg-emerald-50",
      loading: summaryLoading,
      to: "/payments",
    },
    {
      label: "Refunds (30 days)",
      value: summary ? money(summary.refunds.amount) : "-",
      sub: summary ? `${summary.refunds.count} refunded transaction(s)` : "",
      icon: <FiRefreshCw className="text-red-600" size={24} />,
      color: "bg-red-50",
      loading: summaryLoading,
      to: "/refunds",
    },
  ].filter((card) => !(!canSeePayments && (card.to === "/payments" || card.to === "/refunds")));

  return (
    <div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 mb-6">
        {cards.map((card) => (
          <SummaryCard key={card.label} {...card} onOpen={navigate} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {canSeePayments && (
          <div className="xl:col-span-2">
            <RevenueChart points={chartPoints} granularity={granularity} onGranularityChange={setGranularity} loading={chartLoading} />
          </div>
        )}

        <div
          className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col ${
            !canSeePayments ? "xl:col-span-3" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <FiCalendar size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">Recent Appointments</h2>
                <p className="text-xs text-gray-500 truncate">Latest appointment bookings</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/appointments")}
              className="flex items-center gap-1.5 shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              View All <FiArrowRight size={14} />
            </button>
          </div>
          <div className="space-y-3 flex-1">
            {recentAppointments.length === 0 && <p className="text-sm text-gray-400">No appointments yet</p>}
            {recentAppointments.map((appointment) => (
              <div key={appointment.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                <span className="flex items-center justify-center w-11 h-11 rounded-full bg-purple-50 text-purple-500 shrink-0">
                  <FiUser size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{appointment.patientName}</p>
                  <p className="text-xs text-gray-500 truncate">{appointment.doctorName}</p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                    <FiCalendar size={12} />
                    {new Date(appointment.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {new Date(appointment.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusBadgeColors[appointment.status]}`}>
                  {appointment.status}
                </span>
              </div>
            ))}
          </div>
        </div>
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
