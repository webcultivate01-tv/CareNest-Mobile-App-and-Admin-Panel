import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { ClipLoader } from "react-spinners";
import { FiCopy, FiEye, FiEyeOff, FiKey, FiLock, FiRefreshCw, FiShield, FiSlash, FiTrash2, FiUnlock, FiX } from "react-icons/fi";
import { FaCrown } from "react-icons/fa";
import { serverUrl } from "../App";
import { setAdminData, setAdminListData } from "../redux/adminSlice";
import { MODULES } from "../modules";

// Shared building blocks for the Admin Management list and detail pages.

export const getInitials = (name) =>
  (name || "A")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

export const generatePassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*";
  const values = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
};

export const showError = (error) => {
  console.log(error);
  toast.error(error.response?.data?.message || "Something went wrong", { position: "top-center", autoClose: 2000 });
};

export const showSuccess = (message) => toast.success(message, { position: "top-center", autoClose: 1200 });

export const inputClass =
  "w-full h-11 pl-10 pr-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm outline-none transition focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";

export const primaryButton =
  "h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 disabled:opacity-70";

export const secondaryButton =
  "h-11 px-5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold flex items-center justify-center gap-2";

// keeps the list (and the signed-in admin, when it is them) in sync after an update
export const useReplaceAdmin = () => {
  const dispatch = useDispatch();
  const { adminData, adminListData } = useSelector((state) => state.admin);
  return (updated) => {
    dispatch(setAdminListData(adminListData.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))));
    if (updated.id === adminData?.id) dispatch(setAdminData({ ...adminData, ...updated }));
  };
};

export function Avatar({ admin, size = "md" }) {
  const sizes = { md: "w-10 h-10 text-sm", lg: "w-24 h-24 text-3xl" };
  return (
    <div className="relative shrink-0">
      <div
        className={`${sizes[size]} rounded-full font-bold flex items-center justify-center ring-2 ring-white ${
          admin.isBlocked
            ? "bg-gray-200 text-gray-500"
            : admin.role === "admin"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {getInitials(admin.name)}
      </div>
      {admin.role === "admin" && (
        <span
          className={`absolute rounded-full bg-white shadow flex items-center justify-center ${
            size === "lg" ? "top-0 right-0 w-7 h-7" : "-top-1 -right-1 w-5 h-5"
          }`}
        >
          <FaCrown className={`text-emerald-600 ${size === "lg" ? "text-sm" : "text-[10px]"}`} />
        </span>
      )}
    </div>
  );
}

export function RoleBadge({ role }) {
  return role === "admin" ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
      <FaCrown className="text-[10px]" /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 text-xs font-semibold">
      <FiShield className="text-[11px]" /> Sub-admin
    </span>
  );
}

export function StatusBadge({ isBlocked }) {
  return isBlocked ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Blocked
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
      <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
        <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
      </span>
      Active
    </span>
  );
}

export function IconAction({ label, onClick, disabled, children }) {
  return (
    <div className="relative group/action">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center transition-colors text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 disabled:hover:border-gray-200"
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 px-2 py-1 rounded-md bg-gray-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 translate-y-1 group-hover/action:opacity-100 group-hover/action:translate-y-0 transition-all z-10">
        {label}
      </span>
    </div>
  );
}

// Rendered into <body> through a portal: page wrappers use a transform animation, which would
// otherwise trap this fixed overlay inside the content area instead of covering the whole screen.
export function Dialog({ title, subtitle, icon, onClose, children }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md max-h-[92vh] overflow-auto bg-white rounded-2xl shadow-2xl shadow-gray-900/20 ring-1 ring-gray-900/5 animate-pop-in"
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4">
          {icon && (
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg shrink-0 bg-emerald-50 text-emerald-600">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, icon, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      <span className="relative block">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        {children}
      </span>
    </label>
  );
}

const emptyResetForm = { newPassword: "", confirmPassword: "" };

export function ResetPasswordDialog({ admin, onClose }) {
  const [form, setForm] = useState(emptyResetForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const copy = async (password, message) => {
    try {
      await navigator.clipboard.writeText(password);
      showSuccess(message);
    } catch {
      // clipboard can be unavailable on insecure origins; the password is still visible
    }
  };

  const handleGenerate = () => {
    const password = generatePassword();
    setForm({ newPassword: password, confirmPassword: password });
    setShowPassword(true);
    copy(password, "Password generated & copied");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error("Passwords do not match", { position: "top-center", autoClose: 2000 });
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        serverUrl + `/api/admin/resetpassword/${admin.id}`,
        { newPassword: form.newPassword },
        { withCredentials: true }
      );
      showSuccess("Password Reset Successfully");
      onClose();
    } catch (error) {
      showError(error);
      setLoading(false);
    }
  };

  return (
    <Dialog title="Reset Password" subtitle={`Set a new password for ${admin.name}.`} icon={<FiKey />} onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
        <Field label="New password" icon={<FiLock />}>
          <input
            type={showPassword ? "text" : "password"}
            className={`${inputClass} pr-20 font-mono`}
            placeholder="Min 6 characters"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex">
            <button
              type="button"
              onClick={() => copy(form.newPassword, "Copied")}
              disabled={!form.newPassword}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-40"
              aria-label="Copy password"
            >
              <FiCopy />
            </button>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </span>
        </Field>
        <Field label="Confirm password" icon={<FiLock />}>
          <input
            type={showPassword ? "text" : "password"}
            className={`${inputClass} font-mono`}
            placeholder="Re-enter password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </Field>
        <button
          type="button"
          onClick={handleGenerate}
          className="w-full h-10 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/50 flex items-center justify-center gap-2"
        >
          <FiRefreshCw /> Generate strong password
        </button>
        <p className="text-xs text-gray-400">Share the new password with the sub-admin securely.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={`${secondaryButton} flex-1`}>
            Cancel
          </button>
          <button type="submit" disabled={loading} className={`${primaryButton} flex-1`}>
            {loading ? <ClipLoader size={18} color="white" /> : "Reset Password"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const actionCopy = {
  block: {
    title: "Block sub-admin?",
    text: "They will be signed out right away and cannot sign in until you unblock them.",
    button: "Block Access",
    icon: <FiSlash />,
  },
  unblock: {
    title: "Unblock sub-admin?",
    text: "They will be able to sign in to the admin panel again.",
    button: "Unblock",
    icon: <FiUnlock />,
  },
  remove: {
    title: "Remove sub-admin?",
    text: "This permanently deletes the account. This cannot be undone.",
    button: "Remove Permanently",
    icon: <FiTrash2 />,
  },
};

// type: "block" | "unblock" | "remove"; onDone runs after a successful action
export function AdminActionDialog({ type, admin, onClose, onDone }) {
  const dispatch = useDispatch();
  const { adminListData } = useSelector((state) => state.admin);
  const replaceAdmin = useReplaceAdmin();
  const [loading, setLoading] = useState(false);
  const copy = actionCopy[type];

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (type === "remove") {
        await axios.delete(serverUrl + `/api/admin/remove/${admin.id}`, { withCredentials: true });
        dispatch(setAdminListData(adminListData.filter((a) => a.id !== admin.id)));
        showSuccess("Sub-admin Removed Successfully");
      } else {
        const result = await axios.post(
          serverUrl + `/api/admin/block/${admin.id}`,
          { isBlocked: type === "block" },
          { withCredentials: true }
        );
        replaceAdmin(result.data.admin);
        showSuccess(type === "block" ? "Sub-admin Blocked" : "Sub-admin Unblocked");
      }
      onClose();
      onDone?.();
    } catch (error) {
      showError(error);
      setLoading(false);
    }
  };

  return (
    <Dialog title={copy.title} icon={copy.icon} onClose={onClose}>
      <div className="px-6 pb-6">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 mb-4">
          <Avatar admin={admin} />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{admin.name}</p>
            <p className="text-xs text-gray-500 truncate">{admin.email}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">{copy.text}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className={`${secondaryButton} flex-1`}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading} className={`${primaryButton} flex-1`}>
            {loading ? <ClipLoader size={18} color="white" /> : copy.button}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// checklist of panel modules; `value` is the list of enabled module keys
export function ModulePicker({ value, onChange, disabled }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">Module access</p>
        <div className="flex gap-3 text-xs font-semibold">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(MODULES.map((m) => m.key))}
            className="text-emerald-700 hover:underline disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-gray-500 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODULES.map((m) => {
          const on = value.includes(m.key);
          return (
            <label
              key={m.key}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                on ? "border-emerald-300 bg-emerald-50/60" : "border-gray-200 hover:bg-gray-50"
              } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(m.key)}
                className="mt-0.5 w-4 h-4 accent-emerald-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">{m.label}</span>
                <span className="block text-xs text-gray-500">{m.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
