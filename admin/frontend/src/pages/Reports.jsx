import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import {
  FiAlertCircle,
  FiArrowRight,
  FiCalendar,
  FiCheck,
  FiCreditCard,
  FiDownload,
  FiFileText,
  FiFilter,
  FiRotateCcw,
  FiSearch,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { FaFilePdf, FaRegFileExcel, FaUserMd } from "react-icons/fa";
import { serverUrl } from "../App";

// The Reports page: pick a report, set its filters, check the preview, download it as PDF or Excel.
//
// The report catalogue lives on the server (backend/model/reportModel.js) and arrives from
// /api/report/types, so this page never hard-codes what a report contains - it draws the cards from
// that list, renders one filter control per filter the report declares, and previews the exact rows
// the file will hold. Adding a report on the server adds a card here with no change to this file.

const CARD_ICONS = {
  users: <FiUsers />,
  doctors: <FaUserMd />,
  appointments: <FiCalendar />,
  payments: <FiCreditCard />,
  refunds: <FiRotateCcw />,
};

const CARD_ACCENTS = {
  users: "bg-sky-50 text-sky-600",
  doctors: "bg-emerald-50 text-emerald-600",
  appointments: "bg-violet-50 text-violet-600",
  payments: "bg-amber-50 text-amber-600",
  refunds: "bg-rose-50 text-rose-600",
};

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const inputClass =
  "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

const ymd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Plain YYYY-MM-DD, deliberately not an ISO instant: the server reads a bare date as the clinic's
// own day (see the parseDate note in backend/controllers/reportController.js), so "Today" means the
// clinic's today rather than the browser's.
const presetRange = (preset, customFrom, customTo) => {
  const now = new Date();
  const daysAgo = (n) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  switch (preset) {
    case "today":
      return { dateFrom: ymd(now), dateTo: ymd(now) };
    case "7d":
      return { dateFrom: daysAgo(6), dateTo: ymd(now) };
    case "30d":
      return { dateFrom: daysAgo(29), dateTo: ymd(now) };
    case "month":
      return { dateFrom: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: ymd(now) };
    case "year":
      return { dateFrom: ymd(new Date(now.getFullYear(), 0, 1)), dateTo: ymd(now) };
    case "custom":
      return { dateFrom: customFrom || "", dateTo: customTo || "" };
    case "all":
    default:
      return { dateFrom: "", dateTo: "" };
  }
};

const titleCase = (value) =>
  String(value)
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// mirrors the server's cell formatting (backend/config/reports.js) so the preview reads exactly like
// the generated file - the rupee sign included, which a browser can render and a PDF font can not
const previewCell = (type, value) => {
  if (value === null || value === undefined || value === "") return type === "bool" ? "No" : "-";
  if (type === "money") return money(value);
  if (type === "int") return Number(value).toLocaleString("en-IN");
  if (type === "datetime") return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (type === "date") return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
  if (type === "status") return titleCase(value);
  if (type === "bool") return value ? "Yes" : "No";
  return String(value);
};

const summaryValue = (stat) => (stat.type === "money" ? money(stat.value) : Number(stat.value).toLocaleString("en-IN"));

function Field({ label, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

// one <select> with an "All" option, used by every dropdown filter
function SelectFilter({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">{allLabel}</option>
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? titleCase(option) : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

function ReportCard({ report, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex h-full flex-col items-start gap-4 overflow-hidden rounded-2xl border bg-white p-5 text-left transition duration-200 ${
        selected
          ? "border-emerald-500 shadow-md ring-4 ring-emerald-50"
          : "border-gray-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
      }`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 transition ${
          selected ? "bg-emerald-500" : "bg-transparent group-hover:bg-emerald-200"
        }`}
      />
      <div className="flex w-full items-start justify-between">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${
            CARD_ACCENTS[report.key] || "bg-gray-50 text-gray-600"
          }`}
        >
          {CARD_ICONS[report.key] || <FiFileText />}
        </span>
        {selected && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
            <FiCheck size={14} />
          </span>
        )}
      </div>
      <div className="flex-1">
        <p className="text-base font-bold text-gray-900">{report.title}</p>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-gray-500">{report.description}</p>
      </div>
      <span
        className={`flex w-full items-center justify-between border-t border-gray-100 pt-3 text-xs font-semibold ${
          selected ? "text-emerald-700" : "text-gray-500 group-hover:text-emerald-600"
        }`}
      >
        {selected ? "Selected" : "Set filters & generate"}
        <FiArrowRight size={14} className="transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

function Reports() {
  const [catalogue, setCatalogue] = useState(null);
  const [catalogueError, setCatalogueError] = useState("");
  const [selectedKey, setSelectedKey] = useState("");

  const [datePreset, setDatePreset] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filters, setFilters] = useState({});
  const [searchInput, setSearchInput] = useState("");

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [downloading, setDownloading] = useState("");

  const panelRef = useRef(null);

  const reports = catalogue?.reports || [];
  const options = catalogue?.options;
  const report = reports.find((r) => r.key === selectedKey) || null;
  const supports = useCallback((name) => Boolean(report?.filters.includes(name)), [report]);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await axios.get(serverUrl + "/api/report/types", { withCredentials: true });
        setCatalogue(result.data);
      } catch (error) {
        setCatalogueError(error.response?.data?.message || "Could not load the report list");
      }
    };
    load();
  }, []);

  // debounce the free-text box so typing does not fire a preview per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => ({ ...current, search: searchInput })), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const range = useMemo(() => presetRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);

  // everything the preview and the download send; the server ignores filters a report does not declare
  const params = useMemo(() => ({ ...filters, ...range }), [filters, range]);

  useEffect(() => {
    if (!report) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setPreviewLoading(true);
      try {
        const result = await axios.get(serverUrl + `/api/report/${report.key}/preview`, {
          params,
          withCredentials: true,
        });
        if (!cancelled) {
          setPreview(result.data);
          setPreviewError("");
        }
      } catch (error) {
        if (!cancelled) setPreviewError(error.response?.data?.message || "Could not build the preview");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [report, params]);

  const handleSelect = (key) => {
    if (key === selectedKey) return;
    // a filter only makes sense for the report it was chosen on, so start each report clean
    setSelectedKey(key);
    setFilters({});
    setSearchInput("");
    setDatePreset("30d");
    setCustomFrom("");
    setCustomTo("");
    setPreview(null);
    setPreviewError("");
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const handleReset = () => {
    setFilters({});
    setSearchInput("");
    setDatePreset("30d");
    setCustomFrom("");
    setCustomTo("");
  };

  const setFilter = (name) => (value) => setFilters((current) => ({ ...current, [name]: value }));

  // The file arrives as a blob rather than through window.open so a failure can be reported as a
  // toast instead of replacing the tab with a raw JSON error page.
  const handleDownload = async (format) => {
    if (!report) return;
    setDownloading(format);
    try {
      const response = await axios.get(serverUrl + `/api/report/${report.key}/generate`, {
        params: { ...params, format },
        withCredentials: true,
        responseType: "blob",
      });

      const disposition = response.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const fallback = `carenest-${report.key}-report.${format === "excel" ? "xlsx" : "pdf"}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = match ? match[1] : fallback;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const rows = Number(response.headers["x-report-rows"]);
      toast.success(
        Number.isFinite(rows) ? `${report.title} downloaded (${rows.toLocaleString("en-IN")} rows)` : "Report downloaded",
        { position: "top-center", autoClose: 1600 }
      );
    } catch (error) {
      // an error response is still a blob, so the server's message has to be read out of it
      let message = "Could not generate the report";
      try {
        const text = error.response?.data instanceof Blob ? await error.response.data.text() : "";
        message = JSON.parse(text).message || message;
      } catch {
        message = error.response?.statusText || message;
      }
      toast.error(message, { position: "top-center", autoClose: 2500 });
    } finally {
      setDownloading("");
    }
  };

  const hasRows = Boolean(preview?.rows?.length);
  const busy = Boolean(downloading);

  if (catalogueError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="flex items-center gap-2 font-semibold">
          <FiAlertCircle /> {catalogueError}
        </p>
      </div>
    );
  }

  if (!catalogue) {
    return (
      <div className="flex h-64 items-center justify-center">
        <ClipLoader size={34} color="#059669" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-gray-500">
          Pick a report, narrow it with filters, then download it as a PDF to read or an Excel workbook to work with.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {reports.map((item) => (
          <ReportCard
            key={item.key}
            report={item}
            selected={item.key === selectedKey}
            onSelect={() => handleSelect(item.key)}
          />
        ))}
      </div>

      {!report && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <FiFileText className="mx-auto mb-3 text-3xl text-gray-300" />
          <p className="font-semibold text-gray-700">Choose a report above to begin</p>
          <p className="mt-1 text-sm text-gray-500">
            You will be able to set its filters and preview the rows before downloading anything.
          </p>
        </div>
      )}

      {report && (
        <div ref={panelRef} className="scroll-mt-28 space-y-4">
          {/* ---- filters ---- */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <FiFilter className="text-emerald-600" /> {report.title} filters
                </h2>
                <p className="text-sm text-gray-500">{report.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleReset} className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800">
                  Reset
                </button>
                <button
                  onClick={() => setSelectedKey("")}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <FiX size={14} /> Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {supports("dateRange") && (
                <Field label={report.dateLabel || "Date range"}>
                  <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className={inputClass}>
                    {DATE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {supports("dateRange") && datePreset === "custom" && (
                <>
                  <Field label="From">
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="To">
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputClass} />
                  </Field>
                </>
              )}

              {supports("search") && (
                <Field label="Search" className="lg:col-span-2">
                  <div className="relative">
                    <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={report.searchPlaceholder || "Search"}
                      className={`${inputClass} w-full pl-9`}
                    />
                  </div>
                </Field>
              )}

              {supports("status") && (
                <SelectFilter
                  label="Appointment status"
                  value={filters.status || ""}
                  onChange={setFilter("status")}
                  options={options.appointmentStatuses}
                />
              )}
              {supports("paymentStatus") && (
                <SelectFilter
                  label="Payment state"
                  value={filters.paymentStatus || ""}
                  onChange={setFilter("paymentStatus")}
                  options={options.appointmentPaymentStatuses}
                />
              )}
              {supports("paymentTxnStatus") && (
                <SelectFilter
                  label="Transaction status"
                  value={filters.paymentTxnStatus || ""}
                  onChange={setFilter("paymentTxnStatus")}
                  options={options.paymentTxnStatuses.map((status) => ({
                    value: status,
                    label: status === "captured" ? "Successful" : titleCase(status),
                  }))}
                />
              )}
              {supports("method") && (
                <SelectFilter
                  label="Payment method"
                  value={filters.method || ""}
                  onChange={setFilter("method")}
                  options={options.methods}
                />
              )}
              {supports("doctor") && (
                <SelectFilter
                  label="Doctor"
                  value={filters.doctorId || ""}
                  onChange={setFilter("doctorId")}
                  allLabel="All doctors"
                  options={options.doctors.map((doctor) => ({
                    value: String(doctor.id),
                    label: `${doctor.name}${doctor.specialty ? ` - ${doctor.specialty}` : ""}`,
                  }))}
                />
              )}
              {supports("specialty") && (
                <SelectFilter
                  label="Specialty"
                  value={filters.specialty || ""}
                  onChange={setFilter("specialty")}
                  allLabel="All specialties"
                  options={options.specialties}
                />
              )}
              {supports("doctorStatus") && (
                <SelectFilter
                  label="Doctor status"
                  value={filters.doctorStatus || ""}
                  onChange={setFilter("doctorStatus")}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              )}
              {supports("consent") && (
                <SelectFilter
                  label="Marketing consent"
                  value={filters.consent || ""}
                  onChange={setFilter("consent")}
                  options={[
                    { value: "yes", label: "Agreed" },
                    { value: "no", label: "Not agreed" },
                  ]}
                />
              )}
              {supports("refundStatus") && (
                <SelectFilter
                  label="Refund status"
                  value={filters.refundStatus || ""}
                  onChange={setFilter("refundStatus")}
                  options={options.refundStatuses}
                />
              )}
              {supports("refundType") && (
                <SelectFilter
                  label="Refund type"
                  value={filters.refundType || ""}
                  onChange={setFilter("refundType")}
                  options={options.refundTypes}
                />
              )}
              {supports("amountRange") && (
                <Field label="Amount range (₹)">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={filters.minAmount || ""}
                      onChange={(e) => setFilter("minAmount")(e.target.value)}
                      className={`${inputClass} w-full`}
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={filters.maxAmount || ""}
                      onChange={(e) => setFilter("maxAmount")(e.target.value)}
                      className={`${inputClass} w-full`}
                    />
                  </div>
                </Field>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <button
                onClick={() => handleDownload("pdf")}
                disabled={busy || previewLoading || !hasRows}
                className="flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "pdf" ? <ClipLoader size={14} color="#fff" /> : <FaFilePdf />} Generate PDF
              </button>
              <button
                onClick={() => handleDownload("excel")}
                disabled={busy || previewLoading || !hasRows}
                className="flex h-11 items-center gap-2 rounded-xl border border-emerald-600 bg-white px-5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading === "excel" ? <ClipLoader size={14} color="#059669" /> : <FaRegFileExcel />} Generate Excel
              </button>
              <span className="flex items-center gap-1.5 text-sm text-gray-500">
                <FiDownload size={13} />
                {previewLoading
                  ? "Checking how many rows match..."
                  : preview
                    ? `${preview.total.toLocaleString("en-IN")} row(s) match these filters`
                    : ""}
              </span>
            </div>
            {preview && preview.total > preview.maxRows && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Only the first {preview.maxRows.toLocaleString("en-IN")} rows fit in one file. Narrow the date range to
                get the rest.
              </p>
            )}
          </div>

          {/* ---- preview ---- */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">Preview</h2>
              <p className="text-sm text-gray-500">
                {hasRows
                  ? `First ${preview.rows.length} of ${preview.total.toLocaleString("en-IN")} rows - the file contains them all`
                  : "Nothing to show yet"}
              </p>
            </div>

            {preview?.summary?.length > 0 && (
              <div className="grid grid-cols-2 gap-3 border-b border-gray-100 bg-gray-50/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
                {preview.summary.map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <p className="truncate text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{stat.label}</p>
                    <p className="mt-1 truncate text-xl font-bold text-emerald-700">{summaryValue(stat)}</p>
                  </div>
                ))}
              </div>
            )}

            {previewLoading && (
              <div className="flex h-40 items-center justify-center">
                <ClipLoader size={28} color="#059669" />
              </div>
            )}

            {!previewLoading && previewError && (
              <p className="px-5 py-10 text-center text-red-600">{previewError}</p>
            )}

            {!previewLoading && !previewError && !hasRows && (
              <p className="px-5 py-12 text-center text-gray-400">
                No records match these filters. Widen the date range or clear a filter.
              </p>
            )}

            {!previewLoading && !previewError && hasRows && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      {preview.columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        {preview.columns.map((column) => (
                          <td
                            key={column.key}
                            className={`px-4 py-2.5 ${
                              column.type === "money" || column.type === "int"
                                ? "whitespace-nowrap text-right tabular-nums"
                                : "max-w-[260px] truncate"
                            }`}
                            title={previewCell(column.type, row[column.key])}
                          >
                            {previewCell(column.type, row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
