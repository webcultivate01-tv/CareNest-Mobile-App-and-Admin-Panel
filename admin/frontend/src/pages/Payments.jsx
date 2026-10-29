import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiCopy, FiDownload, FiRefreshCw, FiSearch } from "react-icons/fi";
import { serverUrl } from "../App";
import RevenueChart from "../components/RevenueChart";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

const statusOptions = [
  { value: "", label: "All" },
  { value: "captured", label: "Successful" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
  { value: "partially_refunded", label: "Partially Refunded" },
];

const methodLabels = { upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet" };

const rangePresets = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

const pageSizeOptions = [10, 25, 50];

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const computeRange = (preset, customFrom, customTo) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { dateFrom: startOfToday.toISOString(), dateTo: now.toISOString() };
    case "7d":
      return { dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString(), dateTo: now.toISOString() };
    case "month":
      return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), dateTo: now.toISOString() };
    case "custom":
      return {
        dateFrom: customFrom ? new Date(customFrom).toISOString() : startOfToday.toISOString(),
        dateTo: customTo ? new Date(customTo + "T23:59:59").toISOString() : now.toISOString(),
      };
    case "30d":
    default:
      return { dateFrom: new Date(now.getTime() - 30 * 86400000).toISOString(), dateTo: now.toISOString() };
  }
};

const emptyFilters = { search: "", status: "", method: "", minAmount: "", maxAmount: "" };

function TxnIdCell({ value }) {
  if (!value) return <span className="text-gray-400">-</span>;
  const short = value.length > 14 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <span title={value}>{short}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(value);
          toast.success("Copied", { position: "top-center", autoClose: 800 });
        }}
        className="text-gray-400 hover:text-emerald-600"
        aria-label="Copy transaction ID"
      >
        <FiCopy size={12} />
      </button>
    </div>
  );
}

function SummaryCard({ label, value, sub, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      {loading ? (
        <div className="h-8 flex items-center">
          <ClipLoader size={18} color="#9ca3af" />
        </div>
      ) : (
        <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Payments() {
  const { adminData } = useSelector((state) => state.admin);
  const canRefund = adminData?.role === "admin";

  const [rangePreset, setRangePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { dateFrom, dateTo } = useMemo(() => computeRange(rangePreset, customFrom, customTo), [rangePreset, customFrom, customTo]);

  const [filters, setFilters] = useState(emptyFilters);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [granularity, setGranularity] = useState("day");
  const [chartPoints, setChartPoints] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);

  const navigate = useNavigate();

  // debounce free-text search so it doesn't fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [filters, dateFrom, dateTo]);

  const listParams = useMemo(
    () => ({ ...filters, dateFrom, dateTo, page, pageSize }),
    [filters, dateFrom, dateTo, page, pageSize]
  );

  const loadList = async () => {
    setListLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/payment/list", { params: listParams, withCredentials: true });
      setRows(result.data.rows);
      setTotal(result.data.total);
      setListError("");
    } catch (e) {
      setListError(e.response?.data?.message || "Something went wrong");
    } finally {
      setListLoading(false);
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/payment/summary", { params: { dateFrom, dateTo }, withCredentials: true });
      setSummary(result.data);
    } catch (e) {
      console.log(e);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadChart = async () => {
    setChartLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/payment/chart", {
        params: { dateFrom, dateTo, granularity },
        withCredentials: true,
      });
      setChartPoints(result.data.points);
    } catch (e) {
      console.log(e);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [listParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSummary();
  }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadChart();
  }, [dateFrom, dateTo, granularity]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-refresh so captured mobile payments show up without a manual reload
  useEffect(() => {
    const t = setInterval(() => {
      loadList();
      loadSummary();
    }, 30000);
    return () => clearInterval(t);
  }, [listParams, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetFilters = () => {
    setFilters(emptyFilters);
    setSearchInput("");
    setRangePreset("30d");
    setCustomFrom("");
    setCustomTo("");
  };

  const handleExport = () => {
    const params = new URLSearchParams({ ...filters, dateFrom, dateTo });
    window.open(serverUrl + "/api/payment/export?" + params.toString(), "_blank");
  };

  const methodOptions = useMemo(() => {
    const extra = (summary?.distinctMethods || []).filter((m) => !methodLabels[m]);
    return [
      { value: "", label: "All" },
      ...Object.entries(methodLabels).map(([value, label]) => ({ value, label })),
      ...extra.map((m) => ({ value: m, label: m })),
    ];
  }, [summary]);

  const hasActiveFilters =
    Object.values(filters).some((v) => v !== "") || rangePreset !== "30d";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const inputClass = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payments Management</h1>
          <p className="text-gray-500">Track appointment payments, monitor revenue, and manage transactions.</p>
        </div>
        <button
          onClick={() => {
            loadList();
            loadSummary();
            loadChart();
          }}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <FiRefreshCw /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Total Revenue"
          value={summary ? money(summary.revenue.amount) : "-"}
          sub={
            summary?.revenue.changePct == null
              ? `${rangePresets.find((r) => r.value === rangePreset)?.label}`
              : `${summary.revenue.changePct >= 0 ? "+" : ""}${summary.revenue.changePct.toFixed(1)}% vs previous period`
          }
          loading={summaryLoading}
        />
        <SummaryCard
          label="Successful Payments"
          value={summary ? summary.successful.count : "-"}
          sub="Captured transactions"
          loading={summaryLoading}
        />
        <SummaryCard
          label="Pending Payments"
          value={summary ? summary.pending.count : "-"}
          sub={summary ? money(summary.pending.amount) + " awaiting confirmation" : ""}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Refunds"
          value={summary ? money(summary.refunds.amount) : "-"}
          sub={summary ? `${summary.refunds.count} refunded transaction(s)` : ""}
          loading={summaryLoading}
        />
      </div>

      <div className="mb-6">
        <RevenueChart points={chartPoints} granularity={granularity} onGranularityChange={setGranularity} loading={chartLoading} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search patient, appointment ID or transaction ID"
            className={inputClass + " w-full pl-8"}
          />
        </div>

        <select value={rangePreset} onChange={(e) => setRangePreset(e.target.value)} className={inputClass}>
          {rangePresets.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {rangePreset === "custom" && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputClass} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputClass} />
          </>
        )}

        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })} className={inputClass}>
          {methodOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Min ₹"
          value={filters.minAmount}
          onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
          className={inputClass + " w-24"}
        />
        <input
          type="number"
          placeholder="Max ₹"
          value={filters.maxAmount}
          onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
          className={inputClass + " w-24"}
        />

        <button onClick={handleResetFilters} className="text-sm text-gray-500 hover:text-gray-700 px-2">
          Reset Filters
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium ml-auto"
        >
          <FiDownload size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Date & Time</th>
              <th className="px-4 py-3">Transaction ID</th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Appointment ID</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center">
                  <ClipLoader size={28} color="#059669" />
                </td>
              </tr>
            )}
            {!listLoading && listError && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-red-600">
                  {listError}{" "}
                  <button onClick={loadList} className="underline ml-1">
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!listLoading && !listError && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                  {hasActiveFilters ? "No transactions match these filters" : "No transactions yet"}
                </td>
              </tr>
            )}
            {!listLoading &&
              !listError &&
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/payments/${row.id}`)}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 tabular-nums text-gray-500">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(row.capturedAt || row.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <TxnIdCell value={row.providerPaymentId || row.providerOrderId} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.patientCode}</td>
                  <td className="px-4 py-3 font-medium">{row.patientName}</td>
                  <td className="px-4 py-3">{row.appointmentCode}</td>
                  <td className="px-4 py-3">{methodLabels[row.method] || row.method || "-"}</td>
                  <td className="px-4 py-3 tabular-nums">{money(row.amount)}</td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/payments/${row.id}`);
                      }}
                      className="text-emerald-600 hover:underline"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {total === 0 ? "0 results" : `${from}-${to} of ${total}`}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs outline-none"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Payments;
