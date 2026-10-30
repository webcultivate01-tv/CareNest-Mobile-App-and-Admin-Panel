// Panel modules the admin can switch on or off per sub-admin (mirrors backend/config/modules.js).
// Admin Management is admin-only and Profile is open to everyone, so neither is listed here.
export const MODULES = [
  { key: "dashboard", label: "Dashboard", path: "/", description: "Overview stats and revenue" },
  { key: "doctors", label: "Doctors", path: "/doctors", description: "Doctor profiles and availability" },
  { key: "patients", label: "Patients", path: "/patients", description: "Patient records" },
  { key: "appointments", label: "Appointments", path: "/appointments", description: "Bookings, edits and cancellations" },
  { key: "queue", label: "Live Queue", path: "/queue", description: "Check in patients, call the next one and mark consultations complete" },
  { key: "payments", label: "Payments", path: "/payments", description: "Payment history and receipts" },
  { key: "refunds", label: "Refunds", path: "/refunds", description: "Refund status and history" },
  { key: "reports", label: "Reports", path: "/reports", description: "Analytics and reports" },
  { key: "marketing", label: "Marketing", path: "/marketing", description: "Send WhatsApp, SMS, email and app messages to patients" },
];

export const DEFAULT_MODULES = ["dashboard", "doctors", "patients", "appointments", "reports"];

export const STAFF_MODULES = ["dashboard", "patients", "appointments", "queue"];

export const roleLabel = (role) => (role === "admin" ? "Admin" : role === "staff" ? "Staff" : "Sub-admin");

export const hasModule = (admin, key) =>
  admin?.role === "admin" || Boolean(admin?.permissions?.includes(key));

// where to send someone who opens a page they cannot use
export const firstAllowedPath = (admin) =>
  MODULES.find((m) => hasModule(admin, m.key))?.path || "/profile";
