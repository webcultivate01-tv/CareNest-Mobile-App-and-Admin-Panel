const styles = {
  captured: "bg-emerald-50 text-emerald-700",
  created: "bg-amber-50 text-amber-700",
  pending: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
  partially_refunded: "bg-indigo-50 text-indigo-700",
};

const labels = {
  captured: "Successful",
  created: "Pending",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
};

function PaymentStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status}
    </span>
  );
}

export default PaymentStatusBadge;
