const styles = {
  processing: "bg-amber-50 text-amber-700",
  processed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const labels = {
  processing: "Pending / Processing",
  processed: "Processed",
  failed: "Failed",
};

function RefundStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status}
    </span>
  );
}

export default RefundStatusBadge;
