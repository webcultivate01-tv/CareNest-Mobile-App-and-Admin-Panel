import { useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import {
  FiEye,
  FiEyeOff,
  FiKey,
  FiMail,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiSlash,
  FiUnlock,
  FiUser,
  FiUserCheck,
  FiUsers,
} from "react-icons/fi";
import { FaCrown } from "react-icons/fa";
import { serverUrl } from "../App";
import { setAdminListData } from "../redux/adminSlice";
import { DEFAULT_MODULES } from "../modules";
import {
  AdminActionDialog,
  Avatar,
  Dialog,
  Field,
  IconAction,
  ModulePicker,
  ResetPasswordDialog,
  formatDate,
  generatePassword,
  inputClass,
  primaryButton,
  secondaryButton,
  showError,
  showSuccess,
} from "../components/AdminUI";

const ROLE_TABS = [
  { key: "all", label: "All Members" },
  { key: "admin", label: "Admin" },
  { key: "subadmin", label: "Sub-admins" },
];

const emptyCreateForm = { name: "", phone: "", email: "", password: "", permissions: DEFAULT_MODULES };

function Admins() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { adminData, adminListData } = useSelector((state) => state.admin);
  const isOwner = adminData?.role === "admin";

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [action, setAction] = useState(null); // { type: "block" | "unblock", admin }

  const counts = useMemo(
    () => ({
      all: adminListData.length,
      admin: adminListData.filter((a) => a.role === "admin").length,
      subadmin: adminListData.filter((a) => a.role !== "admin").length,
      blocked: adminListData.filter((a) => a.isBlocked).length,
    }),
    [adminListData]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return adminListData.filter((a) => {
      if (tab === "admin" && a.role !== "admin") return false;
      if (tab === "subadmin" && a.role === "admin") return false;
      return (
        !term ||
        a.name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        (a.phone || "").includes(term)
      );
    });
  }, [adminListData, tab, search]);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await axios.post(serverUrl + "/api/admin/create", createForm, { withCredentials: true });
      dispatch(setAdminListData([...adminListData, result.data.admin]));
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
      showSuccess("Sub-admin Created Successfully");
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: "Total Members", value: counts.all, icon: <FiUsers /> },
    { label: "Admin", value: counts.admin, icon: <FaCrown /> },
    { label: "Sub-admins", value: counts.subadmin, icon: <FiShield /> },
    { label: "Blocked", value: counts.blocked, icon: <FiSlash /> },
  ];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-emerald-600 mb-1.5">ACCESS CONTROL</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Admin Management</h1>
          <p className="text-gray-500 mt-1">
            One admin owns this panel. Sub-admins help manage it and can be blocked or removed anytime.
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => {
              setCreateForm(emptyCreateForm);
              setShowPassword(false);
              setShowCreate(true);
            }}
            className={`${primaryButton} shrink-0`}
          >
            <FiPlus className="text-base" /> Add Sub-admin
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg shrink-0">
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-extrabold text-gray-900 leading-tight">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm shadow-gray-900/[0.02]">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 sm:p-5 border-b border-gray-100">
          <div className="inline-flex flex-wrap max-w-full p-1 rounded-xl bg-gray-100/80 self-start">
            {ROLE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.key === "admin" && <FaCrown className={tab === t.key ? "text-emerald-600 text-xs" : "text-xs"} />}
                {t.key === "subadmin" && <FiShield className={tab === t.key ? "text-emerald-600" : ""} />}
                {t.label}
                <span
                  className={`min-w-5 h-5 px-1.5 rounded-md text-[11px] flex items-center justify-center ${
                    tab === t.key ? "bg-emerald-50 text-emerald-700" : "bg-gray-200/70 text-gray-500"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or mobile"
              className="w-full h-10 pl-10 pr-3 rounded-xl border border-gray-200 bg-gray-50/60 text-sm outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        </div>

        <table className="w-full text-sm text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-gray-400">
              <th className="pl-5 pr-3 py-3 font-semibold">No</th>
              <th className="hidden sm:table-cell px-3 py-3 font-semibold">ID</th>
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="hidden sm:table-cell px-3 py-3 font-semibold">Mobile</th>
              <th className="hidden md:table-cell px-3 py-3 font-semibold">Email</th>
              <th className="hidden lg:table-cell px-3 py-3 font-semibold">Added</th>
              <th className="pl-3 pr-5 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((admin, index) => {
              const isMe = admin.id === adminData?.id;
              const isSub = admin.role !== "admin";
              return (
                <tr
                  key={admin.id}
                  className={`border-t border-gray-100 transition-colors hover:bg-gray-50/70 ${
                    admin.isBlocked ? "bg-gray-50/60" : ""
                  }`}
                >
                  <td className="pl-5 pr-3 py-3 tabular-nums text-gray-500">{index + 1}</td>
                  <td className="hidden sm:table-cell px-3 py-3">
                    <span className="text-sm font-bold text-emerald-900 tabular-nums whitespace-nowrap">{admin.code || index + 1}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar admin={admin} />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/admins/${admin.id}`)}
                            className="truncate hover:text-emerald-700 text-left"
                          >
                            {admin.name}
                          </button>
                          {isMe && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold tracking-wide">
                              YOU
                            </span>
                          )}
                          {admin.isBlocked && (
                            <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-bold tracking-wide">
                              BLOCKED
                            </span>
                          )}
                        </p>
                        {/* on phones the Mobile column is hidden, so the number stays under the name */}
                        <p className="sm:hidden text-gray-500 text-[13px] flex items-center gap-1.5 tabular-nums">
                          <FiPhone className="text-gray-400 text-xs" />
                          {admin.phone || <span className="text-gray-400">No mobile number</span>}
                        </p>
                        <p className="md:hidden text-gray-500 text-[13px] break-all">{admin.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-3 py-3 text-gray-700 whitespace-nowrap tabular-nums">
                    {admin.phone || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="hidden md:table-cell px-3 py-3 text-gray-700 break-all">{admin.email}</td>
                  <td className="hidden lg:table-cell px-3 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(admin.createdAt)}
                  </td>
                  <td className="pl-3 pr-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isOwner && (
                        <>
                          {admin.isBlocked ? (
                            <IconAction label="Unblock" onClick={() => setAction({ type: "unblock", admin })}>
                              <FiUnlock />
                            </IconAction>
                          ) : (
                            <IconAction
                              label={isSub ? "Block temporarily" : "Admin cannot be blocked"}
                              disabled={!isSub}
                              onClick={() => setAction({ type: "block", admin })}
                            >
                              <FiSlash />
                            </IconAction>
                          )}
                          <IconAction
                            label={isSub ? "Reset password" : "Use Profile to change password"}
                            disabled={!isSub}
                            onClick={() => setResetTarget(admin)}
                          >
                            <FiKey />
                          </IconAction>
                        </>
                      )}
                      <IconAction label="View details" onClick={() => navigate(`/admins/${admin.id}`)}>
                        <FiEye />
                      </IconAction>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl mb-3">
                    <FiUsers />
                  </div>
                  <p className="font-semibold text-gray-700">No members found</p>
                  <p className="text-sm text-gray-400">
                    {search ? "Try a different name or email." : "Add a sub-admin to share the workload."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-gray-100 text-xs text-gray-400">
            Showing {filtered.length} of {adminListData.length} members
          </div>
        )}
      </div>

      {/* Add sub-admin */}
      {showCreate && (
        <Dialog
          title="Add Sub-admin"
          subtitle="Only one admin is allowed. New members join as sub-admins."
          icon={<FiUserCheck />}
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={handleCreateAdmin} className="px-6 pb-6 space-y-4">
            <Field label="Full name" icon={<FiUser />}>
              <input
                className={inputClass}
                placeholder="e.g. Priya Sharma"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </Field>
            <Field label="Mobile number" icon={<FiPhone />}>
              <input
                type="tel"
                className={inputClass}
                placeholder="e.g. +91 98765 43210"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              />
            </Field>
            <Field label="Email address" icon={<FiMail />}>
              <input
                type="email"
                className={inputClass}
                placeholder="name@carenest.com"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </Field>
            <Field label="Password" icon={<FiKey />}>
              <input
                type={showPassword ? "text" : "password"}
                className={`${inputClass} pr-20`}
                placeholder="Min 6 characters"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex">
                <button
                  type="button"
                  onClick={() => {
                    setCreateForm({ ...createForm, password: generatePassword() });
                    setShowPassword(true);
                  }}
                  className="p-2 rounded-lg text-gray-400 hover:text-emerald-600"
                  aria-label="Generate password"
                  title="Generate password"
                >
                  <FiRefreshCw />
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
            <ModulePicker
              value={createForm.permissions}
              onChange={(permissions) => setCreateForm({ ...createForm, permissions })}
            />
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs">
              <FiShield className="shrink-0" /> Role will be set to <b>Sub-admin</b>.
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className={`${secondaryButton} flex-1`}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={`${primaryButton} flex-1`}>
                {loading ? <ClipLoader size={18} color="white" /> : "Create Sub-admin"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {resetTarget && <ResetPasswordDialog admin={resetTarget} onClose={() => setResetTarget(null)} />}
      {action && <AdminActionDialog type={action.type} admin={action.admin} onClose={() => setAction(null)} />}
    </div>
  );
}

export default Admins;
