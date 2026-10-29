// Panel modules the admin can switch on or off for each sub-admin. The admin always has all of them.
// Admin Management is not listed: it stays admin-only. Profile is open to everyone.
export const MODULE_KEYS = ["dashboard", "doctors", "patients", "appointments", "queue", "payments", "refunds", "reports", "marketing"];

// what a sub-admin could use before access was configurable
export const DEFAULT_MODULES = ["dashboard", "doctors", "patients", "appointments", "reports"];

// keeps only known modules, once each, in panel order
export const cleanModules = (modules) =>
  Array.isArray(modules) ? MODULE_KEYS.filter((key) => modules.includes(key)) : [];
