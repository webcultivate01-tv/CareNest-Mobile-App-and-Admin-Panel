import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiArrowLeft, FiCopy } from "react-icons/fi";
import { serverUrl } from "../App";
import Modal from "../components/Modal";
import PaymentStatusBadge from "../components/PaymentStatusBadge";

const money = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN") : "-");

const eventLabels = {
  "payment.captured": "Payment captured",
  "payment.failed": "Payment failed",
  "refund.processed": "Refund processed",
  "refund.pending": "Refund processing",
  "refund.created": "Refund submitted",
  "refund.failed": "Refund failed",
};

function CopyField({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 font-mono truncate max-w-[180px]">{value}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value);
            toast.success("Copied to clipboard", { position: "top-center", autoClose: 1000 });
          }}
          className="text-gray-400 hover:text-emerald-600"
          aria-label={`Copy ${label}`}
        >
          <FiCopy size={14} />
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value ?? "-"}</span>
    </div>
  );
}

// Full page for one payment (opened from the Payments table). The refund confirmation reuses the
// shared Modal, same as Appointments.jsx.
function PaymentDetail() {
  const navigate = useNavigate();
  const { paymentId } = useParams();
  const { adminData } = useSelector((state) => state.admin);
  const canRefund = adminData?.role === "admin";
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const load = async () => {
    try {
      const result = await axios.get(serverUrl + `/api/payment/${paymentId}`, { withCredentials: true });
      setDetail(result.data);
      setError("");
    } catch (e) {
      setError(e.response?.data?.message || "Something went wrong");
    }
  };

  useEffect(() => {
    load();
  }, [paymentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const payment = detail?.payment;
  const patient = detail?.patient;
  const remaining = payment ? Number(payment.amount) - Number(payment.refundedAmount) : 0;

  const handleReconcile = async () => {
    setBusy(true);
    try {
      const result = await axios.post(serverUrl + `/api/payment/reconcile/${paymentId}`, {}, { withCredentials: true });
      toast.success(result.data.message || "Reconciled", { position: "top-center", autoClose: 1500 });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 });
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await axios.post(
        serverUrl + `/api/payment/refund/${paymentId}`,
        { amount: refundAmount || undefined, reason: refundReason || undefined },
        { withCredentials: true }
      );
      const toastFn = result.data.refundStatus === "failed" ? toast.error : toast.success;
      toastFn(result.data.message || "Refund submitted", { position: "top-center", autoClose: 1500 });
      setShowRefund(false);
      setRefundAmount("");
      setRefundReason("");
      await load();
    } catch (e2) {
      toast.error(e2.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2500 });
    } finally {
      setBusy(false);
    }
  };

  const section = "text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1";
  const card = "bg-white border border-gray-200 rounded-xl p-5";

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/payments")}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4"
      >
        <FiArrowLeft /> Back to Payments
      </button>
      <h1 className="text-2xl font-semibold mb-5">Transaction Details</h1>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {!detail && !error && (
        <div className="flex justify-center py-10">
          <ClipLoader size={28} color="#059669" />
        </div>
      )}

      {payment && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div className={card}>
              <div className="flex items-center justify-between">
                <PaymentStatusBadge status={payment.status} />
                <span className="text-2xl font-bold text-gray-900">{money(payment.amount)}</span>
              </div>

              <h3 className={`${section} mt-5`}>Identifiers</h3>
              <CopyField label="Transaction ID" value={payment.providerPaymentId} />
              <CopyField label="Order ID" value={payment.providerOrderId} />
              <Row label="Internal Payment ID" value={payment.id} />

              <h3 className={`${section} mt-5`}>Payment</h3>
              <Row label="Provider" value="Razorpay" />
              <Row label="Method" value={payment.method || "-"} />
              <Row label="Currency" value={payment.currency} />
              <Row label="Created" value={when(payment.createdAt)} />
              <Row label="Captured" value={when(payment.capturedAt)} />
              {Number(payment.refundedAmount) > 0 && (
                <>
                  <Row label="Refunded Amount" value={money(payment.refundedAmount)} />
                  <Row label="Refunded At" value={when(payment.refundedAt)} />
                </>
              )}
              {payment.failureReason && <Row label="Failure Reason" value={payment.failureReason} />}
            </div>

            {detail.events?.length > 0 && (
              <div className={card}>
                <h3 className={`${section} mb-3`}>Status History</h3>
                <div className="space-y-2">
                  {detail.events.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{eventLabels[ev.type] || ev.type}</span>
                      <span className="text-gray-400">{when(ev.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className={card}>
              <h3 className={`${section} mb-3`}>Patient Details</h3>
              <div className="flex items-center gap-3 mb-2">
                {patient?.photo ? (
                  <img src={patient.photo} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-semibold">
                    {(patient?.name || payment.patientName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900">{patient?.name || payment.patientName}</p>
                </div>
              </div>
              <Row label="Patient ID" value={payment.patientCode} />
              <Row label="Patient Name" value={patient?.name || payment.patientName} />
              <Row label="Mobile Number" value={patient?.phone || payment.patientPhone} />
              <Row label="Email" value={patient?.email || payment.patientEmail} />
              <Row label="Date of Birth" value={patient?.dob} />
              <Row
                label="Date of Joining"
                value={patient?.createdAt ? new Date(patient.createdAt).toLocaleDateString("en-IN") : "-"}
              />
            </div>

            <div className={card}>
              <h3 className={`${section} mb-1`}>Appointment</h3>
              <Row label="Doctor" value={`${payment.doctorName} (${payment.doctorSpecialty})`} />
              <Row label="Appointment ID" value={payment.appointmentCode} />
              <Row label="Appointment Date" value={when(payment.appointmentScheduledAt)} />
              <Row label="Appointment Status" value={payment.appointmentStatus} />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate("/appointments")}
                className="w-full border border-gray-300 bg-white rounded-lg h-10 text-sm font-medium hover:bg-gray-50"
              >
                View Appointment
              </button>
              {payment.capturedAt && (
                <a
                  href={serverUrl + `/api/payment/${payment.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center border border-gray-300 bg-white rounded-lg h-10 flex items-center justify-center text-sm font-medium hover:bg-gray-50"
                >
                  Download Receipt
                </a>
              )}
              {["created", "pending", "failed"].includes(payment.status) && (
                <button
                  onClick={handleReconcile}
                  disabled={busy}
                  className="w-full border border-gray-300 bg-white rounded-lg h-10 text-sm font-medium hover:bg-gray-50 flex items-center justify-center"
                >
                  {busy ? <ClipLoader size={18} color="#374151" /> : "Reconcile with Razorpay"}
                </button>
              )}
              {canRefund && ["captured", "partially_refunded"].includes(payment.status) && (
                <button
                  onClick={() => setShowRefund(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg h-10 text-sm font-medium"
                >
                  Refund Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showRefund && (
        <Modal title="Refund Payment" onClose={() => setShowRefund(false)}>
          <form onSubmit={handleRefund} className="space-y-3">
            <p className="text-sm text-gray-500">Refundable amount: {money(remaining)}</p>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              placeholder={`Full amount (${money(remaining)})`}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
            />
            <textarea
              placeholder="Reason (optional)"
              rows={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg h-10 flex items-center justify-center"
            >
              {busy ? <ClipLoader size={22} color="white" /> : "Confirm Refund"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default PaymentDetail;
