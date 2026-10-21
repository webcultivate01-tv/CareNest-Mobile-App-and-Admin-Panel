import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiHash,
  FiKey,
  FiMail,
  FiPhone,
  FiShield,
  FiSlash,
  FiTrash2,
  FiUnlock,
  FiUser,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import { FaCrown } from "react-icons/fa";
import { serverUrl } from "../App";
import { MODULES } from "../modules";
import {
  AdminActionDialog,
  Avatar,
  Field,
  ModulePicker,
  ResetPasswordDialog,
  RoleBadge,
  StatusBadge,
  formatDate,
  formatDateTime,
  inputClass,
  primaryButton,
  secondaryButton,
  showError,
  showSuccess,
  useReplaceAdmin,
} from "../components/AdminUI";


function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-4 py-4 border-t border-gray-100 first:border-t-0">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="mt-0.5 text-[15px] font-semibold text-gray-900 break-all">{children}</p>
      </div>
    </div>
  );
}

function AdminDetail() {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const replaceAdmin = useReplaceAdmin();
  const { adminData, adminListData } = useSelector((state) => state.admin);
  const isOwner = adminData?.role === "admin";
  const admin = adminListData.find((a) => String(a.id) === adminId);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [action, setAction] = useState(null); // "block" | "unblock" | "remove"
  const [editingAccess, setEditingAccess] = useState(false);
  const [accessDraft, setAccessDraft] = useState([]);

  const resetForm = () => admin && setForm({ name: admin.name, phone: admin.phone || "", email: admin.email });

  useEffect(() => {
    setEditing(false);
    setEditingAccess(false);
    setAccessDraft(admin?.permissions || []);
    resetForm();
  }, [admin?.id]);

  // the list always contains the signed-in admin, so empty means it is still loading
  if (adminListData.length === 0) {
    return (
      <div className="py-24 flex justify-center">
        <ClipLoader size={36} color="#059669" />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl mb-3">
          <FiUser />
        </div>
        <p className="font-semibold text-gray-800">Member not found</p>
        <p className="text-sm text-gray-500 mb-5">This account may have been removed.</p>
        <Link to="/admins" className={`${secondaryButton} inline-flex`}>
          <FiArrowLeft /> Back to Admin Management
        </Link>
      </div>
    );
  }

  const isSub = admin.role !== "admin";
  const isMe = admin.id === adminData?.id;
  const canManage = isOwner && isSub;

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post(serverUrl + `/api/admin/edit/${admin.id}`, form, { withCredentials: true });
      replaceAdmin(result.data.admin);
      setEditing(false);
      showSuccess("Details Updated Successfully");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccess = async () => {
    setLoading(true);
    try {
      const result = await axios.post(
        serverUrl + `/api/admin/permissions/${admin.id}`,
        { permissions: accessDraft },
        { withCredentials: true }
      );
      replaceAdmin(result.data.admin);
      setEditingAccess(false);
      showSuccess("Module access updated");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-up max-w-6xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <Link to="/admins" className="flex items-center gap-1.5 font-medium hover:text-emerald-700">
          <FiArrowLeft /> Admin Management
        </Link>
        <FiChevronRight className="text-gray-300" />
        <span className="text-gray-900 font-semibold truncate">{admin.name}</span>
      </nav>

      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="h-32 bg-emerald-600 relative">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />
        </div>
        <div className="px-5 sm:px-8 pb-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6 -mt-12">
            <div className="p-1.5 rounded-full bg-white self-start">
              <Avatar admin={admin} size="lg" />
            </div>
            <div className="flex-1 min-w-0 md:pb-1">
              <h1 className="text-2xl font-extrabold text-gray-900 flex flex-wrap items-center gap-2">
                <span className="break-words">{admin.name}</span>
                {isMe && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold tracking-wide">
                    YOU
                  </span>
                )}
              </h1>
              <p className="text-gray-500 text-sm break-all">{admin.email}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <RoleBadge role={admin.role} />
                <StatusBadge isBlocked={admin.isBlocked} />
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2 md:pb-1">
                <button onClick={() => setShowReset(true)} className={`${secondaryButton} h-10 px-4`}>
                  <FiKey /> Reset Password
                </button>
                <button
                  onClick={() => setAction(admin.isBlocked ? "unblock" : "block")}
                  className={`${admin.isBlocked ? primaryButton : secondaryButton} h-10 px-4`}
                >
                  {admin.isBlocked ? (
                    <>
                      <FiUnlock /> Unblock
                    </>
                  ) : (
                    <>
                      <FiSlash /> Block
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {admin.isBlocked && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-600 mb-6">
          <FiAlertTriangle className="text-gray-400 mt-0.5 shrink-0" />
          <p>
            <b className="text-gray-800">Access is blocked.</b> This sub-admin was signed out and cannot sign in until
            unblocked.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal details */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200">
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Personal Details</h2>
              <p className="text-xs text-gray-500">Contact information for this member.</p>
            </div>
            {isOwner && !editing && (
              <button onClick={() => setEditing(true)} className={`${secondaryButton} h-9 px-3.5`}>
                <FiEdit2 /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" icon={<FiUser />}>
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Mobile number" icon={<FiPhone />}>
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="e.g. +91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Email address" icon={<FiMail />}>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    resetForm();
                  }}
                  className={secondaryButton}
                >
                  <FiX /> Cancel
                </button>
                <button type="submit" disabled={loading} className={`${primaryButton} min-w-36`}>
                  {loading ? (
                    <ClipLoader size={18} color="white" />
                  ) : (
                    <>
                      <FiCheck /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-5 sm:px-6 py-2">
              <InfoRow icon={<FiUser />} label="Full name">
                {admin.name}
              </InfoRow>
              <InfoRow icon={<FiPhone />} label="Mobile number">
                {admin.phone || <span className="text-gray-400 font-medium">Not added</span>}
              </InfoRow>
              <InfoRow icon={<FiMail />} label="Email address">
                {admin.email}
              </InfoRow>
            </div>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Account</h2>
            <dl className="space-y-3.5 text-sm">
              {[
                { icon: <FiHash />, label: "Account ID", value: admin.code || `#${String(admin.id).padStart(4, "0")}` },
                { icon: <FiShield />, label: "Role", value: isSub ? "Sub-admin" : "Admin" },
                { icon: <FiCalendar />, label: "Member since", value: formatDate(admin.createdAt) },
                { icon: <FiClock />, label: "Last updated", value: formatDateTime(admin.updatedAt) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-gray-500">
                    <span className="text-gray-400">{item.icon}</span>
                    {item.label}
                  </dt>
                  <dd className="font-semibold text-gray-900 text-right">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-gray-900 mb-1">Module access</h2>
              {canManage && !editingAccess && (
                <button onClick={() => setEditingAccess(true)} className="text-xs font-semibold text-emerald-700 hover:underline">
                  Edit
                </button>
              )}
            </div>
            {isSub ? (
              editingAccess ? (
                <div className="mt-3 space-y-4">
                  <ModulePicker value={accessDraft} onChange={setAccessDraft} />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setEditingAccess(false);
                        setAccessDraft(admin.permissions || []);
                      }}
                      className={`${secondaryButton} flex-1 h-10`}
                    >
                      Cancel
                    </button>
                    <button onClick={handleSaveAccess} disabled={loading} className={`${primaryButton} flex-1 h-10`}>
                      {loading ? <ClipLoader size={16} color="white" /> : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-4">
                    {admin.isBlocked ? "No access while blocked." : "Sections this sub-admin can open."}
                  </p>
                  <ul className="space-y-2.5">
                    {MODULES.map((m) => {
                      const has = (admin.permissions || []).includes(m.key);
                      return (
                        <li key={m.key} className="flex items-center gap-2.5 text-sm">
                          {has ? (
                            <FiCheckCircle className={admin.isBlocked ? "text-gray-300" : "text-emerald-600"} />
                          ) : (
                            <FiXCircle className="text-gray-300" />
                          )}
                          <span className={has && !admin.isBlocked ? "text-gray-700" : "text-gray-400 line-through"}>
                            {m.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )
            ) : (
              <p className="text-sm text-gray-600 flex items-start gap-2.5 mt-3">
                <FaCrown className="text-emerald-600 mt-0.5 shrink-0" />
                Full access to every module, including managing sub-admins. This account cannot be blocked or removed.
              </p>
            )}
          </div>

          {canManage && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h2 className="text-base font-bold text-gray-900 mb-1">Remove Account</h2>
              <p className="text-xs text-gray-500 mb-4">Permanently delete this sub-admin. This cannot be undone.</p>
              <button onClick={() => setAction("remove")} className={`${secondaryButton} w-full`}>
                <FiTrash2 /> Remove Sub-admin
              </button>
            </div>
          )}
        </div>
      </div>

      {showReset && <ResetPasswordDialog admin={admin} onClose={() => setShowReset(false)} />}
      {action && (
        <AdminActionDialog
          type={action}
          admin={admin}
          onClose={() => setAction(null)}
          onDone={action === "remove" ? () => navigate("/admins") : undefined}
        />
      )}
    </div>
  );
}

export default AdminDetail;
