import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft, FiArrowRight, FiCheck } from "react-icons/fi";
import { serverUrl } from "../App";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyFilters = { patientName: "", phone: "", patientCode: "", appointmentCode: "", dateFrom: "", dateTo: "" };

const percentageOptions = [50, 60, 70, 80, 90, 100];

const reasonOptions = [
  "Patient requested cancellation",
  "Clinic/doctor cancelled the appointment",
  "Appointment rescheduled - refund requested",
  "Duplicate payment",
  "Billing error / overcharge",
  "Service not rendered",
  "Other",
];

const steps = ["Find Patient", "Select Payment", "Refund Amount", "Reason", "Review"];

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n === step ? "current" : n < step ? "done" : "upcoming";
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                state === "current"
                  ? "bg-emerald-600 text-white"
                  : state === "done"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${
                  state === "current" ? "bg-white/20" : state === "done" ? "bg-emerald-100" : "bg-gray-200"
                }`}
              >
                {state === "done" ? <FiCheck size={12} /> : n}
              </span>
              {label}
            </div>
            {n < steps.length && <div className={`w-6 h-px ${n < step ? "bg-emerald-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function IssueRefund() {
  const { adminData } = useSelector((state) => state.admin);
  const navigate = useNavigate();

  // only the primary admin can actually issue a refund - same gate the backend enforces
  useEffect(() => {
    if (adminData && adminData.role !== "admin") {
      toast.error("Only the primary admin can issue refunds", { position: "top-center", autoClose: 2500 });
      navigate("/refunds");
    }
  }, [adminData]); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState(1);

  // step 1: search
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState("");

  // step 2+: selection
  const [selected, setSelected] = useState(null);

  // step 3: amount
  const [percentage, setPercentage] = useState(100);

  // step 4: reason
  const [reason, setReason] = useState(reasonOptions[0]);
  const [note, setNote] = useState("");

  // step 5: submit
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // debounce free-text filters before firing a request; date fields are discrete so they are
  // folded into the same `filters` object and ride along on the same debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedFilters(filters);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters]);

  const pageSize = 10;
  const listParams = useMemo(() => ({ ...appliedFilters, page, pageSize }), [appliedFilters, page]);

  const loadResults = async () => {
    setSearchLoading(true);
    try {
      const result = await axios.get(serverUrl + "/api/refund/appointments", { params: listParams, withCredentials: true });
      setRows(result.data.rows);
      setTotal(result.data.total);
      setSearchError("");
    } catch (e) {
      setSearchError(e.response?.data?.message || "Something went wrong");
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (step === 1) loadResults();
  }, [listParams, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchNow = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== "");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const remaining = selected ? Number(selected.remainingAmount) : 0;
  const refundAmount = Math.round(remaining * (percentage / 100) * 100) / 100;
  const balanceAfter = Math.round((remaining - refundAmount) * 100) / 100;

  const canGoToAmount = !!selected;
  const canGoToReason = percentageOptions.includes(percentage);
  const canGoToReview = reason && (reason !== "Other" || note.trim().length > 0);

  const goNext = () => setStep((s) => Math.min(5, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleConfirm = async () => {
    setBusy(true);
    setSubmitError("");
    try {
      const reasonText = reason === "Other" ? `Other: ${note.trim()}` : note.trim() ? `${reason} - ${note.trim()}` : reason;
      const result = await axios.post(
        serverUrl + `/api/payment/refund/${selected.paymentId}`,
        { amount: refundAmount, reason: reasonText },
        { withCredentials: true }
      );
      const toastFn = result.data.refundStatus === "failed" ? toast.error : toast.success;
      toastFn(result.data.message || "Refund submitted", { position: "top-center", autoClose: 2500 });
      navigate("/refunds");
    } catch (e) {
      setSubmitError(e.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 w-full";
  const card = "bg-white border border-gray-200 rounded-xl p-5";
  const label = "text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 block";

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate("/refunds")} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <FiArrowLeft /> Back to Refund Management
      </button>
      <h1 className="text-2xl font-bold mb-1">Issue Refund</h1>
      <p className="text-gray-500 mb-6">Find the patient's appointment, choose the refund amount, and confirm.</p>

      <StepIndicator step={step} />

      {step === 1 && (
        <div className="space-y-4">
          <div className={card}>
            <h3 className="font-semibold mb-3">Find a patient or appointment</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={label}>Patient Name</label>
                <input
                  value={filters.patientName}
                  onChange={(e) => setFilters({ ...filters, patientName: e.target.value })}
                  placeholder="Full or partial name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={label}>Mobile Number</label>
                <input
                  value={filters.phone}
                  onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
                  placeholder="Registered phone number"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={label}>Patient ID</label>
                <input
                  value={filters.patientCode}
                  onChange={(e) => setFilters({ ...filters, patientCode: e.target.value })}
                  placeholder="CNP-001"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={label}>Appointment ID</label>
                <input
                  value={filters.appointmentCode}
                  onChange={(e) => setFilters({ ...filters, appointmentCode: e.target.value })}
                  placeholder="CNAP-001"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={label}>Appointment Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={label}>Appointment Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={handleSearchNow} className="bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
                Search
              </button>
              <button onClick={handleClearFilters} className="text-sm text-gray-500 hover:text-gray-700">
                Clear Filters
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Appointment</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Refunded</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {searchLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <ClipLoader size={28} color="#059669" />
                    </td>
                  </tr>
                )}
                {!searchLoading && searchError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-red-600">
                      {searchError}{" "}
                      <button onClick={loadResults} className="underline ml-1">
                        Retry
                      </button>
                    </td>
                  </tr>
                )}
                {!searchLoading && !searchError && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      {hasActiveFilters ? "No appointments match these filters" : "No appointments found"}
                    </td>
                  </tr>
                )}
                {!searchLoading &&
                  !searchError &&
                  rows.map((row) => (
                    <tr key={row.appointmentId} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.patientName}</p>
                        <p className="text-xs text-gray-400">
                          {row.patientCode} · {row.patientPhone || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{row.appointmentCode}</p>
                        <p className="text-xs text-gray-400">{new Date(row.scheduledAt).toLocaleString("en-IN")}</p>
                      </td>
                      <td className="px-4 py-3">{row.doctorName}</td>
                      <td className="px-4 py-3 tabular-nums">{row.paymentAmount ? money(row.paymentAmount) : "-"}</td>
                      <td className="px-4 py-3 tabular-nums">{row.paymentId ? money(row.refundedAmount) : "-"}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">{row.paymentId ? money(row.remainingAmount) : "-"}</td>
                      <td className="px-4 py-3">
                        {row.paymentStatus ? <PaymentStatusBadge status={row.paymentStatus} /> : <span className="text-gray-400">No payment</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.isEligible ? (
                          <button
                            onClick={() => {
                              setSelected(row);
                              setPercentage(100);
                              setStep(2);
                            }}
                            className="text-emerald-600 hover:underline font-medium"
                          >
                            Select
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400" title={row.ineligibleReason}>
                            {row.ineligibleReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!searchLoading && !searchError && rows.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  {(page - 1) * pageSize + 1}-{Math.min(total, page * pageSize)} of {total}
                </span>
                <div className="flex items-center gap-3">
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
            )}
          </div>
        </div>
      )}

      {step === 2 && selected && (
        <div className={card}>
          <h3 className="font-semibold mb-4">Selected Payment Transaction</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row label="Patient Name" value={selected.patientName} />
            <Row label="Patient ID" value={selected.patientCode} />
            <Row label="Mobile Number" value={selected.patientPhone} />
            <Row label="Appointment ID" value={selected.appointmentCode} />
            <Row label="Doctor" value={`${selected.doctorName} (${selected.doctorSpecialty})`} />
            <Row label="Appointment Date" value={new Date(selected.scheduledAt).toLocaleString("en-IN")} />
            <Row label="Payment ID" value={selected.providerPaymentId || selected.providerOrderId} />
            <Row label="Payment Date" value={selected.capturedAt ? new Date(selected.capturedAt).toLocaleString("en-IN") : "-"} />
            <Row label="Original Payment Amount" value={money(selected.paymentAmount)} />
            <Row label="Previously Refunded" value={money(selected.refundedAmount)} />
            <Row label="Remaining Refundable Amount" value={<span className="font-semibold text-emerald-700">{money(selected.remainingAmount)}</span>} />
            <Row label="Payment Status" value={<PaymentStatusBadge status={selected.paymentStatus} />} />
          </div>
          <div className="flex items-center justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <FiArrowLeft /> Choose a different appointment
            </button>
            <button
              onClick={goNext}
              disabled={!canGoToAmount}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Continue <FiArrowRight />
            </button>
          </div>
        </div>
      )}

      {step === 3 && selected && (
        <div className={card}>
          <h3 className="font-semibold mb-4">Refund Percentage</h3>
          <div className="flex flex-wrap gap-2 mb-5">
            {percentageOptions.map((p) => (
              <button
                key={p}
                onClick={() => setPercentage(p)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                  percentage === p ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Original Payment Amount</span>
              <span className="font-medium">{money(selected.paymentAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Previously Refunded Amount</span>
              <span className="font-medium">{money(selected.refundedAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Remaining Refundable Amount</span>
              <span className="font-medium">{money(remaining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Selected Refund Percentage</span>
              <span className="font-medium">{percentage}%</span>
            </div>
            <div className="h-px bg-gray-200 my-1" />
            <div className="flex justify-between">
              <span className="text-gray-700 font-semibold">Calculated Refund Amount</span>
              <span className="font-bold text-emerald-700">{money(refundAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Remaining Balance After Refund</span>
              <span className="font-medium">{money(balanceAfter)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <FiArrowLeft /> Back
            </button>
            <button
              onClick={goNext}
              disabled={!canGoToReason}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Continue <FiArrowRight />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className={card}>
          <h3 className="font-semibold mb-4">Refund Reason</h3>
          <div className="space-y-2 mb-4">
            {reasonOptions.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-emerald-600" />
                {r}
              </label>
            ))}
          </div>
          <label className={label}>{reason === "Other" ? "Please specify (required)" : "Additional note (optional)"}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={reason === "Other" ? "Describe the reason for this refund" : "Any extra detail for the record"}
            className={inputClass}
          />

          <div className="flex items-center justify-between mt-6">
            <button onClick={goBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <FiArrowLeft /> Back
            </button>
            <button
              onClick={goNext}
              disabled={!canGoToReview}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Continue <FiArrowRight />
            </button>
          </div>
        </div>
      )}

      {step === 5 && selected && (
        <div className={card}>
          <h3 className="font-semibold mb-4">Review Refund</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
            <Row label="Patient" value={`${selected.patientName} (${selected.patientCode})`} />
            <Row label="Appointment" value={selected.appointmentCode} />
            <Row label="Payment ID" value={selected.providerPaymentId || selected.providerOrderId} />
            <Row label="Original Amount" value={money(selected.paymentAmount)} />
            <Row label="Refund Percentage" value={`${percentage}%`} />
            <Row label="Refund Reason" value={reason} />
            {note.trim() && <Row label="Note" value={note.trim()} />}
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-center justify-between">
            <span className="font-semibold text-emerald-900">Amount to Refund</span>
            <span className="text-xl font-bold text-emerald-900">{money(refundAmount)}</span>
          </div>

          {submitError && <p className="text-red-600 text-sm mt-4">{submitError}</p>}

          <div className="flex items-center justify-between mt-6">
            <button onClick={goBack} disabled={busy} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <FiArrowLeft /> Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? <ClipLoader size={18} color="white" /> : "Confirm and Issue Refund"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label: text, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{text}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value ?? "-"}</span>
    </div>
  );
}

export default IssueRefund;
