import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiCopy, FiPlus, FiRefreshCw, FiSearch } from "react-icons/fi";
import { serverUrl } from "../App";
import RefundStatusBadge from "../components/RefundStatusBadge";

const statusOptions = [
  { value: "", label: "All" },
  { value: "processing", label: "Pending / Processing" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
];

const typeOptions = [
  { value: "", label: "All" },
  { value: "full", label: "Full" },
  { value: "partial", label: "Partial" },
];

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

const emptyFilters = { search: "", status: "", type: "" };

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

function IdCell({ value }) {
  if (!value) return <span className="text-gray-400">-</span>;
  const short = value.length > 14 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <span title={value}>{short}</span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(value);
          toast.success("Copied", { position: "top-center", autoClose: 800 });
        }}
        className="text-gray-400 hover:text-emerald-600"
        aria-label="Copy"
      >
        <FiCopy size={12} />
      </button>
    </div>
  );
}

function Refunds() {
  const { adminData } = useSelector((state) => state.admin);
  const canIssueRefund = adminData?.role === "admin";
  const navigate = useNavigate();

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

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [filters, dateFrom, dateTo]);

  const listParams = useMemo(() => ({ ...filters, dateFrom, dateTo, page, pageSize }), [filters, dateFrom, dateTo, page, pageSize]);

  const loadList = async () => {
    setListLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/refund/list", { params: listParams, withCredentials: true });
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
      const result = await axios.get(serverUrl + "/api/refund/summary", { params: { dateFrom, dateTo }, withCredentials: true });
      setSummary(result.data);
    } catch (e) {
      console.log(e);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [listParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSummary();
  }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetFilters = () => {
    setFilters(emptyFilters);
    setSearchInput("");
    setRangePreset("30d");
    setCustomFrom("");
    setCustomTo("");
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "") || rangePreset !== "30d";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const periodLabel = rangePresets.find((r) => r.value === rangePreset)?.label || "Selected period";

  const inputClass = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Refund Management</h1>
          <p className="text-gray-500">Manage patient refunds and track refund transactions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadList();
              loadSummary();
            }}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FiRefreshCw /> Refresh
          </button>
          {canIssueRefund && (
            <button
              onClick={() => navigate("/refunds/new")}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
            >
              <FiPlus /> Issue Refund
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Total Refunded Amount"
          value={summary ? money(summary.totalRefundedAmount) : "-"}
          sub={`${periodLabel} · processed refunds only`}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Total Refund Transactions"
          value={summary ? summary.totalTransactions : "-"}
          sub={periodLabel}
          loading={summaryLoading}
        />
        <SummaryCard
          label="Refunds Processing"
          value={summary ? summary.processingCount : "-"}
          sub="Pending or in progress"
          loading={summaryLoading}
        />
        <SummaryCard
          label="Failed Refunds"
          value={summary ? summary.failedCount : "-"}
          sub={periodLabel}
          loading={summaryLoading}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search patient, phone, email, appointment, payment or refund ID"
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

        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={inputClass}>
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label} refunds
            </option>
          ))}
        </select>

        <button onClick={handleResetFilters} className="text-sm text-gray-500 hover:text-gray-700 px-2 ml-auto">
          Reset Filters
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3">Refund ID</th>
              <th className="px-4 py-3">Patient Name</th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Appointment ID</th>
              <th className="px-4 py-3">Original Payment ID</th>
              <th className="px-4 py-3">Original Amount</th>
              <th className="px-4 py-3">Refunded Amount</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Refund Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center">
                  <ClipLoader size={28} color="#059669" />
                </td>
              </tr>
            )}
            {!listLoading && listError && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-red-600">
                  {listError}{" "}
                  <button onClick={loadList} className="underline ml-1">
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!listLoading && !listError && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                  {hasActiveFilters ? "No refunds match these filters" : "No refunds yet"}
                </td>
              </tr>
            )}
            {!listLoading &&
              !listError &&
              rows.map((row) => (
                <tr key={row.eventId} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <IdCell value={row.refundId} />
                  </td>
                  <td className="px-4 py-3 font-medium">{row.patientName}</td>
                  <td className="px-4 py-3 tabular-nums">{row.patientCode}</td>
                  <td className="px-4 py-3">{row.appointmentCode}</td>
                  <td className="px-4 py-3">
                    <IdCell value={row.providerPaymentId || row.providerOrderId} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(row.originalAmount)}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{money(row.refundAmount)}</td>
                  <td className="px-4 py-3 capitalize">{row.refundType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(row.refundDate).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <RefundStatusBadge status={row.refundStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate(`/payments/${row.paymentId}`)} className="text-emerald-600 hover:underline">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">{total === 0 ? "0 results" : `${from}-${to} of ${total}`}</span>
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

export default Refunds;
